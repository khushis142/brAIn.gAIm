"""Files on the CDN service (github.com/brAIn-gAIm/CDN).

Clients upload straight to the CDN and register the returned id here; delivery URLs
are always derived from that id, never taken from the client. The backend itself uploads
only what it produces (published game code, generated audio), and downloads only project
attachments it reads for flashcards.
"""

import uuid
from urllib.parse import quote

import httpx

from app.config import get_settings


def file_url(file_id: uuid.UUID, filename: str) -> str:
    base = get_settings().cdn_base_url.rstrip("/")
    return f"{base}/files/{file_id}/{quote(filename)}"


async def upload(content: bytes, filename: str, content_type: str) -> tuple[uuid.UUID, str]:
    """Store a file on the CDN; returns its id and filename as the CDN reports them."""
    url = f"{get_settings().cdn_base_url.rstrip('/')}/api/v1/files"
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(url, files={"file": (filename, content, content_type)})
    res.raise_for_status()
    body = res.json()
    return uuid.UUID(body["id"]), body["filename"]


class FileTooLargeError(Exception):
    """The file is larger than the caller is willing to read."""


async def download(file_id: uuid.UUID, filename: str, max_bytes: int) -> bytes:
    """Fetch a file's bytes; raises httpx.HTTPError or FileTooLargeError."""
    async with (
        httpx.AsyncClient(timeout=60) as client,
        client.stream("GET", file_url(file_id, filename)) as res,
    ):
        res.raise_for_status()
        data = bytearray()
        async for chunk in res.aiter_bytes():
            data += chunk
            if len(data) > max_bytes:
                raise FileTooLargeError(f"{filename} is larger than {max_bytes} bytes")
    return bytes(data)
