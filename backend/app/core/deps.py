import uuid
from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User

bearer = HTTPBearer()

# Throttle: don't write last_seen_at on every request — once per 5 minutes is
# enough granularity for the "active in last N days" admin metric, and avoids
# a write per request on chatty clients.
LAST_SEEN_THROTTLE = timedelta(minutes=5)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = decode_token(token)
        user_id_str: str = payload.get("sub")
        token_type: str = payload.get("type", "access")
        if not user_id_str:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        # Refresh tokens (and any non-access type) must NOT be accepted as bearer credentials.
        # Pre-existing access tokens issued before this change have no "type" claim and default to "access".
        if token_type != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
        # Coerce sub → UUID. SA's cross-DB Uuid type expects an actual UUID
        # object on SQLite (it'd accept strings on Postgres natively).
        try:
            user_id = uuid.UUID(user_id_str)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    # Bump last_seen_at — throttled so chatty clients don't write on every
    # request. Failures here are non-fatal: the admin metric is a
    # nice-to-have, not a hard contract.
    #
    # Normalise last_seen to tz-aware before comparing: Postgres returns
    # tz-aware from a TIMESTAMPTZ column, but a naive value (SQLite in tests,
    # or a legacy row written without tzinfo) would raise TypeError on the
    # subtraction and 500 EVERY authenticated request. Treat naive as UTC.
    now = datetime.now(UTC)
    last_seen = user.last_seen_at
    if last_seen is not None and last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=UTC)
    if last_seen is None or now - last_seen >= LAST_SEEN_THROTTLE:
        user.last_seen_at = now
        try:
            await db.commit()
            await db.refresh(user)
        except Exception:
            await db.rollback()

    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency for admin-only routes. Returns the same user but 403s for
    non-admins. Always layered on top of get_current_user — never use this
    in place of it for non-admin endpoints, since the activity bump should
    happen for everyone."""
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
