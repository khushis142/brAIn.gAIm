import json
import re

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.generator.llm import FakeLLM, get_llm

FORBIDDEN = re.compile(r"\b(fetch|XMLHttpRequest|import|eval|localStorage)\b|https?://")


def test_fake_is_the_default_provider() -> None:
    assert isinstance(get_llm(), FakeLLM)


def test_unknown_provider_is_rejected() -> None:
    with pytest.raises(ValidationError, match="llm_provider"):
        Settings(llm_provider="openai")


async def test_fake_returns_valid_bundles() -> None:
    llm = FakeLLM()
    replies = {
        await llm.generate("system", [{"role": "user", "content": topic}], max_tokens=1000)
        for topic in ["sorting", "planets", "kubernetes", "photosynthesis", "rust", "jazz"]
    }
    assert len(replies) > 1
    for reply in replies:
        bundle = json.loads(reply)
        assert bundle["manifest"]["format"] == "braingain-game@1"
        assert len(bundle["game_js"].encode()) <= 200_000
        assert not FORBIDDEN.search(bundle["game_js"])
        for concept in bundle["manifest"]["concepts"]:
            assert f'"{concept["id"]}"' in bundle["game_js"]


async def test_fake_is_deterministic() -> None:
    llm = FakeLLM()
    messages = [{"role": "user", "content": "sorting"}]
    first = await llm.generate("system", messages, max_tokens=1000)
    assert await llm.generate("system", messages, max_tokens=1000) == first
