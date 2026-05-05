import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import jwt

from app.core.config import settings


def _prehash(password: str) -> bytes:
    """SHA256-prehash before bcrypt to (a) bypass the 72-byte limit and
    (b) avoid mid-codepoint UTF-8 truncation. Base64-encoded so the result
    is bcrypt-safe (no NUL bytes, fixed 44-byte length)."""
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prehash(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Accept both new (SHA256-prehashed) and legacy (raw 72-byte trunc) hashes.
    Old passwords seamlessly migrate the next time the user changes them."""
    hashed_bytes = hashed.encode("utf-8")
    try:
        if bcrypt.checkpw(_prehash(plain), hashed_bytes):
            return True
        # Legacy fallback for hashes created before SHA256 prehash.
        legacy = plain.encode("utf-8")[:72]
        return bcrypt.checkpw(legacy, hashed_bytes)
    except ValueError:
        return False


# Dummy bcrypt hash — used by login when the user is not found, so the request
# spends roughly the same time as a real password check (mitigates timing
# attacks that distinguish "user exists" from "user doesn't exist").
_DUMMY_BCRYPT_HASH = bcrypt.hashpw(_prehash(secrets.token_urlsafe(32)), bcrypt.gensalt()).decode("utf-8")


def dummy_verify() -> None:
    """Run a bcrypt check against a throwaway hash — same cost as a real one."""
    bcrypt.checkpw(_prehash("dummy"), _DUMMY_BCRYPT_HASH.encode("utf-8"))


def create_access_token(subject: str | Any, expires_delta: timedelta | None = None) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return jwt.encode(
        {"sub": str(subject), "exp": expire, "type": "access"},
        settings.SECRET_KEY,
        settings.ALGORITHM,
    )


def create_refresh_token(subject: str | Any, jti: str | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload: dict[str, Any] = {"sub": str(subject), "exp": expire, "type": "refresh"}
    if jti:
        payload["jti"] = jti
    return jwt.encode(payload, settings.SECRET_KEY, settings.ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
