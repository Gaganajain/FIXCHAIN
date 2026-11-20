"""Simulation Lab - deterministic, seeded incident scenarios (A-E) at 50 / 100 / 300 tickets.

Everything created here is flagged `simulated=1` and labelled in the UI. Simulated tickets use the deterministic
offline understanding path (no LLM call per ticket). Scenarios A and B also drive REAL callbacks through the
simulated SimPay gateway and merchant runtime, so the engineering pipeline sees genuine evidence.
"""
from __future__ import annotations

import random
import threading
import time

from .. import db, gateway, merchant_runtime
from . import connectors, core, pipeline, tickets, workers

SCENARIOS = {
    "A": {"key": "upi_debit_not_credited", "title": "UPI payment failure",
          "description": "Customers report money debited but the merchant did not receive the payment.",
          "customer_type": "consumer", "engineering": True},
    "B": {"key": "soundbox_silent", "title": "Soundbox failure",
          "description": "Merchants report successful payments but their Soundbox does not announce them.",
          "customer_type": "merchant", "engineering": True},
    "C": {"key": "qr_not_accepting", "title": "Merchant QR failure",
          "description": "Merchants report their QR codes are not accepting payments.",
          "customer_type": "merchant", "engineering": False},
    "D": {"key": "settlement_delay", "title": "Settlement delay",
          "description": "Merchants report delayed settlements.", "customer_type": "merchant", "engineering": False},
    "E": {"key": "platform_outage", "title": "Platform outage",
          "description": "Complaints arrive across several services within a short window.",
          "customer_type": "consumer", "engineering": False},
}
SIZES = (50, 100, 300)
LOCALE_MIX = [("en", 0.4), ("hi", 0.35), ("mr", 0.25)]

TEXTS = {
    "A": {"en": ["₹{amt} was debited from my account but the merchant did not receive the payment. UTR {utr}",
                 "Money deducted ₹{amt} at {shop}, merchant says not received. Ref {utr}",
                 "Paid ₹{amt} by UPI, amount debited but not credited to the shop. {utr}"],
          "hi": ["Mere account se ₹{amt} debit ho gaye, lekin merchant ko payment nahi mila. UTR {utr}",
                 "मेरे खाते से {amt} रुपये कट गए पर दुकानदार को पैसे नहीं मिले। UTR {utr}",
                 "{shop} pe ₹{amt} ka payment kiya, paise kat gaye par merchant ko nahi mila {utr}"],
          "mr": ["माझ्या खात्यातून ₹{amt} पैसे कापले गेले पण व्यापाऱ्याला मिळाले नाहीत. UTR {utr}",
                 "{shop} ला ₹{amt} पाठवले, पैसे कापले पण दुकानदाराला पोहोचले नाहीत. {utr}"]},
    "A_noref": {"en": ["₹{amt} was debited from my account but the merchant did not receive the payment"],
                "hi": ["Mere account se ₹{amt} debit ho gaye, lekin merchant ko payment nahi mila"],
                "mr": ["माझ्या खात्यातून ₹{amt} पैसे कापले गेले पण व्यापाऱ्याला मिळाले नाहीत"]},
    "fraud": {"en": ["There is an unknown transaction of ₹{amt} on my account, I did not make it. Is this fraud?"],
              "hi": ["Mere account se ₹{amt} ka transaction hua jo maine nahi kiya, fraud lag raha hai"],
              "mr": ["माझ्या खात्यातून ₹{amt} चा व्यवहार झाला जो मी केले नाही, फसवणूक वाटते"]},
    "B": {"en": ["Payments are coming in but my Soundbox is not announcing them",
                 "Soundbox stopped announcing payments since morning, customers have paid",
                 "My sound box is not speaking when payment is received"],
          "hi": ["Payment aa raha hai par Soundbox bol nahi raha", "साउंडबॉक्स पेमेंट की आवाज़ नहीं दे रहा, ग्राहक ने पैसे दे दिए",
                 "Subah se soundbox payment announce nahi kar raha"],
          "mr": ["पेमेंट येत आहे पण साउंडबॉक्स बोलत नाही", "सकाळपासून साउंडबॉक्स पेमेंटची घोषणा करत नाही, आवाज येत नाही"]},
    "C": {"en": ["Customers can't pay - my QR code is not accepting payments", "QR scan shows error, payment not going through"],
          "hi": ["QR scan karne par payment nahi ho raha", "मेरे QR कोड से ग्राहक पेमेंट नहीं कर पा रहे, स्कैन होता है पर पैसे नहीं आते"],
          "mr": ["QR कोड स्कॅन होतो पण पेमेंट जात नाही", "ग्राहक QR स्कॅन करतात पण पेमेंट होत नाही"]},
    "D": {"en": ["My settlement for yesterday has not come to my bank account", "Settlement delayed, payout not received"],
          "hi": ["Kal ka settlement abhi tak account me nahi aaya", "मेरा सेटलमेंट अभी तक खाते में नहीं आया"],
          "mr": ["कालचे सेटलमेंट अजून खात्यात जमा झाले नाही", "माझे सेटलमेंट खात्यात जमा झाले नाही"]},
    "E": {"en": ["App not working, payment shows server error", "UPI payments failing with error 503, app not loading",
                 "QR payments not going through, app not working"],
          "hi": ["App nahi chal raha, payment me server error aa raha hai", "ऐप नहीं चल रहा, पेमेंट नहीं हो रहा"],
          "mr": ["ॲप चालत नाही, पेमेंट होत नाही", "ॲप चालत नाही आणि UPI पेमेंट अडकले"]},
}
REGIONS = {"A": [("West", "Pune"), ("West", "Mumbai"), ("North", "Delhi"), ("South", "Bengaluru")],
           "B": [("North", "Lucknow"), ("North", "Kanpur"), ("North", "Varanasi"), ("West", "Nagpur")],
           "C": [("West", "Pune"), ("West", "Mumbai"), ("West", "Nashik")],
           "D": [("South", "Chennai"), ("South", "Hyderabad"), ("West", "Pune")],
           "E": [("North", "Delhi"), ("West", "Mumbai"), ("South", "Bengaluru"), ("East", "Kolkata")]}
SHOPS = ["Sharma General Store", "Patil Kirana", "Annapurna Sweets", "City Medicals", "Gupta Mobile Point",
         "Lakshmi Textiles", "Fresh Mart", "Joshi Dairy", "Royal Bakery", "Om Sai Hardware"]
AMOUNTS = [120, 250, 499, 500, 750, 1200, 1499, 2000, 3450, 5000]

_state = {"thread": None, "paused": threading.Event(), "stop": threading.Event(), "run_id": None}


def _pick(rng: random.Random, weights: list[tuple[str, float]]) -> str:
    x, acc = rng.random(), 0.0
    for k, w in weights:
        acc += w
        if x < acc:
            return k
    return weights[-1][0]


def _plan(scenario: str, size: int, seed: int) -> dict:
    """Pure, deterministic plan: identical (scenario, size, seed) → identical tickets and world."""
    rng = random.Random(f"{scenario}:{size}:{seed}")
    merchants, customers, items, world = [], [], [], []
    regions = REGIONS[scenario]
    if scenario == "A":
        shops = [(f"{SHOPS[i % len(SHOPS)]}", regions[i % len(regions)]) for i in range(20)]
        for i, (name, (reg, city)) in enumerate(shops):
            merchants.append({"name": name, "region": reg, "city": city, "device_id": None, "device_model": None,
                              "qr_id": f"QR-A{seed}-{i:03d}"})
    for n in range(size):
        locale = _pick(rng, LOCALE_MIX)
        item = {"locale": locale, "delay": n / max(1, size)}
        if scenario == "A":
            mi = rng.randrange(20)
            amt = rng.choice(AMOUNTS)
            utr = str(rng.randrange(3 * 10 ** 11, 9 * 10 ** 11))
            reg, city = regions[mi % len(regions)]
            customers.append({"name": f"Customer {n + 1}", "region": reg})
            item.update(customer_idx=n, merchant_idx=mi, region=reg)
            if rng.random() < 0.02:
                item["text"] = rng.choice(TEXTS["fraud"][locale]).format(amt=amt)
                items.append(item)
                continue
            outcome = _pick(rng, [("defect", 0.78), ("pending", 0.08), ("failed", 0.06), ("timeout", 0.03), ("unknown", 0.05)])
            state = {"defect": {"bank_status": "SUCCESS", "merchant_status": "PAYMENT_FAILED"},
                     "pending": {"bank_status": "PENDING", "merchant_status": "PAYMENT_PENDING"},
                     "failed": {"bank_status": "FAILED", "merchant_status": "PAYMENT_FAILED"},
                     "timeout": {"bank_status": "SUCCESS", "merchant_status": "PAYMENT_FAILED", "partner_timeout": True},
                     "unknown": None}[outcome]
            if state:
                world.append(("txn", utr, {**state, "amount_paise": amt * 100, "merchant_idx": mi}))
            if rng.random() < 0.12:
                item["text"] = rng.choice(TEXTS["A_noref"][locale]).format(amt=amt)
                item["reply_later"] = f"UTR {utr}" if rng.random() < 0.5 else None
            else:
                item["text"] = rng.choice(TEXTS["A"][locale]).format(amt=amt, utr=utr, shop=SHOPS[mi % len(SHOPS)])
            items.append(item)
            continue
        reg, city = regions[rng.randrange(len(regions))] if scenario != "B" else regions[0 if rng.random() < 0.7 else rng.randrange(len(regions))]
        m = {"name": f"{rng.choice(SHOPS)} #{n + 1}", "region": reg, "city": city,
             "device_id": f"SBX-{scenario}{seed}-{n:04d}", "device_model": "SB-Pro 2", "qr_id": f"QR-{scenario}{seed}-{n:04d}"}
        merchants.append(m)
        item.update(merchant_idx=len(merchants) - 1, region=reg)
        if scenario == "B":
            kind = _pick(rng, [("network", 0.55), ("dead", 0.10), ("battery", 0.10), ("silent", 0.25)])
            dev = {"online": kind in ("battery", "silent"), "network": "ok" if kind in ("battery", "silent") else "lost",
                   "battery": 8 if kind == "battery" else rng.randrange(40, 100), "firmware": "4.2.1",
                   "fault": "network" if kind in ("network", "dead") else None, "recoverable": kind != "dead",
                   "payment_announcements_missing": kind == "silent", "announcements_ok": True}
            world.append(("device", m["device_id"], dev))
            item["text"] = rng.choice(TEXTS["B"][locale])
        elif scenario == "C":
            bad = rng.random() < 0.7
            world.append(("qr", m["qr_id"], {"vpa_active": not bad, "accepting": not bad, "config_push": "CP-2611" if bad else "CP-2598",
                                             "mapped_vpa": f"old{n}@demo" if bad else f"m{n}@demo", "active_vpa": f"m{n}@demo"}))
            world.append(("device", m["device_id"], {"online": True, "network": "ok", "battery": 90, "firmware": "4.2.1"}))
            item["text"] = rng.choice(TEXTS["C"][locale])
        elif scenario == "D":
            k = _pick(rng, [("held", 0.7), ("settled", 0.2), ("processing", 0.1)])
            batch = "BATCH-20261119-A" if rng.random() < 0.6 else "BATCH-20261119-B"
            world.append(("settlement", f"__idx{len(merchants) - 1}", {
                "status": {"held": "HELD_AT_PARTNER", "settled": "SETTLED", "processing": "PROCESSING"}[k],
                "batch_id": batch, "partner": "Partner Bank A" if batch.endswith("A") else "Partner Bank B",
                "amount_paise": rng.randrange(5_000, 90_000) * 100, "held_since": "2026-11-19 18:00",
                "utr": str(rng.randrange(10 ** 11, 10 ** 12)) if k == "settled" else None}))
            item["text"] = rng.choice(TEXTS["D"][locale])
        elif scenario == "E":
            item["text"] = rng.choice(TEXTS["E"][locale])
            item["customer_type"] = "consumer" if rng.random() < 0.7 else "merchant"
        items.append(item)
    if scenario == "E":
        world += [("gateway", "primary", {"health": "degraded", "error_rate": 0.23}),
                  ("gateway", "secondary", {"health": "healthy", "error_rate": 0.003}),
                  ("gateway", "routing", {"active": "primary"})]
    return {"merchants": merchants, "customers": customers, "items": items, "world": world}


def _prepare_engineering(run_id: int) -> None:
    """Scenarios A/B: put the known defect into the SIMULATED merchant code and drive real callbacks."""
    bug = merchant_runtime.BUGS["pending_as_failed"]
    code = merchant_runtime.read_active()
    if bug["replace"] not in code:
        if bug["search"] not in code:  # a previous patch changed the code: restore the baseline first
            base = (merchant_runtime.config.MERCHANT_TEMPLATE_DIR / merchant_runtime.HANDLER_FILE).read_text(encoding="utf-8")
            merchant_runtime.activate_code(base, "reset", f"Simulation run #{run_id}: baseline restored")
        merchant_runtime.inject_bug("pending_as_failed")
    core.publish("simulation.engineering_setup", f"Simulation #{run_id}: injected 'PENDING treated as FAILED' into the "
                 f"simulated merchant code and drove real gateway callbacks", actor="simulation", actor_type="system",
                 level="warn", simulated=True)
    for _ in range(4):
        gateway.checkout(outcome="PENDING")
    gateway.settle_pending(success_ratio=1.0)


def _feed(run_id: int, scenario: str, size: int, seed: int, speed: float) -> None:
    try:
        plan = _plan(scenario, size, seed)
        now = db.now()
        with db.tx() as c:
            mids = [c.execute("INSERT INTO merchants (name, region, city, device_id, device_model, qr_id, simulated, created_at)"
                              " VALUES (?,?,?,?,?,?,1,?)", (m["name"], m["region"], m["city"], m["device_id"],
                                                            m["device_model"], m["qr_id"], now)).lastrowid
                    for m in plan["merchants"]]
            cids = [c.execute("INSERT INTO customers (name, phone_masked, region, simulated, created_at) VALUES (?,?,?,1,?)",
                              (cu["name"], "******" + str(1000 + i)[-4:], cu["region"], now)).lastrowid
                    for i, cu in enumerate(plan["customers"])]
        world = []
        for kind, eid, state in plan["world"]:
            if kind == "settlement":
                eid = str(mids[int(eid.replace("__idx", ""))])
            if kind == "txn" and "merchant_idx" in state:
                state = {**state, "merchant_id": mids[state.pop("merchant_idx")]}
            world.append((kind, eid, state))
        connectors.world_put_many(world)
        if SCENARIOS[scenario]["engineering"]:
            _prepare_engineering(run_id)
        core.publish("simulation.started", f"Simulation #{run_id}: scenario {scenario} ({SCENARIOS[scenario]['title']}), "
                     f"{size} tickets, seed {seed}", actor="simulation", actor_type="system", simulated=True,
                     data={"run_id": run_id, "scenario": scenario, "size": size, "seed": seed})
        replies = []
        t0 = time.time()
        for i, it in enumerate(plan["items"]):
            while _state["paused"].is_set() and not _state["stop"].is_set():
                time.sleep(0.2)
            if _state["stop"].is_set():
                break
            target = t0 + i / speed
            if target > time.time():
                time.sleep(target - time.time())
            ct = it.get("customer_type", SCENARIOS[scenario]["customer_type"])
            mi = it.get("merchant_idx")
            t = tickets.create(it["text"], customer_type=ct, channel="simulation", locale=it["locale"],
                               customer_id=cids[it["customer_idx"]] if "customer_idx" in it else None,
                               merchant_id=mids[mi] if (mi is not None and ct == "merchant") or scenario == "A" and mi is not None else None,
                               simulated=True, simulation_run_id=run_id, region=it.get("region"),
                               context={"device_type": "soundbox"} if scenario == "B" else None)
            if it.get("reply_later"):
                replies.append((t["id"], it["reply_later"]))
            with db.tx() as c:
                c.execute("UPDATE simulation_runs SET created=? WHERE id=?", (i + 1, run_id))
        if replies and not _state["stop"].is_set():
            workers.drain(30)
            for tid, text in replies:  # simulated customers answer the agent's follow-up question
                pipeline.customer_reply(tid, text, "customer (simulated)")
        status = "stopped" if _state["stop"].is_set() else "completed"
        with db.tx() as c:
            c.execute("UPDATE simulation_runs SET status=?, finished_at=? WHERE id=?", (status, db.now(), run_id))
        core.publish("simulation.feed_finished", f"Simulation #{run_id}: ticket feed {status}", actor="simulation",
                     actor_type="system", simulated=True, data={"run_id": run_id})
    except Exception as exc:  # noqa: BLE001
        with db.tx() as c:
            c.execute("UPDATE simulation_runs SET status='failed', params=json_set(COALESCE(params,'{}'),'$.error',?) "
                      "WHERE id=?", (str(exc)[:300], run_id))
        core.publish("simulation.failed", f"Simulation #{run_id} failed: {exc}", actor="simulation", actor_type="system",
                     level="error", simulated=True)
        raise


def start(scenario: str, size: int, seed: int = 42, speed: float = 15.0, by: str = "system", wait: bool = False) -> dict:
    scenario = scenario.upper()
    if scenario not in SCENARIOS:
        raise ValueError(f"Unknown scenario {scenario}")
    if size not in SIZES:
        raise ValueError(f"Size must be one of {SIZES}")
    th = _state["thread"]
    if th and th.is_alive():
        raise RuntimeError("A simulation is already feeding tickets - pause or reset it first")
    _state["stop"].clear()
    _state["paused"].clear()
    workers.pool().paused = False
    with db.tx() as c:
        rid = c.execute("INSERT INTO simulation_runs (scenario, size, seed, status, params, started_by, started_at) VALUES "
                        "(?,?,?,?,?,?,?)", (scenario, size, seed, "running", core.dumps({"speed": speed}), by,
                                             db.now())).lastrowid
    _state["run_id"] = rid
    th = threading.Thread(target=_feed, args=(rid, scenario, size, seed, max(1.0, speed)), daemon=True,
                          name=f"fixchain-sim-{rid}")
    _state["thread"] = th
    th.start()
    if wait:
        th.join()
    return db.one("SELECT * FROM simulation_runs WHERE id=?", (rid,))


def pause(paused: bool) -> dict:
    (_state["paused"].set if paused else _state["paused"].clear)()
    workers.pool().paused = paused
    core.publish("simulation.paused" if paused else "simulation.resumed",
                 "Simulation and agent workers paused" if paused else "Simulation resumed", actor="simulation",
                 actor_type="system", simulated=True)
    return status()


def status() -> dict:
    run = db.one("SELECT * FROM simulation_runs ORDER BY id DESC LIMIT 1")
    th = _state["thread"]
    return {"run": run, "feeding": bool(th and th.is_alive()), "paused": _state["paused"].is_set(),
            "scenarios": SCENARIOS, "sizes": SIZES}


OPS_TABLES = ["ops_events", "agent_handoffs", "evidence", "verifications", "approvals", "resolution_actions",
              "connector_calls", "incident_tickets", "engineering_issues", "ticket_messages", "workflow_runs",
              "agent_tasks", "tickets", "ops_incidents", "simulation_runs"]


def reset(by: str) -> dict:
    """Deterministic baseline: clears tickets, incidents, actions, events and the mock world; keeps users,
    approved playbooks and knowledge. Also resets the engineering demo environment."""
    from .. import orchestrator
    run = orchestrator.active_run()
    if run and run["state"] not in ("AWAITING_APPROVAL",):
        raise RuntimeError("An engineering pipeline run is in progress - wait for it to reach approval, then reset")
    _state["stop"].set()
    th = _state["thread"]
    if th and th.is_alive():
        th.join(timeout=10)
    pool = workers.pool()
    pool.paused = True
    end = time.time() + 15
    while time.time() < end and db.one("SELECT COUNT(*) AS n FROM agent_tasks WHERE status='running'")["n"]:
        time.sleep(0.1)
    with db.tx() as c:
        for t in OPS_TABLES:
            c.execute(f"DELETE FROM {t}")
        c.execute("DELETE FROM mock_world WHERE kind!='config'")
        c.execute("DELETE FROM merchants WHERE simulated=1")
        c.execute("DELETE FROM customers WHERE simulated=1")
        for t in ("orders", "gateway_txns", "processed_events", "payment_events", "app_logs", "incidents",
                  "incident_orders", "runs", "run_steps", "patches", "test_runs", "code_versions"):
            c.execute(f"DELETE FROM {t}")
    import shutil
    shutil.rmtree(merchant_runtime.config.SANDBOX_ROOT, ignore_errors=True)
    merchant_runtime._module_cache.clear()
    merchant_runtime.ensure_workspace()
    seed_demo_world()
    pool.paused = False
    _state["paused"].clear()
    core.audit(by, "simulation.reset", "environment")
    core.publish("simulation.reset", "Demo environment reset to the deterministic baseline", actor=by, actor_type="human")
    return {"ok": True}


def seed_demo_world() -> None:
    """World entries behind the interactive demo accounts (customer portal), so live chats get real answers."""
    m = db.one("SELECT * FROM merchants WHERE device_id='SBX-DEMO-0001'")
    items = [
        ("txn", "412345678901", {"bank_status": "SUCCESS", "merchant_status": "PAYMENT_FAILED", "amount_paise": 50000}),
        ("txn", "412345678902", {"bank_status": "PENDING", "merchant_status": "PAYMENT_PENDING", "amount_paise": 120000}),
        ("txn", "412345678903", {"bank_status": "SUCCESS", "merchant_status": "PAID", "amount_paise": 24900}),
        ("txn", "412345678904", {"bank_status": "FAILED", "merchant_status": "PAYMENT_FAILED", "amount_paise": 75000}),
        ("device", "SBX-DEMO-0001", {"online": False, "network": "lost", "battery": 72, "firmware": "4.2.1",
                                     "fault": "network", "recoverable": True}),
        ("qr", "QR-DEMO-0001", {"vpa_active": False, "accepting": False, "config_push": "CP-2611",
                                "mapped_vpa": "ramesh.old@demo", "active_vpa": "ramesh.kirana@demo"}),
    ]
    if m:
        items.append(("settlement", str(m["id"]), {"status": "HELD_AT_PARTNER", "batch_id": "BATCH-DEMO-001",
                                                  "partner": "Partner Bank A", "amount_paise": 1845000,
                                                  "held_since": "2026-11-19 18:00"}))
    connectors.world_put_many(items)
