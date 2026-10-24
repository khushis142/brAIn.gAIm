# brAIn.gAIn backend

FastAPI backend for a short-video learning feed: users scroll videos for their
interests, and every few videos a short JS game/quiz is served instead.

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
cp .env.example .env # point at the Postgres provided by the team
docker compose -f docker-compose.dev.yaml up -d # optional: local Postgres
                                                # (direnv users: started automatically on cd)
alembic upgrade head
fastapi dev app/main.py    # http://localhost:8000/docs
```

## API

| Method | Path                         | Auth | Purpose                                    |
| ------ | ---------------------------- | ---- | ------------------------------------------ |
| POST   | `/auth/register`             |      | `{username, password}`                     |
| POST   | `/auth/token`                |      | OAuth2 password form → bearer JWT          |
| GET    | `/users/me`                  | ✓    | Current user                               |
| PATCH  | `/users/me`                  | ✓    | `{interests}`: free text, `null` clears    |
| POST   | `/content`                   | ✓    | Register an uploaded video: `{id, filename, title, tags}` |
| GET    | `/content`                   |      | List, filters `kind`, `tag`, `owner`; `limit`/`offset` |
| GET    | `/content/{id}`              |      | One item with `url`                        |
| PATCH  | `/content/{id}`              | ✓    | Owner only: `{title?, tags?}`              |
| DELETE | `/content/{id}`              | ✓    | Owner only; the CDN file is kept           |
| GET    | `/projects`                  | ✓    | Own projects (private to the owner)        |
| POST   | `/projects`                  | ✓    | `{name, body}`, body is Markdown           |
| GET    | `/projects/{id}`             | ✓    | One project with its attachments           |
| PATCH  | `/projects/{id}`             | ✓    | `{name?, body?}`                           |
| DELETE | `/projects/{id}`             | ✓    | Project and attachment records; CDN files are kept |
| POST   | `/projects/{id}/attachments` | ✓    | Attach a CDN upload `{id, filename}` (pdf, png, jpg, webp, gif, txt, md, csv) |
| DELETE | `/projects/{id}/attachments/{file_id}` | ✓ | Detach; CDN file is kept           |
| POST   | `/feed/next`                 | ✓    | Next item: video `{type, id, title, url}` or game `{…, round_id, data, assets}` |
| POST   | `/games/{id}/scores`         | ✓    | Submit `{score}`                           |
| GET    | `/games/{id}/leaderboard`    |      | Best score per user, `?limit=10`           |

**Uploading:** the client uploads the file to the [CDN](https://github.com/brAIn-gAIm/CDN)
(`POST /api/v1/files`), then registers the returned `id` and `filename` with
`POST /content`. Videos must be `.mp4`. Every `url` in this API is built from
`CDN_BASE_URL` and the id; client-supplied URLs are never stored.

**Games** are fixed JS files on the CDN with a `config` in the database:
`{"input_schema": <JSON Schema>, "context": "..."}`. When the feed serves a game, the LLM
writes `data` matching the schema from the context and the user's projects; it is
validated, stored as a game round and returned with the game's `url`. The frontend starts
the game with it (`session.start(code, {username, data})`, see `games/README.md`).
Rounds are prepared ahead of time: after every `/feed/next`, a background task tops the
user up to one ready round (LLM plus the game's `preconditions`, e.g. TTS via Piper at
`TTS_URL`), so serving a game never waits. `assets` lists JSON Pointers into `data` whose
values are CDN URLs (e.g. audio); the frontend fetches them and swaps in `data:` URLs,
because the game iframe has no network access (its CSP allows `data:` media).
Games cannot be registered through the API; publish one with the seed command:

```sh
python -m app.seed_game games/example-quiz --title "Example quiz" --owner <username>
```

`games/README.md` is the spec for game authors; `games/example-quiz/` is the reference game.

### Bruno collection

`bruno/` is a [Bruno](https://www.usebruno.com/) collection for the API and CDN. Open the
folder in Bruno, copy `bruno/.env.example` to `bruno/.env` with an existing user, pick the
`prod` or `local` environment, and run **auth/Login** first; its token is inherited by all
other requests. Uploads set `fileId`/`filename`, project creation sets `projectId`.

## Design

- **Feed decision** (`app/feed.py`): every `VIDEOS_PER_GAME` (3) videos a game is
  served. Unseen items are preferred; once everything was seen, items repeat. If one
  kind has no content, the other is served. Personalization based on the users'
  free-text `interests` is planned but not implemented yet.
  Every served item is stored as an `Impression`, which is the feed state.
- **Content**: the CDN only stores files. All metadata (owner, kind, title, tags)
  lives in the `content` table, keyed by the CDN file id.
- **Projects**: a user's private knowledge (Markdown body plus CDN attachments), the
  input for enriching generated games later. They replace the planned decks and
  documents (#20). Other users get 404, not 403, so projects don't reveal they exist.
- **Migrations**: Alembic. After changing a model in `app/models/` (one module per domain;
  re-export new models in `app/models/__init__.py` so autogenerate sees them):
  `alembic revision --autogenerate -m "..."`, review, `alembic upgrade head`.

## Deployment

CI (`.github/workflows/`) builds `ghcr.io/brain-gaim/backend` (amd64 + arm64) and
tags it `:<version>` whenever `version.txt` changes on `main`. To release and deploy:

1. Bump `version.txt` and push; wait for the *Release and Build* run to finish.
2. Set the image tag in `docker-compose.yaml` to that version and push.

Renovate's automatic version bumps also publish images but never deploy them;
deploying stays step 2.

The container runs `alembic upgrade head` on start, then serves on port 8000,
published on host port 3000
(healthcheck: `/health`).

Portainer setup (once):

1. *Stacks → Add stack → Repository*: this repo, compose path `docker-compose.yaml`.
2. Enable *GitOps updates* (polling or webhook). Pushing a new image tag in
   `docker-compose.yaml` then redeploys the stack.
3. Set the stack environment variables (all required): `DATABASE_URL`,
   `JWT_SECRET`, `CDN_BASE_URL`. Easiest: import `.env.example` via *Load variables from .env file*
   and replace every value.

## Tests

```sh
pytest                                    # unit tests
# + API tests against a throwaway DB (it is wiped), e.g. with docker compose:
docker compose -f docker-compose.dev.yaml exec postgres createdb -U braingain braingain_test
TEST_DATABASE_URL=postgresql+asyncpg://braingain:braingain@localhost:5432/braingain_test pytest
```
