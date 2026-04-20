import io
import uuid

import boto3
from botocore.exceptions import ClientError
from fastapi import HTTPException, UploadFile
from PIL import Image

from app.core.config import settings

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_SIZE_MB = 10


def _get_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
    )


def ensure_bucket_exists() -> None:
    client = _get_client()
    try:
        client.head_bucket(Bucket=settings.S3_BUCKET_NAME)
    except ClientError:
        client.create_bucket(Bucket=settings.S3_BUCKET_NAME)
        # Make bucket public-read for MinIO dev setup
        client.put_bucket_policy(
            Bucket=settings.S3_BUCKET_NAME,
            Policy=f"""{{
                "Version":"2012-10-17",
                "Statement":[{{
                    "Effect":"Allow",
                    "Principal":"*",
                    "Action":"s3:GetObject",
                    "Resource":"arn:aws:s3:::{settings.S3_BUCKET_NAME}/*"
                }}]
            }}""",
        )


async def upload_image(file: UploadFile, note_id: uuid.UUID) -> tuple[str, str]:
    """Upload image to S3. Returns (s3_key, public_url)."""
    s3_key = await _upload_validated(file, f"notes/{note_id}")
    url = f"{settings.S3_PUBLIC_URL}/{s3_key}"
    return s3_key, url


async def upload_avatar(file: UploadFile, user_id: uuid.UUID) -> str:
    """Upload avatar to S3. Returns s3_key."""
    return await _upload_validated(file, f"avatars/{user_id}")


async def _upload_validated(file: UploadFile, prefix: str) -> str:
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(400, f"Unsupported image type: {file.content_type}")

    raw = await file.read()
    if len(raw) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"Image too large (max {MAX_SIZE_MB}MB)")

    try:
        img = Image.open(io.BytesIO(raw))
        img.verify()
        img = Image.open(io.BytesIO(raw))  # re-open after verify
        buf = io.BytesIO()
        fmt = img.format or "JPEG"
        img.save(buf, format=fmt)
        buf.seek(0)
        clean_bytes = buf.read()
    except Exception:
        raise HTTPException(400, "Invalid image file")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    key = f"{prefix}/{uuid.uuid4()}.{ext}"

    client = _get_client()
    client.put_object(
        Bucket=settings.S3_BUCKET_NAME,
        Key=key,
        Body=clean_bytes,
        ContentType=file.content_type,
    )
    return key


def delete_image(s3_key: str) -> None:
    client = _get_client()
    try:
        client.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=s3_key)
    except ClientError:
        pass  # best-effort


def get_image_bytes(s3_key: str) -> tuple[bytes, str]:
    """Fetch image bytes and content-type from S3."""
    client = _get_client()
    try:
        resp = client.get_object(Bucket=settings.S3_BUCKET_NAME, Key=s3_key)
        return resp["Body"].read(), resp.get("ContentType", "application/octet-stream")
    except ClientError:
        raise HTTPException(404, "Image not found")
