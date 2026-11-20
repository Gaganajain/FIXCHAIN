"""Authentication and role-based authorization.

- Sessions: random bearer tokens, stored only as SHA-256 hashes, with expiry.
- Passwords: PBKDF2-HMAC-SHA256 (stdlib), constant-time comparison.
- Demo mode (FIXCHAIN_DEMO_MODE=true, the default) seeds demo users and allows password-less
  "demo sign-in" by username. This is clearly labelled in the API and UI and is NOT production auth.
  With demo mode off, demo sign-in is refused and only password sign-in works.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time
from collections import defaultdict, deque
from dataclasses import dataclass

from fastapi import Header, HTTPException, Query, Request

from .. import db
from . import core

DEMO_MODE = os.getenv("FIXCHAIN_DEMO_MODE", "true").lower() == "true"
SESSION_TTL_S = int(os.getenv("FIXCHAIN_SESSION_TTL", str(12 * 3600)))

PERMISSIONS: dict[str, set[str]] = {
    "customer": {"ticket:create", "ticket:own"},
    "merchant": {"ticket:create", "ticket:own"},
    "support": {"ticket:create", "ticket:read", "ticket:reply", "incident:read", "approval:read", "agent:read",
                "knowledge:read", "analytics:read"},
    "incident_manager": {"ticket:create", "ticket:read", "ticket:reply", "incident:read", "incident:manage",
                         "approval:read", "agent:read", "knowledge:read", "knowledge:propose", "analytics:read",
                         "simulation:run", "engineering:read"},
    "engineer": {"ticket:read", "incident:read", "agent:read", "engineering:read", "engineering:manage",
                 "knowledge:read", "analytics:read", "approval:read"},
    "approver": {"ticket:read", "incident:read", "approval:read", "approval:decide", "agent:read", "knowledge:read",
                 "knowledge:approve", "engineering:read", "engineering:approve", "analytics:read"},
}
PERMISSIONS["admin"] = set().union(*PERMISSIONS.values()) | {"admin", "simulation:run", "audit:read"}
PERMISSIONS["approver"] |= {"audit:read"}
PERMISSIONS["incident_manager"] |= {"audit:read"}

DEMO_USERS = [
    ("asha.ops", "Asha Rao", "support", "en"),
    ("vikram.im", "Vikram Shah", "incident_manager", "en"),
    ("neha.eng", "Neha Iyer", "engineer", "en"),
    ("rahul.approver", "Rahul Mehta", "approver", "en"),
    ("admin", "Platform Admin", "admin", "en"),
    ("priya.customer", "Priya Kulkarni", "customer", "mr"),
    ("ramesh.merchant", "Ramesh Kirana Store", "merchant", "hi"),
]


@dataclass
class User:
    id: int
    username: str
    display_name: str
    role: str
    locale: str
    customer_id: int | None
    merchant_id: int | None
    demo: bool

    def can(self, perm: str) -> bool:
        return perm in PERMISSIONS.get(self.role, set())

    def public(self) -> dict:
        return {"id": self.id, "username": self.username, "display_name": self.display_name, "role": self.role,
                "locale": self.locale, "customer_id": self.customer_id, "merchant_id": self.merchant_id,
                "demo": self.demo, "permissions": sorted(PERMISSIONS.get(self.role, set()))}


def hash_password(pw: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 210_000)
    return f"pbkdf2${salt.hex()}${dk.hex()}"


def check_password(pw: str, stored: str | None) -> bool:
    if not stored or not stored.startswith("pbkdf2$"):
        return False
    _, salt, dk = stored.split("$")
    return hmac.compare_digest(hash_password(pw, bytes.fromhex(salt)).split("$")[2], dk)


def _row_to_user(r: dict) -> User:
    return User(r["id"], r["username"], r["display_name"], r["role"], r["locale"], r["customer_id"],
                r["merchant_id"], bool(r["demo"]))


def seed_users() -> None:
    """Demo users (demo mode only) and an optional admin from FIXCHAIN_ADMIN_PASSWORD."""
    now = db.now()
    if DEMO_MODE:
        for username, name, role, locale in DEMO_USERS:
            if db.one("SELECT id FROM users WHERE username=?", (username,)):
                continue
            cust = merch = None
            with db.tx() as c:
                if role == "customer":
                    cust = c.execute("INSERT INTO customers (name, phone_masked, locale, region, created_at) VALUES "
                                     "(?,?,?,?,?)", (name, "******4821", locale, "Pune", now)).lastrowid
                if role == "merchant":
                    merch = c.execute("INSERT INTO merchants (name, region, city, device_id, device_model, qr_id, locale,"
                                      " created_at) VALUES (?,?,?,?,?,?,?,?)",
                                      (name, "North", "Lucknow", "SBX-DEMO-0001", "SB-Pro 2", "QR-DEMO-0001", locale,
                                       now)).lastrowid
                c.execute("INSERT INTO users (username, display_name, role, locale, customer_id, merchant_id, demo,"
                          " created_at) VALUES (?,?,?,?,?,?,1,?)", (username, name, role, locale, cust, merch, now))
    admin_pw = os.getenv("FIXCHAIN_ADMIN_PASSWORD")
    if admin_pw:
        existing = db.one("SELECT id FROM users WHERE username='admin'")
        with db.tx() as c:
            if existing:
                c.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_password(admin_pw), existing["id"]))
            else:
                c.execute("INSERT INTO users (username, display_name, role, password_hash, created_at) VALUES "
                          "('admin','Platform Admin','admin',?,?)", (hash_password(admin_pw), now))


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    with db.tx() as c:
        c.execute("DELETE FROM sessions WHERE expires_at < ?", (db.now(),))
        c.execute("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)",
                  (hashlib.sha256(token.encode()).hexdigest(), user_id, db.now(), db.now() + SESSION_TTL_S))
    return token


def revoke(token: str) -> None:
    with db.tx() as c:
        c.execute("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(token.encode()).hexdigest(),))


def user_for_token(token: str | None) -> User | None:
    if not token:
        return None
    r = db.one("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
               (hashlib.sha256(token.encode()).hexdigest(), db.now()))
    return _row_to_user(r) if r else None


def login(username: str, password: str | None) -> tuple[str, User]:
    r = db.one("SELECT * FROM users WHERE username=?", (username,))
    if password is None:  # demo sign-in
        if not DEMO_MODE:
            raise HTTPException(403, "Demo sign-in is disabled (FIXCHAIN_DEMO_MODE=false). Use a password.")
        if not r or not r["demo"]:
            raise HTTPException(401, "Unknown demo user")
    elif not r or not check_password(password, r["password_hash"]):
        raise HTTPException(401, "Invalid username or password")
    user = _row_to_user(r)
    token = create_session(user.id)
    core.audit(user.username, "auth.login", user.username, {"demo": password is None}, role=user.role)
    return token, user


# ------------------------------------------------------------------ FastAPI dependencies
def _token(authorization: str, query_token: str | None) -> str | None:
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return query_token  # EventSource cannot set headers; the stream accepts ?token=


def current_user(authorization: str = Header(""), token: str | None = Query(None)) -> User:
    user = user_for_token(_token(authorization, token))
    if not user:
        raise HTTPException(401, "Sign in required")
    return user


def require(*perms: str):
    def dep(authorization: str = Header(""), token: str | None = Query(None)) -> User:
        user = current_user(authorization, token)
        missing = [p for p in perms if not user.can(p)]
        if missing:
            raise HTTPException(403, f"Your role ({user.role}) lacks permission: {', '.join(missing)}")
        return user
    return dep


# ------------------------------------------------------------------ rate limiting (per client, sliding window)
_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(bucket: str, limit: int, window_s: int = 60):
    def dep(request: Request) -> None:
        key = f"{bucket}:{request.client.host if request.client else 'local'}"
        q, now = _hits[key], time.time()
        while q and q[0] < now - window_s:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(429, f"Too many requests - limit {limit} per {window_s}s")
        q.append(now)
    return dep
