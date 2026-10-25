"""Plain text of project attachments, so flashcards cover them too.

Text files are read as they are and PDFs are text-extracted; images are skipped. The files
are user uploads: anything unreadable is skipped rather than failing the whole project.
"""

import asyncio
import io
import logging
from pathlib import PurePosixPath

import httpx
from pypdf import PdfReader

from app import cdn
from app.models import ProjectAttachment

logger = logging.getLogger(__name__)

_TEXT_EXTENSIONS = {".txt", ".md", ".csv"}
_MAX_BYTES = 20_000_000


def readable(filename: str) -> bool:
    suffix = PurePosixPath(filename).suffix.lower()
    return suffix in _TEXT_EXTENSIONS or suffix == ".pdf"


def extract_text(filename: str, data: bytes, max_chars: int) -> str:
    """The file's text, at most `max_chars` (reading stops there); empty if it has none."""
    if PurePosixPath(filename).suffix.lower() in _TEXT_EXTENSIONS:
        return data.decode("utf-8", errors="replace")[:max_chars]
    if PurePosixPath(filename).suffix.lower() != ".pdf":
        return ""
    pages: list[str] = []
    length = 0
    for page in PdfReader(io.BytesIO(data)).pages:
        pages.append(page.extract_text() or "")
        length += len(pages[-1])
        if length >= max_chars:
            break
    return "\n\n".join(pages)[:max_chars]


async def attachment_text(attachment: ProjectAttachment, max_chars: int) -> str:
    """Raises httpx.HTTPError if the CDN can't be reached; other failures yield ""."""
    if not readable(attachment.filename):
        return ""
    try:
        data = await cdn.download(attachment.id, attachment.filename, _MAX_BYTES)
    except cdn.FileTooLargeError:
        logger.warning("skipping attachment %s: too large", attachment.id)
        return ""
    except httpx.HTTPStatusError as error:
        if error.response.status_code != 404:
            raise
        logger.warning("skipping attachment %s: not on the CDN", attachment.id)
        return ""
    try:
        # PDF parsing is CPU-bound; keep it off the event loop.
        return await asyncio.to_thread(extract_text, attachment.filename, data, max_chars)
    except Exception:  # malformed or encrypted user files fail in many ways
        logger.warning("skipping attachment %s: unreadable", attachment.id, exc_info=True)
        return ""
