import pytest
from pydantic import ValidationError

from app.config import Settings

EXPECTED = "postgresql+asyncpg://u:p%40ss@db:5432/app"


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://u:p%40ss@db:5432/app",
        "postgres://u:p%40ss@db:5432/app",
        "postgresql+asyncpg://u:p%40ss@db:5432/app",
        "postgresql+psycopg://u:p%40ss@db:5432/app",
    ],
)
def test_database_url_uses_asyncpg(url: str) -> None:
    assert Settings(database_url=url).database_url == EXPECTED


def test_database_url_rejects_other_databases() -> None:
    with pytest.raises(ValidationError, match="PostgreSQL"):
        Settings(database_url="mysql://u:p@db/app")
