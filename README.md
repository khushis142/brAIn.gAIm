# brAIn.gAIn

Hackathon project: a TikTok-style learning feed that mixes short videos with
LLM-generated mini-games built from your own study material.

| Folder | What it is | Stack |
|---|---|---|
| [frontend](frontend) | Feed, game hub, sandboxed game engine | Angular 22 |
| [backend](backend) | API, feed logic, LLM game/flashcard generation | FastAPI, Postgres |
| [cdn](cdn) | Static asset/video delivery | Go, S3 (RustFS) |
| [infra](infra) | Docker Compose full local stack | Docker, Piper TTS, llama.cpp |
| [slides](slides) | Hackathon presentation | |

## Run it locally
See [infra/README.md](infra/README.md): `docker compose up -d`

## My role
Frontend Engineering