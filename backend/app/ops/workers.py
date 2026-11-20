"""Durable task queue + elastic in-process worker pool.

- Tasks live in `agent_tasks` (SQLite), so queued work survives a restart; tasks left `running` by a crash are
  re-queued on startup (`recover()`).
- Enqueue is idempotent: the idempotency key is UNIQUE, so the same step is never queued twice.
- A supervisor thread sizes the pool from queue depth (MIN..MAX workers). These are real worker threads in ONE
  process - it is honest elasticity, not cloud autoscaling. The UI labels it accordingly.
- Failures retry with exponential backoff up to max_attempts, then the task is dead-lettered and the subject is
  escalated to a human by the registered failure hook.
"""
from __future__ import annotations

import math
import os
import threading
import time
import traceback
from typing import Callable

from .. import db
from . import core

MIN_WORKERS = int(os.getenv("FIXCHAIN_MIN_WORKERS", "1"))
MAX_WORKERS = int(os.getenv("FIXCHAIN_MAX_WORKERS", "12"))
TASKS_PER_WORKER = int(os.getenv("FIXCHAIN_TASKS_PER_WORKER", "15"))
TASK_TIMEOUT_S = int(os.getenv("FIXCHAIN_TASK_TIMEOUT", "120"))

Handler = Callable[[dict], dict | None]
_handlers: dict[str, tuple[str, Handler]] = {}
_on_dead: list[Callable[[dict, str], None]] = []
_claim_lock = threading.Lock()


class Retryable(Exception):
    """Raise for transient failures (timeouts, provider outages) - the task is retried with backoff."""


def handler(task_type: str, agent: str):
    def deco(fn: Handler) -> Handler:
        _handlers[task_type] = (agent, fn)
        return fn
    return deco


def on_dead_letter(fn: Callable[[dict, str], None]) -> None:
    _on_dead.append(fn)


def enqueue(task_type: str, subject_kind: str, subject_id: str, *, key: str | None = None, payload: dict | None = None,
            priority: int = 5, workflow_id: int | None = None, max_attempts: int = 3, delay_s: float = 0,
            simulated: bool = False) -> int | None:
    agent = _handlers[task_type][0] if task_type in _handlers else task_type
    key = key or f"{task_type}:{subject_kind}:{subject_id}"
    with db.tx() as c:
        cur = c.execute(
            "INSERT OR IGNORE INTO agent_tasks (workflow_id, agent, task_type, subject_kind, subject_id, priority, status,"
            " max_attempts, idempotency_key, payload, queued_at, not_before) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (workflow_id, agent, task_type, subject_kind, subject_id, priority, "queued", max_attempts, key,
             core.dumps(payload), db.now(), db.now() + delay_s))
        task_id = cur.lastrowid if cur.rowcount else None
    if task_id:
        _pool.kick()
    return task_id


def _claim(worker: str) -> dict | None:
    with _claim_lock, db.tx() as c:
        r = c.execute("SELECT * FROM agent_tasks WHERE status IN ('queued','retrying') AND not_before<=? "
                      "ORDER BY priority, id LIMIT 1", (db.now(),)).fetchone()
        if not r:
            return None
        c.execute("UPDATE agent_tasks SET status='running', attempts=attempts+1, worker=?, started_at=? WHERE id=?",
                  (worker, db.now(), r["id"]))
        t = dict(r)
        t["attempts"] += 1
        return t


def _run(task: dict, worker: str) -> None:
    agent, fn = _handlers.get(task["task_type"], (task["agent"], None))
    t0 = time.time()
    sim = bool((core.loads(task["payload"], {}) or {}).get("simulated"))
    subj = {"ticket_id": task["subject_id"]} if task["subject_kind"] == "ticket" else {"incident_id": task["subject_id"]}
    core.publish("agent.task.started", f"{agent} started {task['task_type']}", actor=agent, actor_type="agent",
                 workflow_id=task["workflow_id"], data={"task_id": task["id"], "task": task["task_type"], "worker": worker,
                                                        "attempt": task["attempts"]}, simulated=sim, **subj)
    try:
        if fn is None:
            raise RuntimeError(f"No handler registered for {task['task_type']}")
        result = fn({**task, "payload": core.loads(task["payload"], {}) or {}}) or {}
        ms = int((time.time() - t0) * 1000)
        with db.tx() as c:
            c.execute("UPDATE agent_tasks SET status='succeeded', result=?, finished_at=?, duration_ms=?, model=? WHERE id=?",
                      (core.dumps(result), db.now(), ms, result.get("_model"), task["id"]))
        core.publish("agent.task.completed", f"{agent} completed {task['task_type']} in {ms} ms", actor=agent,
                     actor_type="agent", workflow_id=task["workflow_id"],
                     data={"task_id": task["id"], "task": task["task_type"], "duration_ms": ms, "worker": worker},
                     simulated=sim, **subj)
    except Exception as exc:  # noqa: BLE001 - every failure must land in a visible, recoverable state
        ms = int((time.time() - t0) * 1000)
        err = f"{type(exc).__name__}: {exc}"
        final = task["attempts"] >= task["max_attempts"]
        backoff = min(30.0, 0.5 * (2 ** (task["attempts"] - 1)))
        with db.tx() as c:
            c.execute("UPDATE agent_tasks SET status=?, error=?, finished_at=?, duration_ms=?, not_before=? WHERE id=?",
                      ("dead" if final else "retrying", core.mask(err)[:1000], db.now(), ms, db.now() + backoff,
                       task["id"]))
        core.publish("agent.task.failed" if final else "agent.task.retrying",
                     f"{agent} {'failed' if final else 'will retry'} {task['task_type']}: {err[:200]}",
                     actor=agent, actor_type="agent", level="error" if final else "warn", workflow_id=task["workflow_id"],
                     data={"task_id": task["id"], "attempt": task["attempts"], "max_attempts": task["max_attempts"],
                           "backoff_s": None if final else backoff}, simulated=sim, **subj)
        if not isinstance(exc, Retryable):
            db.log("ERROR", "ops.worker", traceback.format_exc()[-3000:])
        if final:
            for hook in _on_dead:
                try:
                    hook(task, err)
                except Exception:  # noqa: BLE001
                    db.log("ERROR", "ops.worker", traceback.format_exc()[-2000:])


class Pool:
    def __init__(self) -> None:
        self._workers: dict[str, threading.Thread] = {}
        self._busy: set[str] = set()
        self._lock = threading.Lock()
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._seq = 0
        self.desired = MIN_WORKERS
        self.peak = 0
        self.paused = False
        self._supervisor: threading.Thread | None = None
        self._last_scale_event = (0, 0.0)

    # -------------------------------------------------------------- lifecycle
    def start(self) -> None:
        if self._supervisor and self._supervisor.is_alive():
            return
        self._stop.clear()
        self._supervisor = threading.Thread(target=self._supervise, daemon=True, name="fixchain-supervisor")
        self._supervisor.start()

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()

    def kick(self) -> None:
        self._wake.set()

    # -------------------------------------------------------------- scaling
    def depth(self) -> int:
        return db.one("SELECT COUNT(*) AS n FROM agent_tasks WHERE status IN ('queued','retrying')")["n"]

    def _supervise(self) -> None:
        while not self._stop.is_set():
            try:
                depth = self.depth()
                want = max(MIN_WORKERS, min(MAX_WORKERS, math.ceil(depth / TASKS_PER_WORKER) if depth else MIN_WORKERS))
                with self._lock:
                    alive = {k: t for k, t in self._workers.items() if t.is_alive()}
                    self._workers = alive
                    self.desired = want
                    while len(self._workers) < want:
                        self._seq += 1
                        name = f"w{self._seq}"
                        t = threading.Thread(target=self._work, args=(name,), daemon=True, name=f"fixchain-{name}")
                        self._workers[name] = t
                        t.start()
                    n = len(self._workers)
                    self.peak = max(self.peak, n)
                last_n, last_t = self._last_scale_event
                if n != last_n and time.time() - last_t > 0.5:
                    self._last_scale_event = (n, time.time())
                    core.publish("workers.scaled", f"Worker pool {last_n} → {n} (queue depth {depth})",
                                 actor="orchestrator", actor_type="agent",
                                 data={"workers": n, "queue_depth": depth, "min": MIN_WORKERS, "max": MAX_WORKERS})
            except Exception:  # noqa: BLE001
                db.log("ERROR", "ops.supervisor", traceback.format_exc()[-2000:])
            self._wake.wait(0.4)
            self._wake.clear()

    def _work(self, name: str) -> None:
        idle_since = time.time()
        while not self._stop.is_set():
            if self.paused:
                time.sleep(0.2)
                continue
            task = None
            try:
                task = _claim(name)
            except Exception:  # noqa: BLE001 - e.g. a transient "database is locked"
                time.sleep(0.2)
            if task:
                with self._lock:
                    self._busy.add(name)
                try:
                    _run(task, name)
                finally:
                    with self._lock:
                        self._busy.discard(name)
                idle_since = time.time()
                continue
            with self._lock:  # scale down: surplus idle workers exit
                if len(self._workers) > self.desired and time.time() - idle_since > 1.5:
                    self._workers.pop(name, None)
                    return
            time.sleep(0.15)

    def stats(self) -> dict:
        with self._lock:
            alive = [k for k, t in self._workers.items() if t.is_alive()]
            busy = len(self._busy)
        counts = {r["status"]: r["n"] for r in db.rows("SELECT status, COUNT(*) AS n FROM agent_tasks GROUP BY status")}
        rate = db.one("SELECT COUNT(*) AS n FROM agent_tasks WHERE status='succeeded' AND finished_at>=?",
                      (db.now() - 60,))["n"]
        return {"workers": len(alive), "busy": busy, "desired": self.desired, "peak": self.peak, "paused": self.paused,
                "min": MIN_WORKERS, "max": MAX_WORKERS, "queue_depth": counts.get("queued", 0) + counts.get("retrying", 0),
                "running": counts.get("running", 0), "succeeded": counts.get("succeeded", 0),
                "dead": counts.get("dead", 0), "tasks_per_min": rate,
                "label": "In-process worker threads (single server). Not cloud autoscaling."}


_pool = Pool()


def pool() -> Pool:
    return _pool


def recover() -> int:
    """Crash recovery: tasks that were running when the process died go back to the queue."""
    with db.tx() as c:
        n = c.execute("UPDATE agent_tasks SET status='retrying', worker=NULL, not_before=? WHERE status='running'",
                      (db.now(),)).rowcount
    if n:
        core.publish("workers.recovered", f"Re-queued {n} task(s) interrupted by a restart", actor="orchestrator",
                     actor_type="agent", level="warn")
    return n


def drain(timeout: float = 60.0) -> bool:
    """Block until no task is queued/running (used by tests and the simulation runner)."""
    end = time.time() + timeout
    while time.time() < end:
        r = db.one("SELECT COUNT(*) AS n FROM agent_tasks WHERE status IN ('queued','retrying','running')")
        if r["n"] == 0:
            return True
        _pool.kick()
        time.sleep(0.1)
    return False
