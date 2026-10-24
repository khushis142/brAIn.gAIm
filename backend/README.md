# brAIn.gAIn backend

FastAPI backend for a short-video learning feed: users scroll videos for their
education field, and every few videos a short JS game/quiz is served instead.

## Setup

### 1. Dependencies

**With nix:** `nix develop` (or `direnv allow`). Provides Python, uv and psql, syncs
`.venv` and activates it.

**Without nix:** install [uv](https://docs.astral.sh/uv/getting-started/installation/)
(e.g. `curl -LsSf https://astral.sh/uv/install.sh | sh`), then:

```sh
uv sync                    # creates .venv; downloads Python ≥3.13 if none is installed
source .venv/bin/activate  # optional, otherwise prefix commands with `uv run`
```

Dependencies live in `pyproject.toml` (pinned in `uv.lock`). Add one with
`uv add <pkg>` (or `uv add --dev <pkg>`), never with `pip install`.

### 2. Services and app

```sh
cp .env.example .env # point at the Postgres/S3 provided by the team
docker compose -f docker-compose.dev.yaml up -d # optional: local Postgres + S3 (RustFS) stand-ins, console on :9001
                                                # (direnv users: started automatically on cd)
alembic upgrade head
python -m app.seed seed/   # needs seed/manifest.json, see seed/manifest.example.json
fastapi dev app/main.py    # http://localhost:8000/docs
```

## API

| Method | Path                         | Auth | Purpose                                    |
| ------ | ---------------------------- | ---- | ------------------------------------------ |
| GET    | `/fields`                    |      | Education fields to pick at signup         |
| POST   | `/auth/register`             |      | `{username, password, field_id}`           |
| POST   | `/auth/token`                |      | OAuth2 password form → bearer JWT          |
| GET    | `/users/me`                  | ✓    | Current user                               |
| PATCH  | `/users/me`                  | ✓    | Change field `{field_id}`                  |
| POST   | `/feed/next`                 | ✓    | Next item: `{type: "video" \| "game", id, title, url}` |
| POST   | `/games/{id}/scores`         | ✓    | Submit `{score}`                           |
| GET    | `/games/{id}/leaderboard`    |      | Best score per user, `?limit=10`           |

`url` is a presigned S3 GET URL (valid 1h); the client fetches content directly from S3.

## Design

- **Feed decision** (`app/feed.py`): every `VIDEOS_PER_GAME` (3) videos a game is
  served, both scoped to the user's field. Unseen videos are preferred; once a field
  is exhausted videos repeat. If a field lacks one kind of content, the other is served.
  Every served item is stored as an `Impression`, which is the feed state.
- **Content**: files live in S3, metadata in Postgres. Ingestion is the seed CLI only
  (idempotent, keyed by S3 key) so there is no upload API to secure.
- **Migrations**: Alembic. After changing `app/models.py`:
  `alembic revision --autogenerate -m "..."`, review, `alembic upgrade head`.

## Tests

```sh
pytest                                    # unit tests
# + API tests against a throwaway DB (it is wiped), e.g. with docker compose:
docker compose -f docker-compose.dev.yaml exec postgres createdb -U braingain braingain_test
TEST_DATABASE_URL=postgresql+asyncpg://braingain:braingain@localhost:5432/braingain_test pytest
```
