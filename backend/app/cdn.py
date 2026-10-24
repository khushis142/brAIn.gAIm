"""Links to files on the CDN service (github.com/brAIn-gAIm/CDN).

Clients upload straight to the CDN and register the returned id here; delivery URLs
are always derived from that id, never taken from the client.
"""

import uuid
from urllib.parse import quote

from app.config import get_settings


def file_url(file_id: uuid.UUID, filename: str) -> str:
    base = get_settings().cdn_base_url.rstrip("/")
    return f"{base}/files/{file_id}/{quote(filename)}"
