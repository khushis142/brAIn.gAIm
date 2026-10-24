from functools import lru_cache
from pathlib import Path

import boto3
from botocore.config import Config

from app.config import get_settings

PRESIGNED_URL_TTL_SECONDS = 3600
# SigV4 needs a region name; self-hosted S3-compatible stores ignore its value.
_REGION = "us-east-1"


@lru_cache
def _client():
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        region_name=_REGION,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
        config=Config(
            signature_version="s3v4",
            # Self-hosted stores serve buckets under the path, not as subdomains.
            s3={"addressing_style": "path"},
        ),
    )


def presigned_get_url(key: str) -> str:
    """Signs locally; no network round-trip to S3."""
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": get_settings().s3_bucket, "Key": key},
        ExpiresIn=PRESIGNED_URL_TTL_SECONDS,
    )


def upload_file(path: Path, key: str, content_type: str) -> None:
    _client().upload_file(
        str(path), get_settings().s3_bucket, key, ExtraArgs={"ContentType": content_type}
    )
