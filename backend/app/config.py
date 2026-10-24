from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


class Settings(BaseSettings):
    # Empty values count as unset, so a blank required variable fails at startup.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_ignore_empty=True)

    database_url: str
    jwt_secret: str = Field(min_length=32)

    @field_validator("database_url")
    @classmethod
    def _use_async_driver(cls, value: str) -> str:
        """Accept plain postgres(ql):// URLs, as providers hand them out."""
        url = make_url(value)
        if url.get_backend_name() not in ("postgres", "postgresql"):
            raise ValueError("must be a PostgreSQL URL")
        return url.set(drivername="postgresql+asyncpg").render_as_string(hide_password=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # populated from env
