"""Start-up and housekeeping for the operations platform."""
from __future__ import annotations

import threading
import time
import traceback

from .. import db
from . import actions, auth, core, incidents, pipeline, playbooks, schema, simulation, workers  # noqa: F401 - registers handlers

_tick: threading.Thread | None = None
_stop = threading.Event()
TICK_S = 2.0


def start() -> None:
    schema.migrate()
    auth.seed_users()
    playbooks.seed()
    if not db.one("SELECT 1 AS x FROM mock_world WHERE entity_id='SBX-DEMO-0001'"):
        simulation.seed_demo_world()
    workers.recover()
    workers.pool().start()
    global _tick
    if not (_tick and _tick.is_alive()):
        _stop.clear()
        _tick = threading.Thread(target=_loop, daemon=True, name="fixchain-tick")
        _tick.start()


def stop() -> None:
    _stop.set()
    workers.pool().stop()


def tick() -> None:
    actions.expire_stale()
    incidents.sync_engineering()
    now = db.now()
    breached = db.rows("SELECT id, incident_id, simulated, severity FROM tickets WHERE state NOT IN ('RESOLVED') AND "
                       "resolution_due IS NOT NULL AND resolution_due<? AND json_extract(extracted,'$.sla_breach') IS NULL "
                       "LIMIT 50", (now,))
    for t in breached:
        with db.tx() as c:
            c.execute("UPDATE tickets SET extracted=json_set(extracted,'$.sla_breach',?) WHERE id=?", (now, t["id"]))
        core.publish("sla.breached", f"{t['id']} passed its {t['severity']} demo resolution target", actor="orchestrator",
                     actor_type="agent", level="warn", ticket_id=t["id"], incident_id=t["incident_id"],
                     simulated=bool(t["simulated"]))


def _loop() -> None:
    while not _stop.is_set():
        try:
            tick()
        except Exception:  # noqa: BLE001 - housekeeping must never die
            db.log("ERROR", "ops.tick", traceback.format_exc()[-2000:])
        _stop.wait(TICK_S)
        time.sleep(0)
