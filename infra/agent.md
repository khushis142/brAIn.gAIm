# Agent instructions — Infra

Docker Compose stacks for the shared brAIn.gAIn infrastructure (`github.com/brAIn-gAIm/Infra`).

## Services & Internal URLs

All services join the `braingain` Docker bridge network (`networks.default.name: braingain`):

| Directory | Container | Host Port(s) | Internal Network URL | Purpose |
|---|---|---|---|---|
| `postgres/` | `postgres` | `5432:5432` | `postgresql://braingain:braingain@postgres:5432/braingain` | Primary PostgreSQL 18 database (`postgres:18.6-alpine3.24`) |
| `rustfs/` | `rustfs`, `s3-init` | `9000:9000`, `9001:9001` | `http://rustfs:9000` | S3-compatible object storage for CDN (`rustfs/rustfs:1.0.3`); `s3-init` ensures bucket `braingain` exists |
| `piper/` | `piper` | `5000:5000` | `http://piper:5000` | Local Piper TTS HTTP server (`piper-tts[http]==1.8.0`, voice `en_US-hfc_female-medium`) |
| `llama/` | `llama` | `8082:8080` | `http://llama:8080/v1` | Self-hosted CPU OpenAI-compatible LLM server (`llama.cpp` with `unsloth/Qwen3-1.7B-GGUF:Q4_K_M`, reasoning disabled) |
| `glances/` | `glances` | `61208:61208` | `http://glances:61208` | Host & container monitoring web UI |

## Commands

```sh
docker compose -f postgres/docker-compose.yml up -d
docker compose -f rustfs/docker-compose.yml up -d
docker compose -f piper/docker-compose.yml up -d --build
docker compose -f llama/docker-compose.yml up -d
docker compose -f glances/docker-compose.yml up -d
```

## Rules & Conventions

- Keep container names, ports, and the `braingain` network name consistent: `Backend`, `CDN`, and `Frontend` production stacks depend on `postgres`, `rustfs`, `piper`, and `llama` resolving on the `braingain` network.
- Host port `8080` is used by `frontend` and `8081` by `cdn`; `llama` publishes on host port `8082` (`8082:8080`).
- When changing the Piper voice in `piper/`, update `VOICE` in `piper/Dockerfile` and `piper/docker-compose.yml` and rebuild `braingain/piper:1.8.0`.
