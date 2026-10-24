import os
import uuid

import pytest
from pydantic import ValidationError

from app.generator import preconditions, tts
from app.generator.inputs import GameConfig
from app.generator.preconditions import PreconditionError, TtsStep, run_preconditions

SCHEMA = {
    "type": "object",
    "required": ["context", "questions"],
    "properties": {
        "context": {"type": "string", "minLength": 1},
        "intro": {"type": "string"},
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"question": {"type": "string"}, "answer": {"type": "integer"}},
            },
        },
    },
}


def _config(**step: str) -> GameConfig:
    return GameConfig(input_schema=SCHEMA, context="x", preconditions=[{"type": "tts", **step}])


def test_tts_step_must_fit_the_schema() -> None:
    assert _config(path="/questions/*/question", into="questionAudio").preconditions
    for step, error in [
        ({"path": "/questions/*/prompt", "into": "a"}, "unknown property 'prompt'"),
        ({"path": "/questions/*/answer", "into": "a"}, "must point to a string"),
        ({"path": "/questions/*/question", "into": "answer"}, "clashes"),
        ({"path": "/intro/*/question", "into": "a"}, "uses '\\*' on a non-array"),
        ({"path": "/questions/*", "into": "a"}, "String should match pattern"),
        ({"path": "questions", "into": "a"}, "String should match pattern"),
        ({"path": "/intro", "into": "bad-name"}, "String should match pattern"),
    ]:
        with pytest.raises(ValidationError, match=error):
            _config(**step)
    with pytest.raises(ValidationError):
        GameConfig(
            input_schema=SCHEMA, context="x", preconditions=[{"type": "sms", "path": "/intro"}]
        )


@pytest.fixture
def fake_audio(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, bytes]]:
    """Fake Piper and CDN; records every upload."""
    uploads: list[tuple[str, bytes]] = []

    async def synthesize(text: str) -> bytes:
        return b"RIFF" + text.encode()

    async def upload(content: bytes, filename: str, content_type: str) -> tuple[uuid.UUID, str]:
        assert content_type == "audio/wav"
        uploads.append((filename, content))
        return uuid.uuid4(), filename

    monkeypatch.setattr(preconditions.tts, "synthesize", synthesize)
    monkeypatch.setattr(preconditions.cdn, "upload", upload)
    return uploads


async def test_tts_writes_audio_urls_and_reports_assets(fake_audio: list) -> None:
    data = {
        "context": "c",
        "intro": "Welcome",
        "questions": [{"question": "One?", "answer": 0}, {"question": "Two?", "answer": 1}],
    }
    steps = [
        TtsStep(type="tts", path="/questions/*/question", into="questionAudio"),
        TtsStep(type="tts", path="/intro", into="introAudio"),
    ]
    assets = await run_preconditions(steps, data)

    assert assets == ["/questions/0/questionAudio", "/questions/1/questionAudio", "/introAudio"]
    assert [content for _, content in fake_audio] == [b"RIFFOne?", b"RIFFTwo?", b"RIFFWelcome"]
    assert data["questions"][1]["questionAudio"].startswith("https://cdn.test/files/")
    assert data["questions"][1]["question"] == "Two?"  # source text stays


async def test_missing_values_are_skipped(fake_audio: list) -> None:
    step = TtsStep(type="tts", path="/intro", into="introAudio")
    assert await run_preconditions([step], {"context": "c"}) == []
    assert fake_audio == []


async def test_tts_failure_becomes_precondition_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tts, "get_settings", lambda: type("S", (), {"tts_url": None})())
    step = TtsStep(type="tts", path="/intro", into="introAudio")
    with pytest.raises(PreconditionError, match="TTS_URL is not configured"):
        await run_preconditions([step], {"context": "c", "intro": "Hi"})


@pytest.mark.skipif("TEST_TTS_URL" not in os.environ, reason="TEST_TTS_URL not set")
async def test_real_piper(monkeypatch: pytest.MonkeyPatch) -> None:
    url = os.environ["TEST_TTS_URL"]
    monkeypatch.setattr(tts, "get_settings", lambda: type("S", (), {"tts_url": url})())
    audio = await tts.synthesize("Which planet is the largest?")
    assert audio[:4] == b"RIFF" and audio[8:12] == b"WAVE"
