# Agent instructions

FastAPI backend for a short-video learning feed (see README.md for setup and API).

## Commands

```sh
nix develop                 # or: uv sync && source .venv/bin/activate
ruff check . && ruff format .
pytest                      # unit tests; API tests also need TEST_DATABASE_URL (DB is wiped)
TEST_DATABASE_URL=postgresql://braingain:braingain@localhost:5432/braingain_test pytest
fastapi dev app/main.py     # needs .env (copy .env.example) and a running Postgres
```

Model change: edit the domain module in `app/models/` (re-export new models in
`app/models/__init__.py`), then `alembic revision --autogenerate -m "..."`,
review the generated file (add data conversion where needed), `alembic upgrade head`,
`alembic check`.

## Architecture rules

- Files live on the CDN service (github.com/brAIn-gAIm/CDN); clients upload there
  directly. The backend owns all metadata (`content` table, keyed by the CDN file id)
  and never handles file bytes or S3.
- Delivery URLs are always built by `app/cdn.py` from `CDN_BASE_URL`; never store or
  return a client-supplied URL (games are JS that runs in the app).
- Users' free-text `interests` are the input for feed personalization (not built yet).
- Projects (`app/models/projects.py`) are private to their owner and replace the planned
  decks and documents; their attachments are CDN files like content.
- Users can register only videos via the API. Games (JS that runs in the app) are created
  by server-side code only (generator, seeding) after validation; never add an API path
  that accepts game code or game files from clients.
- Feed decisions live in `app/feed.py`; routers stay thin.
- Settings come from env via `app/config.py`; add a variable only when the value
  really differs between environments, and update `.env.example` and
  `docker-compose.yaml` with it.

## Conventions

- Dependencies: `uv add <pkg>` / `uv add --dev <pkg>`, never `pip install`.
- Commits: conventional style (`feat:`, `fix:`, `chore:`, `refactor:`), no
  co-author or AI attribution lines.
- Never commit `.env` or `.env.*` files (except `.env.example`).

## Deployment

1. Bump `version.txt` on `main`; CI publishes `ghcr.io/brain-gaim/backend:<version>`.
2. After CI succeeds, set that tag in `docker-compose.yaml`; Portainer redeploys.

Never use `:latest`. The container runs migrations on start.

## Pitfalls

- Nix flakes only see files tracked by git: `git add` new files before `nix develop`.
- `docker-compose.yaml` is production; local Postgres is `docker-compose.dev.yaml`.
