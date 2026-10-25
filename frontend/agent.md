# Agent instructions — Frontend

Angular 21 frontend for the brAIn.gAIn short-video and mini-game learning feed (`github.com/brAIn-gAIm/Frontend`).

## Commands

```sh
npm ci
npm start                  # dev server on http://localhost:4200
npm run build              # production build (dist/braingain/browser)
npm test -- --watch=false  # run Vitest unit tests
```

## Architecture & Rules

- **Standalone Angular + Signals**: All components are standalone, use `inject()` for dependency injection, and use Angular signals (`signal`, `computed`, `input`, `output`, `viewChild`).
- **API & CDN communication (`src/app/core/`)**:
  - `ApiService` (`src/app/core/api.service.ts`) handles Backend REST calls (`environment.apiUrl`) and attaches `Authorization: Bearer <token>` from `localStorage` (`braingain-token`).
  - `VideoUploadService` (`src/app/core/video-upload.service.ts`) validates `.mp4` files (max 500 MB), uploads binary files to the CDN (`POST /api/v1/files`), and registers metadata on the Backend (`POST /content`).
- **Sandboxed Game Runtime (`src/app/engine/` & `src/assets/game-runtime.js`)**:
  - Untrusted/LLM-seeded game JS runs inside `<iframe sandbox="allow-scripts">` via `GameEngineService` and `GameSession` (protocol v2, `docs/game-authoring.md`).
  - Never add `allow-same-origin` to the game iframe sandbox.
  - `input.keys[code]` provides `KeyState` objects (`{ held, justPressed, justReleased }`) for `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, and `Space`.
  - `input.touches` lists every finger (oldest first, canvas pixels, `justStarted`/`justEnded`/`cancelled`); `input.pointer` follows the primary pointer only.
  - When a game round is served with TTS/media `assets` (JSON Pointers into `data`), `data` is passed into `session.start()`.
- **Nginx reverse proxy (`nginx.conf`)**:
  - Serves the SPA (`try_files $uri $uri/ /index.html`) on port 80 and proxies `/api/` to `http://backend:8000` and `/cdn/` to `http://cdn:8080` using Docker's embedded DNS resolver (`127.0.0.11`).

## Deployment

1. Bump `version.txt` on `main` (and keep `package.json` version aligned); CI publishes `ghcr.io/brain-gaim/frontend:<version>`.
2. Update the image tag in `docker-compose.yaml` after CI succeeds.
