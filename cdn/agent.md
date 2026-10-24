# Agent instructions — CDN

Go static asset CDN service for brAIn.gAIn (`github.com/brAIn-gAIm/CDN`), backed by S3-compatible storage (RustFS).

## Commands

```sh
docker compose -f docker-compose.dev.yaml up -d   # local RustFS on :9000/:9001
go run ./cmd/server                               # run server on :8080
go vet ./...                                      # static analysis
go test -race -v ./...                            # run unit tests
```

## Architecture & Rules

- **Stateless binary delivery**: The CDN stores and streams files (`video/mp4`, `audio/*`, `model/*`, `application/javascript`, `application/pdf`, `text/*`, `image/*`) in S3 under `<uuid>/<filename>`. All domain metadata (owners, tags, projects, content records) lives in the Backend Postgres database.
- **No arbitrary file execution or HTML**: `validateAssetType` in `internal/handler/handler.go` strictly whitelists permitted extensions and MIME categories.
- **Upload limits & cleanup**: Request bodies are bounded by `MAX_UPLOAD_SIZE_MB` via `http.MaxBytesReader`. Multipart form overflow files and temporary upload buffers are always cleaned up on request completion.
- **Immutable caching & byte-range support**: `GET /files/{id}` and `GET /files/{id}/{filename}` support `Range` requests (`206 Partial Content`), `ETag` (`If-None-Match` -> `304 Not Modified`), and set `Cache-Control: public, max-age=31536000, immutable`.
- **OpenAPI embedded spec**: `api/openapi.yaml` is embedded via `api/embed.go` and served at `/swagger/openapi.yaml` (UI at `/swagger/` and `/docs`). Keep `api/openapi.yaml` synchronized with `internal/handler/handler.go`.

## Key Files

- `cmd/server/main.go`: Entrypoint, HTTP server setup, graceful shutdown, CORS/logging/recovery middleware.
- `internal/config/config.go`: Environment variable configuration (`PORT`, `CDN_BASE_URL`, `MAX_UPLOAD_SIZE_MB`, `S3_*`).
- `internal/storage/s3.go`: AWS SDK v2 S3 client wrapper (`Upload`, `Get`, `Delete`, `FindKeyByID`, `DeleteByID`, auto-bucket creation).
- `internal/handler/handler.go`: HTTP route handlers (`UploadFiles`, `UpdateFile`, `DeleteFile`, `DeliverFile`, `HealthCheck`, Swagger UI).
- `internal/model/asset.go`: JSON response models (`FileUploadResult`, `UploadResponse`).
- `api/openapi.yaml`: OpenAPI 3.0.3 specification.

## Deployment

1. Bump `version.txt` on `main`; CI (`.github/workflows/release-and-build.yaml`) builds and publishes `ghcr.io/brain-gaim/cdn:<version>`.
2. Update the image tag in `docker-compose.yaml` for Portainer GitOps deployment (host port `8081:8080` on network `braingain`).
