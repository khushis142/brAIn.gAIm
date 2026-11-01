from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


class Settings(BaseSettings):
    # Empty values count as unset, so a blank required variable fails at startup.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_ignore_empty=True)

    database_url: str
    jwt_secret: str = Field(min_length=32)
    # Public base URL of the CDN service, e.g. https://cdn.example.com
    cdn_base_url: str
    # Piper's HTTP server (POST /synthesize), e.g. http://piper:5000; only games with a
    # `tts` precondition need it.
    tts_url: str | None = None
    # LLM adapter for the game generator: "fake" (canned replies, no key), "litellm" (the
    # proxy in front of Anthropic, #44) or "ollama" (a local model for development).
    llm_provider: Literal["fake", "litellm", "ollama"] = "fake"
    # litellm: the proxy's URL, a model alias from its config.yaml, and a budgeted virtual key
    # of the proxy (never the Anthropic key). ollama: a pulled model, e.g. "qwen3:8b"; the
    # URL defaults to the local Ollama and no key is needed.
    llm_base_url: str | None = None
    llm_model: str | None = None
    llm_api_key: SecretStr | None = None

    @field_validator("database_url")
    @classmethod
    def _use_async_driver(cls, value: str) -> str:
        """Accept plain postgres(ql):// URLs, as providers hand them out."""
        url = make_url(value)
        if url.get_backend_name() not in ("postgres", "postgresql"):
            raise ValueError("must be a PostgreSQL URL")
        return url.set(drivername="postgresql+asyncpg").render_as_string(hide_password=False)

    @model_validator(mode="after")
    def _provider_settings(self) -> "Settings":
        if self.llm_provider == "ollama" and self.llm_base_url is None:
            self.llm_base_url = "http://localhost:11434/v1"
        required = {
            "fake": (),
            "litellm": ("llm_base_url", "llm_model", "llm_api_key"),
            "ollama": ("llm_model",),
        }[self.llm_provider]
        if missing := [name for name in required if getattr(self, name) is None]:
            raise ValueError(f"LLM_PROVIDER={self.llm_provider} needs {', '.join(missing).upper()}")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # populated from env
