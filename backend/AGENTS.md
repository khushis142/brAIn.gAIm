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

Model change: edit `app/models.py`, then `alembic revision --autogenerate -m "..."`,
review the generated file (add data conversion where needed), `alembic upgrade head`,
`alembic check`.

## Architecture rules

- All content (study fields, videos, games) comes from the CMS via `app/cms.py`.
  It is an in-process mock until the real CMS API exists; keep its function
  signatures and change only the bodies. Never add S3 or file storage here.
- The database stores only CMS ids (user field slug, impressions, scores), never
  content metadata.
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
