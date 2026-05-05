import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status
from jose import JWTError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.auth import RefreshToken
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserOut,
)
from app.services.s3 import delete_image, upload_avatar

router = APIRouter(prefix="/auth", tags=["auth"])


async def _issue_token_pair(
    user: User,
    db: AsyncSession,
    family_id: uuid.UUID | None = None,
) -> TokenResponse:
    """Persist a new RefreshToken row and return a fresh access/refresh pair.
    `family_id` is preserved across rotations from the same login session."""
    jti = uuid.uuid4()
    fam = family_id or jti
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    db.add(RefreshToken(id=jti, user_id=user.id, family_id=fam, expires_at=expires_at))
    await db.flush()
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id), jti=str(jti)),
    )


async def _revoke_family(db: AsyncSession, family_id: uuid.UUID) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked.is_(False))
        .values(revoked=True)
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/hour")
async def register(request: Request, body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check duplicates — return a generic message either way to prevent
    # account enumeration. The 409 still tells the legitimate user something
    # is off, but doesn't disclose which field collided.
    existing = await db.execute(
        select(User).where((User.email == body.email) | (User.username == body.username))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Could not create account")

    user = User(
        email=body.email,
        username=body.username,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    await db.flush()
    return user


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is disabled")
    return await _issue_token_pair(user, db)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("60/minute")
async def refresh(request: Request, body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not a refresh token")
        user_id = payload.get("sub")
        jti_str = payload.get("jti")
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")

    if not jti_str:
        # Pre-rotation refresh tokens (issued before this migration) have no jti.
        # Reject — user re-authenticates once, then everything works going forward.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token must be re-issued; please log in again")
    try:
        jti = uuid.UUID(jti_str)
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")

    row = (
        await db.execute(select(RefreshToken).where(RefreshToken.id == jti))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown refresh token")
    if row.revoked:
        # Reuse-detection: a revoked token came back. Revoke the entire family.
        await _revoke_family(db, row.family_id)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token reuse detected")
    if row.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token expired")

    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")

    # Rotate: revoke the consumed token, issue a new one in the same family.
    row.revoked = True
    return await _issue_token_pair(user, db, family_id=row.family_id)


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
async def update_profile(
    body: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    if not data:
        return current_user

    # Check for conflicts on username/email if they are being changed
    if "username" in data and data["username"] != current_user.username:
        exists = await db.execute(
            select(User).where(User.username == data["username"], User.id != current_user.id)
        )
        if exists.scalar_one_or_none():
            raise HTTPException(status.HTTP_409_CONFLICT, "Username already taken")
    if "email" in data and data["email"] != current_user.email:
        exists = await db.execute(
            select(User).where(User.email == data["email"], User.id != current_user.id)
        )
        if exists.scalar_one_or_none():
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already taken")

    for field, value in data.items():
        setattr(current_user, field, value)
    await db.flush()
    return current_user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    current_user.hashed_password = hash_password(body.new_password)
    # Invalidate all refresh tokens — every other session must re-authenticate.
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == current_user.id, RefreshToken.revoked.is_(False))
        .values(revoked=True)
    )
    await db.flush()


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.delete(current_user)


@router.post("/me/avatar", response_model=UserOut)
@limiter.limit("20/minute")
async def upload_user_avatar(
    request: Request,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    s3_key = await upload_avatar(file, current_user.id)
    current_user.avatar_url = f"/api/images/{s3_key}"
    await db.flush()
    return current_user


@router.delete("/me/avatar", response_model=UserOut)
async def delete_user_avatar(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.avatar_url:
        s3_key = current_user.avatar_url.replace("/api/images/", "", 1)
        if s3_key:
            try:
                await delete_image(s3_key)
            except Exception:
                pass  # don't block avatar removal on S3 cleanup failure
    current_user.avatar_url = None
    await db.flush()
    return current_user
