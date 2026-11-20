"""Agent 1 - Customer Understanding.

Turns an unstructured complaint (English / Hindi / Marathi, code-mixed) into structured facts.
Offline: a deterministic multilingual lexicon + regex extraction. LLM mode (Sarvam / Claude): schema-constrained
extraction, then *grounded*: an amount or transaction reference is only kept if it literally appears in the
customer's text. The agent never invents transaction details.
"""
from __future__ import annotations

import re

from .. import config
from ..agents import llm
from ..agents.sanitize import untrusted_block
from . import core, taxonomy

DEVANAGARI = re.compile(r"[ऀ-ॿ]")
MARATHI_MARKERS = ["आहे", "नाही", "माझ", "झाले", "केले", "होते", "मिळाले", "तुम्ही", "आणि", "पैसे कापले", "बोलत", "ळ"]
HINGLISH_MARKERS = ["hai", "nahi", "mera", "meri", "ho gaye", "ho gaya", "kya", "kar", "raha", "paise", "paisa", "kat"]

AMOUNT_RE = [
    re.compile(r"(?:₹|rs\.?|inr|rupees?)\s*([0-9][0-9,]*(?:\.\d{1,2})?)", re.I),
    re.compile(r"([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:₹|rs\.?|inr|rupees?|rupaye|rupay|रुपये|रुपए|रुपया|रु\.?)", re.I),
]
UTR_RE = re.compile(r"(?<!\d)(\d{12})(?!\d)")
TXN_RE = re.compile(r"\b((?:T|TXN|ORD)[A-Z0-9_]{8,24})\b")
TIME_RE = re.compile(r"\b(\d{1,2}[:.]\d{2}\s*(?:am|pm)?|today|yesterday|this morning|last night|aaj|kal|subah|"
                     r"आज|कल|सुबह|काल|सकाळी)\b", re.I)
DEVICE_RE = re.compile(r"\b(SB[- ]?(?:Pro|Lite|Max)\s?\d?)\b", re.I)


def detect_locale(text: str) -> tuple[str, float]:
    if DEVANAGARI.search(text):
        mr = sum(m in text for m in MARATHI_MARKERS)
        return ("mr", 0.8) if mr >= 1 else ("hi", 0.75)
    low = text.lower()
    hits = sum(bool(re.search(rf"\b{re.escape(m)}\b", low)) for m in HINGLISH_MARKERS)
    return ("hi", 0.6) if hits >= 2 else ("en", 0.7)


def _kw_hit(kw: str, low: str) -> bool:
    if kw.isascii():
        return re.search(rf"(?<![a-z]){re.escape(kw)}", low) is not None
    return kw in low


def match_symptoms(text: str) -> list[tuple[str, int]]:
    low = text.lower()
    scored = []
    for code, (_, _, kws) in taxonomy.SYMPTOMS.items():
        n = sum(_kw_hit(k, low) for k in kws)
        if n:
            scored.append((code, n))
    # "failed" alone is ambiguous when a debit-not-credited pattern is present
    codes = {c for c, _ in scored}
    if "DEBIT_NOT_CREDITED" in codes:
        scored = [(c, n) for c, n in scored if c != "PAYMENT_FAILED"]
    return sorted(scored, key=lambda x: -x[1])


def extract_amount(text: str) -> int | None:
    for pat in AMOUNT_RE:
        m = pat.search(text)
        if m:
            try:
                return int(round(float(m.group(1).replace(",", "")) * 100))
            except ValueError:
                pass
    return None


def understand_offline(text: str, locale_hint: str | None = None, context: dict | None = None) -> dict:
    context = context or {}
    det_locale, loc_conf = detect_locale(text)
    symptoms = match_symptoms(text)
    codes = [c for c, _ in symptoms]
    if not codes and context.get("device_type") == "soundbox":
        codes = ["SOUNDBOX_NO_ANNOUNCEMENT"]
    # category priority: security first, then strongest match
    primary = next((c for c in codes if c in taxonomy.SECURITY_INDICATORS),
                   "APP_OUTAGE" if "APP_OUTAGE" in codes else codes[0] if codes else None)
    if primary and codes and codes[0] != primary:
        codes = [primary] + [c for c in codes if c != primary]
    category, subcategory = (taxonomy.SYMPTOMS[primary][0], taxonomy.SYMPTOMS[primary][1]) if primary else ("GRIEVANCE", "Unclassified request")
    amount = extract_amount(text)
    utr = UTR_RE.search(text)
    txn = TXN_RE.search(text)
    tm = TIME_RE.search(text)
    dev = DEVICE_RE.search(text) or (re.match(r"(.+)", context["device_model"]) if context.get("device_model") else None)
    facts = {
        "amount_paise": amount,
        "txn_ref": (utr.group(1) if utr else txn.group(1) if txn else None),
        "approx_time": tm.group(1) if tm else None,
        "device_model": dev.group(1) if dev else None,
    }
    top = symptoms[0][1] if symptoms else 0
    confidence = 0.35 if not codes else min(0.95, 0.6 + 0.12 * top + (0.05 if len(codes) == 1 else 0))
    return {
        "locale_detected": det_locale, "locale_confidence": loc_conf,
        "locale": locale_hint or det_locale,
        "symptoms": codes[:4], "primary_symptom": primary, "category": category, "subcategory": subcategory,
        "facts": facts, "confidence": round(confidence, 2), "method": "offline-lexicon",
        "secret_detected": core.contains_secret(text),
        "intent": "report_fraud" if category == "FRAUD_SECURITY" else "status_or_fix",
    }


LLM_SCHEMA = {
    "type": "object",
    "properties": {
        "symptoms": {"type": "array", "items": {"type": "string"}},
        "amount_rupees": {"type": "number"},
        "txn_ref": {"type": "string"},
        "approx_time": {"type": "string"},
        "device_model": {"type": "string"},
        "summary_en": {"type": "string"},
        "confidence": {"type": "number"},
    },
    "required": ["symptoms", "amount_rupees", "txn_ref", "approx_time", "device_model", "summary_en", "confidence"],
    "additionalProperties": False,
}


def understand_llm(text: str, locale_hint: str | None, context: dict | None) -> dict:
    base = understand_offline(text, locale_hint, context)
    codes = list(taxonomy.SYMPTOMS)
    out = llm.structured_call(
        system="You are FIXCHAIN's Customer Understanding Agent for an Indian payments company. Extract facts from a "
               "customer's complaint (English, Hindi, Marathi or code-mixed). Use empty string / 0 for anything the "
               "customer did not state. Never guess a transaction reference or amount.",
        user=(f"Allowed symptom codes: {', '.join(codes)}.\n" + untrusted_block("customer_message", core.mask(text))
              + "\nReturn the matching symptom codes (most relevant first), facts and a one-line English summary."),
        schema=LLM_SCHEMA, max_tokens=1500, effort="low")
    syms = [s for s in out.get("symptoms", []) if s in taxonomy.SYMPTOMS][:4]
    if syms:
        primary = next((c for c in syms if c in taxonomy.SECURITY_INDICATORS), syms[0])
        base.update(symptoms=syms, primary_symptom=primary, category=taxonomy.SYMPTOMS[primary][0],
                    subcategory=taxonomy.SYMPTOMS[primary][1])
    # grounding: keep model-extracted values only if present in the customer's own words
    ref = (out.get("txn_ref") or "").strip()
    if ref and ref in text and not base["facts"]["txn_ref"]:
        base["facts"]["txn_ref"] = ref
    amt = out.get("amount_rupees") or 0
    if amt and not base["facts"]["amount_paise"]:
        s = f"{amt:g}"
        if s in text.replace(",", ""):
            base["facts"]["amount_paise"] = int(round(amt * 100))
    for k in ("approx_time", "device_model"):
        v = (out.get(k) or "").strip()
        if v and not base["facts"][k] and v.lower() in text.lower():
            base["facts"][k] = v
    base["summary_llm"] = core.mask((out.get("summary_en") or "")[:200])
    base["confidence"] = round(max(0.0, min(1.0, float(out.get("confidence") or base["confidence"]))), 2)
    base["method"] = f"llm ({config.llm_label()}) + grounding"
    base["_model"] = config.llm_model()
    return base


def understand(text: str, locale_hint: str | None = None, context: dict | None = None, use_llm: bool = True) -> dict:
    if use_llm and config.agent_mode() == "llm":
        try:
            return understand_llm(text, locale_hint, context)
        except llm.LLMError as exc:
            r = understand_offline(text, locale_hint, context)
            r["method"] = f"offline-lexicon (LLM unavailable: {str(exc)[:80]})"
            return r
    return understand_offline(text, locale_hint, context)


def summary_en(u: dict) -> str:
    parts = [u.get("subcategory") or "Customer issue"]
    f = u.get("facts", {})
    if f.get("amount_paise"):
        parts.append(f"₹{f['amount_paise'] / 100:,.0f}")
    if f.get("device_model"):
        parts.append(f["device_model"])
    return " · ".join(parts)


def missing_fields(category: str, facts: dict) -> list[str]:
    need = taxonomy.REQUIRED_FIELDS.get(category, [])
    key = {"txn_ref": "txn_ref", "amount": "amount_paise", "approx_time": "approx_time"}
    return [f for f in need if not facts.get(key[f])]
