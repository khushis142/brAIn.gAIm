"""LLM adapters behind one interface; the pipeline only sees `LLM` (#27)."""

from functools import lru_cache

from app.config import get_settings
from app.generator.llm.base import LLM, LLMBudgetError, LLMError, Message
from app.generator.llm.chat_completions import ChatCompletionsLLM
from app.generator.llm.fake import FakeLLM

__all__ = [
    "LLM",
    "ChatCompletionsLLM",
    "FakeLLM",
    "LLMBudgetError",
    "LLMError",
    "Message",
    "get_llm",
]


@lru_cache
def get_llm() -> LLM:
    """The adapter selected by LLM_PROVIDER."""
    settings = get_settings()
    match settings.llm_provider:
        case "fake":
            return FakeLLM()
        case "litellm" | "ollama":
            # The settings validator guarantees these are set for these providers.
            assert settings.llm_base_url and settings.llm_model
            key = settings.llm_api_key
            return ChatCompletionsLLM(
                settings.llm_base_url, settings.llm_model, key.get_secret_value() if key else None
            )
