"""Incident taxonomy, multilingual symptom lexicon, deterministic severity and (demo) SLA policies.

Severity is computed by rules from observable factors. A model may *suggest* facts; it never sets severity.
"""
from __future__ import annotations

CATEGORIES: dict[str, dict] = {
    "PAYMENTS_UPI": {"label": "Payments & UPI", "service": "upi_payments", "base": 2},
    "MERCHANT_QR": {"label": "Merchant QR & acceptance", "service": "merchant_qr", "base": 2},
    "SOUNDBOX": {"label": "Soundbox & hardware", "service": "merchant_soundbox", "base": 1},
    "SETTLEMENT": {"label": "Settlement & reconciliation", "service": "merchant_settlement", "base": 2},
    "ACCOUNT_KYC": {"label": "Account, login & KYC", "service": "identity", "base": 1},
    "FRAUD_SECURITY": {"label": "Fraud & security", "service": "risk", "base": 3},
    "PLATFORM_OUTAGE": {"label": "Platform / API outage", "service": "platform", "base": 3},
    "GRIEVANCE": {"label": "Customer grievance", "service": "support", "base": 1},
    "PRIVACY_COMPLIANCE": {"label": "Privacy, cyber & compliance", "service": "security", "base": 3},
}

# symptom -> (category, subcategory label, keywords across English / Hinglish / Hindi / Marathi)
SYMPTOMS: dict[str, tuple[str, str, list[str]]] = {
    "DEBIT_NOT_CREDITED": ("PAYMENTS_UPI", "Debited but not credited", [
        "debited", "deducted", "money cut", "not credited", "not received", "didn't receive", "did not receive",
        "debit ho", "kat gaye", "kat gaya", "paise kat", "paisa kat", "nahi mila", "nahi pahuncha", "receive nahi",
        "पैसे कट", "कट गए", "कट गया", "डेबिट", "नहीं मिला", "नहीं पहुंचा", "नहीं पहुँचा",
        "पैसे कापले", "कापले गेले", "मिळाले नाही", "मिळाले नाहीत", "पोहोचले नाही", "kaple"]),
    "PAYMENT_PENDING": ("PAYMENTS_UPI", "Payment pending", [
        "pending", "processing", "stuck", "atka", "atak", "ruka hua", "अटका", "अटक गया", "रुका", "प्रलंबित", "अडकले"]),
    "PAYMENT_FAILED": ("PAYMENTS_UPI", "Payment failed", [
        "payment failed", "transaction failed", "failed", "fail ho", "विफल", "फेल", "अयशस्वी"]),
    "DUPLICATE_DEBIT": ("PAYMENTS_UPI", "Duplicate debit", [
        "twice", "double debit", "two times", "do baar", "dobara kat", "दो बार", "दोनदा", "दोन वेळा"]),
    "REFUND_STATUS": ("PAYMENTS_UPI", "Refund status", [
        "refund", "money back", "paise wapas", "wapas nahi", "रिफंड", "वापस", "परतावा", "परत"]),
    "QR_NOT_ACCEPTING": ("MERCHANT_QR", "QR not accepting payments", [
        "qr", "scan", "scanner", "scanning", "स्कैन", "क्यूआर", "क्यू आर", "स्कॅन", "क्यूआर कोड"]),
    "SOUNDBOX_NO_ANNOUNCEMENT": ("SOUNDBOX", "No payment announcement", [
        "soundbox", "sound box", "speaker", "announce", "announcement", "not speaking", "no sound", "bol nahi",
        "bolta nahi", "awaz nahi", "awaaz", "आवाज़ नहीं", "आवाज नहीं", "बोल नहीं", "बोलता नहीं", "साउंडबॉक्स",
        "साउंड बॉक्स", "बोलत नाही", "आवाज येत नाही", "साऊंडबॉक्स"]),
    "SOUNDBOX_OFFLINE": ("SOUNDBOX", "Device offline / power / network", [
        "offline", "no network", "network nahi", "battery", "charge nahi", "light nahi", "red light", "blinking",
        "नेटवर्क", "बैटरी", "बॅटरी", "चार्ज", "लाल बत्ती", "बंद पड़ा", "बंद आहे"]),
    "SETTLEMENT_DELAY": ("SETTLEMENT", "Settlement delayed", [
        "settlement", "settle", "payout", "not settled", "bank me nahi aaya", "account me nahi aaya", "jama nahi",
        "सेटलमेंट", "सेटल", "खाते में नहीं आया", "जमा नहीं", "खात्यात जमा", "जमा झाले नाही"]),
    "SETTLEMENT_MISMATCH": ("SETTLEMENT", "Settlement amount mismatch", [
        "less amount", "short settlement", "amount mismatch", "kam paise", "कम पैसे", "कमी रक्कम"]),
    "LOGIN_FAILURE": ("ACCOUNT_KYC", "Login / access failure", [
        "login", "log in", "sign in", "locked out", "otp not", "otp nahi", "लॉगिन", "लॉग इन", "ओटीपी नहीं"]),
    "KYC_ISSUE": ("ACCOUNT_KYC", "KYC / document issue", [
        "kyc", "document", "pan card", "verification", "केवाईसी", "दस्तावेज", "कागदपत्र"]),
    "FRAUD_UNAUTHORIZED": ("FRAUD_SECURITY", "Unauthorized transaction / fraud", [
        "fraud", "unauthorized", "unauthorised", "scam", "hacked", "hack", "phishing", "i didn't make",
        "i did not make", "not done by me", "maine nahi kiya", "maine nahi kiya", "dhokha", "धोखा", "फ्रॉड", "धोखाधड़ी",
        "मैंने नहीं किया", "फसवणूक", "मी केले नाही", "unknown transaction", "suspicious"]),
    "APP_OUTAGE": ("PLATFORM_OUTAGE", "App / service unavailable", [
        "app not working", "app crash", "crashing", "server down", "service down", "not loading", "error 5",
        "app band", "app nahi chal", "ऐप नहीं चल", "ऐप बंद", "ॲप चालत नाही", "सर्वर"]),
    "REPEAT_COMPLAINT": ("GRIEVANCE", "Repeat contact / unresolved", [
        "again", "third time", "no response", "still not resolved", "escalate", "nobody", "phir se", "kitni baar",
        "फिर से", "कितनी बार", "पुन्हा", "अजूनही"]),
    "DATA_EXPOSURE": ("PRIVACY_COMPLIANCE", "Possible data exposure", [
        "data leak", "my data", "privacy", "data breach", "personal details shared", "डेटा लीक", "माहिती लीक"]),
}

# Required evidence per category before a playbook may run (asked one at a time).
REQUIRED_FIELDS: dict[str, list[str]] = {
    "PAYMENTS_UPI": ["txn_ref", "amount"],
    "FRAUD_SECURITY": ["approx_time"],
    "SETTLEMENT": [],
    "MERCHANT_QR": [],
    "SOUNDBOX": [],
}

SECURITY_INDICATORS = {"FRAUD_UNAUTHORIZED", "DATA_EXPOSURE"}

# Demo SLA targets. Clearly NOT regulatory or payment-network deadlines (see PRD §13).
SLA_POLICIES = {
    "SEV-1": {"first_response_s": 15 * 60, "resolution_s": 4 * 3600},
    "SEV-2": {"first_response_s": 30 * 60, "resolution_s": 24 * 3600},
    "SEV-3": {"first_response_s": 4 * 3600, "resolution_s": 72 * 3600},
    "SEV-4": {"first_response_s": 24 * 3600, "resolution_s": 120 * 3600},
}
SLA_LABEL = "Demo SLA targets (configurable) - not regulatory or network deadlines"

SEV_ORDER = ["SEV-4", "SEV-3", "SEV-2", "SEV-1"]


def severity(category: str, symptoms: list[str], amount_paise: int | None = None, cohort: int = 1,
             regions: int = 1, categories_in_burst: int = 1, repeat_contact: bool = False) -> tuple[str, list[str], dict]:
    """Rule-based severity. Returns (SEV-x, reason codes, factor breakdown)."""
    base = CATEGORIES.get(category, {"base": 1})["base"]
    factors = {"category_base": base}
    reasons = [f"CATEGORY_{category}"]
    score = base
    if SECURITY_INDICATORS & set(symptoms):
        score = max(score, 3)
        factors["security_indicator"] = 1
        reasons.append("SECURITY_INDICATOR")
    if amount_paise and amount_paise >= 1_000_000:  # >= ₹10,000
        score += 1
        factors["high_amount"] = 1
        reasons.append("HIGH_AMOUNT")
    if cohort >= 200:
        score += 3
        factors["cohort"] = 3
        reasons.append("MAJOR_COHORT")
    elif cohort >= 50:
        score += 2
        factors["cohort"] = 2
        reasons.append("MAJOR_COHORT")
    elif cohort >= 10:
        score += 1
        factors["cohort"] = 1
        reasons.append("MULTI_CUSTOMER")
    else:
        reasons.append("SINGLE_OR_SMALL_COHORT")
    if regions >= 3:
        score += 1
        factors["multi_region"] = 1
        reasons.append("MULTI_REGION")
    if categories_in_burst >= 3:
        score += 1
        factors["cross_service_burst"] = 1
        reasons.append("CROSS_SERVICE_BURST")
    if repeat_contact:
        factors["repeat_contact"] = 1
        reasons.append("REPEAT_CONTACT")
    sev = "SEV-1" if score >= 5 else "SEV-2" if score >= 3 else "SEV-3" if score >= 2 else "SEV-4"
    factors["score"] = score
    return sev, reasons, factors


def priority(sev: str) -> int:
    return {"SEV-1": 1, "SEV-2": 2, "SEV-3": 3, "SEV-4": 4}[sev]


def max_sev(a: str, b: str) -> str:
    return a if SEV_ORDER.index(a) >= SEV_ORDER.index(b) else b
