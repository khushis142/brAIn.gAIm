"""Text to speech via Piper's HTTP server (github.com/OHF-Voice/piper1-gpl)."""

import httpx

from app.config import get_settings


class TTSError(Exception):
    pass


async def synthesize(text: str) -> bytes:
    """Return `text` spoken as a WAV file."""
    base = get_settings().tts_url
    if not base:
        raise TTSError("TTS_URL is not configured")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(f"{base.rstrip('/')}/synthesize", json={"text": text})
        res.raise_for_status()
    except httpx.HTTPError as error:
        raise TTSError(f"Piper request failed: {error}") from error
    # Piper labels its WAV as text/html, so check the bytes instead of the header.
    if not res.content.startswith(b"RIFF"):
        raise TTSError("Piper did not return a WAV file")
    return res.content
