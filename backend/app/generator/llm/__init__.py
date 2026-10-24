"""LLM adapters behind one interface; the pipeline only sees `LLM` (#27)."""

from functools import lru_cache

from app.config import get_settings
from app.generator.llm.base import LLM, Message
from app.generator.llm.fake import FakeLLM

__all__ = ["LLM", "FakeLLM", "Message", "get_llm"]


@lru_cache
def get_llm() -> LLM:
    """The adapter selected by LLM_PROVIDER."""
    match get_settings().llm_provider:
        case "fake":
            return FakeLLM()
