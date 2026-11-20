"""Agent 2b - Incident Intelligence: correlation of tickets into parent operational incidents.

Explainable scoring (no opaque embedding): category gate + symptom overlap + primary symptom + region + service +
device model. High-confidence matches are linked; mid-confidence matches are NOT merged silently - they raise a
review event. A new incident is opened when >= BURST_MIN similar unlinked tickets arrive within the window, or for a
single high-impact ticket (security / platform).
"""
from __future__ import annotations

import threading

from .. import db
from . import core, taxonomy, tickets

ATTACH_THRESHOLD = 0.70
REVIEW_THRESHOLD = 0.50
WINDOW_S = 6 * 3600
BURST_MIN = 3
BURST_WINDOW_S = 30 * 60
REINVESTIGATE_AT = (10, 50, 150)
_lock = threading.Lock()  # correlation is serialised so concurrent workers never open duplicate incidents


def _features(t: dict) -> dict:
    return {"category": t["category"], "symptoms": set(t["symptoms"] or []), "primary": (t["symptoms"] or [None])[0],
            "region": t["region"], "service": t["service"], "device_model": t["device_model"]}


def similarity(t: dict, inc: dict) -> tuple[float, dict]:
    f = _features(t)
    if inc["kind"] == "platform":
        hit = "APP_OUTAGE" in f["symptoms"] or f["category"] == "PLATFORM_OUTAGE"
        return (0.85 if hit else 0.0), {"platform_outage_window": hit}
    if f["category"] != inc["category"]:
        return 0.0, {"category": False}
    isyms = set(core.loads(inc["symptom_set"], [])) if inc.get("symptom_set") else {inc["fingerprint"].split(":")[-1]}
    jac = len(f["symptoms"] & isyms) / max(1, len(f["symptoms"] | isyms))
    regions = set(core.loads(inc["regions"], []))
    parts = {
        "category": 0.30,
        "symptom_overlap": round(0.25 * jac, 3),
        "primary_symptom": 0.20 if f["primary"] and inc["fingerprint"].endswith(f":{f['primary']}") else 0.0,
        "region": 0.10 if (not regions or f["region"] in regions) else 0.0,
        "service": 0.10 if f["service"] == inc["service"] else 0.0,
        "device_model": 0.05 if (f["device_model"] and f["device_model"] in (inc.get("title") or "")) or not f["device_model"] else 0.0,
    }
    return round(sum(parts.values()), 3), parts


def _open_incidents(category: str, simulated: int) -> list[dict]:
    # simulated and live data never mix: a live ticket is only ever correlated with live incidents
    rows = db.rows("SELECT * FROM ops_incidents WHERE state NOT IN ('RESOLVED','CLOSED') AND last_seen>=? AND "
                   "(category=? OR kind='platform') AND simulated=? ORDER BY first_seen DESC",
                   (db.now() - WINDOW_S, category, simulated))
    for r in rows:
        r["symptom_set"] = core.dumps([r["fingerprint"].split(":")[-1]])
    return rows


def link(incident_id: str, ticket_id: str, score: float, method: str) -> None:
    with db.tx() as c:
        c.execute("INSERT OR IGNORE INTO incident_tickets (incident_id, ticket_id, similarity, method, linked_at) VALUES "
                  "(?,?,?,?,?)", (incident_id, ticket_id, score, method, db.now()))
        c.execute("UPDATE tickets SET incident_id=? WHERE id=?", (incident_id, ticket_id))


def refresh_stats(incident_id: str) -> dict:
    """Recompute impact and (rule-based) severity from linked tickets; announce changes."""
    inc = db.one("SELECT * FROM ops_incidents WHERE id=?", (incident_id,))
    s = db.one("SELECT COUNT(*) AS n, COUNT(DISTINCT customer_id) AS cust, COUNT(DISTINCT merchant_id) AS merch, "
               "MIN(created_at) AS first, MAX(created_at) AS last, MAX(amount) AS max_amount FROM tickets WHERE incident_id=?",
               (incident_id,))
    regions = sorted({r["region"] for r in db.rows("SELECT DISTINCT region FROM tickets WHERE incident_id=? AND region IS NOT NULL",
                                                   (incident_id,))})
    syms = {x for r in db.rows("SELECT symptoms FROM tickets WHERE incident_id=?", (incident_id,)) for x in core.loads(r["symptoms"], [])}
    cats = db.one("SELECT COUNT(DISTINCT category) AS n FROM tickets WHERE incident_id=?", (incident_id,))["n"]
    sev, reasons, factors = taxonomy.severity(inc["category"], list(syms), s["max_amount"], cohort=s["n"],
                                              regions=len(regions), categories_in_burst=cats)
    sev = taxonomy.max_sev(sev, inc["severity"])  # severity never silently drops while the incident is open
    with db.tx() as c:
        c.execute("UPDATE ops_incidents SET affected_tickets=?, affected_customers=?, affected_merchants=?, regions=?,"
                  " first_seen=MIN(first_seen, ?), last_seen=?, severity=?, severity_factors=?, updated_at=? WHERE id=?",
                  (s["n"], s["cust"], s["merch"], core.dumps(regions), s["first"] or inc["first_seen"],
                   s["last"] or inc["last_seen"], sev, core.dumps({"reasons": reasons, **factors}), db.now(), incident_id))
    for threshold in REINVESTIGATE_AT:  # evidence changes as the incident grows: investigate again at milestones
        if inc["affected_tickets"] < threshold <= s["n"]:
            from . import workers
            workers.enqueue("investigate_incident", "incident", incident_id,
                            key=f"investigate_incident:incident:{incident_id}:grow{threshold}",
                            payload={"simulated": bool(inc["simulated"]), "reason": f"grew past {threshold}"},
                            priority=1, delay_s=2.0)
    if sev != inc["severity"]:
        core.publish("incident.severity_changed", f"{incident_id} severity {inc['severity']} → {sev} "
                     f"({s['n']} tickets, {len(regions)} region(s))", actor="incident_intel", actor_type="agent",
                     incident_id=incident_id, level="warn" if sev in ("SEV-1", "SEV-2") else "info",
                     data={"from": inc["severity"], "to": sev, "factors": factors}, simulated=bool(inc["simulated"]))
    return {"severity": sev, "tickets": s["n"]}


def _create_incident(t: dict, kind: str, title: str, fingerprint: str, confidence: float) -> str:
    with core.id_lock:
        iid = core.next_id("ops_incidents", "INC", 4)
        with db.tx() as c:
            c.execute("INSERT INTO ops_incidents (id, title, category, subcategory, service, fingerprint, severity, state,"
                      " confidence, kind, regions, first_seen, last_seen, simulated, simulation_run_id, created_at, updated_at)"
                      " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                      (iid, title, t["category"] if kind != "platform" else "PLATFORM_OUTAGE", t["subcategory"],
                       t["service"] if kind != "platform" else "platform", fingerprint, t["severity"] or "SEV-3", "OPEN",
                       confidence, kind, core.dumps([t["region"]] if t["region"] else []), t["created_at"], t["created_at"],
                       t["simulated"], t["simulation_run_id"], db.now(), db.now()))
            c.execute("INSERT INTO workflow_runs (kind, subject_id, state, started_at, updated_at) VALUES (?,?,?,?,?)",
                      ("incident", iid, "OPEN", db.now(), db.now()))
    core.publish("incident.created", f"{iid} opened: {title}", actor="incident_intel", actor_type="agent",
                 incident_id=iid, level="warn", data={"fingerprint": fingerprint, "kind": kind},
                 simulated=bool(t["simulated"]))
    return iid


def correlate(ticket_id: str) -> dict:
    """Returns {incident_id, created, score, method, review}."""
    with _lock:
        t = tickets.get(ticket_id)
        if t["incident_id"]:
            return {"incident_id": t["incident_id"], "created": False, "score": 1.0, "method": "already-linked"}
        best, best_score, best_parts = None, 0.0, {}
        for inc in _open_incidents(t["category"], t["simulated"]):
            score, parts = similarity(t, inc)
            if score > best_score:
                best, best_score, best_parts = inc, score, parts
        if best and best_score >= ATTACH_THRESHOLD:
            link(best["id"], ticket_id, best_score, "similarity")
            core.publish("correlation.linked", f"{ticket_id} linked to {best['id']} (similarity {best_score:.2f})",
                         actor="incident_intel", actor_type="agent", ticket_id=ticket_id, incident_id=best["id"],
                         data={"score": best_score, "features": best_parts}, simulated=bool(t["simulated"]))
            refresh_stats(best["id"])
            return {"incident_id": best["id"], "created": False, "score": best_score, "method": "similarity"}
        review = None
        if best and best_score >= REVIEW_THRESHOLD:
            review = {"candidate": best["id"], "score": best_score, "features": best_parts}
            core.publish("correlation.review", f"{ticket_id} resembles {best['id']} ({best_score:.2f}) but below the "
                         f"merge threshold - kept separate for review", actor="incident_intel", actor_type="agent",
                         level="warn", ticket_id=ticket_id, incident_id=best["id"], data=review,
                         simulated=bool(t["simulated"]))
        # burst: enough similar unlinked tickets -> open a parent incident and link them all
        # resolved peers are linked too: they are part of the incident's impact even if already fixed
        peers = db.rows("SELECT id FROM tickets WHERE fingerprint=? AND incident_id IS NULL AND created_at>=? AND simulated=? "
                        "ORDER BY created_at", (t["fingerprint"], t["created_at"] - BURST_WINDOW_S, t["simulated"]))
        platform = t["category"] == "PLATFORM_OUTAGE"
        high_impact = t["category"] in ("FRAUD_SECURITY", "PRIVACY_COMPLIANCE") and t["severity"] in ("SEV-1", "SEV-2")
        if len(peers) >= BURST_MIN or (platform and len(peers) >= 2):
            kind = "platform" if platform else "cluster"
            title = (f"Platform degradation - {t['subcategory']}" if platform else
                     f"{t['subcategory']} - {taxonomy.CATEGORIES[t['category']]['label']}"
                     + (f" ({t['device_model']})" if t["device_model"] and t["category"] == "SOUNDBOX" else ""))
            conf = round(min(0.97, 0.7 + 0.03 * len(peers)), 2)
            iid = _create_incident(t, kind, title, t["fingerprint"], conf)
            for p in peers:
                link(iid, p["id"], 1.0, "fingerprint-burst")
            refresh_stats(iid)
            return {"incident_id": iid, "created": True, "score": 1.0, "method": "fingerprint-burst",
                    "linked": len(peers), "review": review}
        if high_impact:
            iid = _create_incident(t, "single", f"{t['subcategory']} (high impact)", t["fingerprint"], 0.9)
            link(iid, ticket_id, 1.0, "high-impact")
            refresh_stats(iid)
            return {"incident_id": iid, "created": True, "score": 1.0, "method": "high-impact", "review": review}
        return {"incident_id": None, "created": False, "score": best_score, "method": "standalone", "review": review}
