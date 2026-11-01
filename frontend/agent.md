# Agent instructions — Frontend

Angular 22 frontend for the brAIn.gAIn short-video and mini-game learning feed (`github.com/brAIn-gAIm/Frontend`). See `README.md` for the architecture diagram and route overview.

## Commands

```sh
npm ci
npm start                  # dev server on http://localhost:4200
npm run build              # production build (dist/braingain/browser)
npm test -- --watch=false  # run Vitest unit tests
```

## Architecture & Rules

- **Standalone Angular + Signals**: All components are standalone, use `inject()` for dependency injection, and use Angular signals (`signal`, `computed`, `input`, `output`, `viewChild`, `viewChildren`). Styling uses Tailwind CSS 4 and per-component CSS; icons come from `@lucide/angular`.
- **Routing (`src/app/app.routes.ts`)**: The `requireAuth` guard is defined inline in the routes file and redirects to `/login` when `UserService.isAuthenticated()` is false. Every route except `/login` and `/register` uses it. `/games` → `/gamehub` and `/upload` → `/knowledge` are redirects; `/preview/wordle` is a temporary local-only harness to be removed once Wordle is served by the Backend.
- **API & CDN communication (`src/app/core/`)**:
  - `ApiService` (`src/app/core/api.service.ts`) is the only place that talks to the Backend (`environment.apiBaseUrl`) and the CDN (`environment.cdnBaseUrl`). It attaches `Authorization: Bearer <token>` from `localStorage` (`braingain-token`). Add new endpoints here rather than calling `HttpClient` from components.
  - `VideoUploadService` (`src/app/core/video-upload.service.ts`) validates `.mp4` files (max 500 MB), uploads the file to the CDN (`POST /api/v1/files`), and registers metadata on the Backend (`POST /content`).
  - `GamePrefetchService` caches game rounds in memory (`prefetch()` / `consume()`) so games start and restart without waiting.
  - `ZombieService` holds the player's zombie mascot state (avatar, unlocked and equipped accessories) as signals.
- **Feed (`src/app/modules/home/`)**: `Home` keeps a history of up to 20 entries (`FeedHistory` in `feed.ts`) and keeps cards within two steps of the current one mounted. A game that is being played owns swipe and arrow-key input (`gameOwnsInput`) and must finish before the feed moves forward.
- **Sandboxed Game Runtime (`src/app/engine/`)**:
  - The in-iframe runtime is `gameRuntime.ts` (loop, lifecycle, `api`, host messages) plus its parts in `runtime/` (sound, assets, viewport, WebGL helpers, keys, touch). `gameRuntimeScript.ts` serializes all of them with `toString()` into `GAME_RUNTIME_SCRIPT` and hands the parts to `gameRuntime` as its `parts` argument. Keep every one self-contained: only `import type` and browser globals, never a value import; shared values (budgets, keys, protocol version) arrive through `config`. A new part gets a factory in `runtime/`, an entry in `GameRuntimeParts` and one in `gameRuntimeScript.ts`.
  - Untrusted/LLM-seeded game JS runs inside `<iframe sandbox="allow-scripts">` via `GameEngineService` and `GameSession` (protocol v2, `docs/game-authoring.md`).
  - Never add `allow-same-origin` to the game iframe sandbox.
  - `input.keys[code]` provides `KeyState` objects (`{ held, justPressed, justReleased }`) for `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, and `Space`.
  - `input.touches` lists every finger (oldest first, canvas pixels, `justStarted`/`justEnded`/`cancelled`); `input.pointer` follows the primary pointer only.
  - The Backend serves each game round with its asset manifest as `asset_manifest`; `FeedGame` and `GamePlayer` pass it to `GameSession.start` as `assets` (`GamePlayer` merges in the zombie art it inlines). The manifest URLs also form the iframe's CSP sources for images, media, fonts, and `connect-src`. When a round has TTS/media `assets` (JSON Pointers into `data`), `data` is passed into `session.start()` as well.
  - Keep `docs/game-authoring.md` in sync with any protocol or runtime API change.
- **Nginx reverse proxy (`nginx.conf`)**:
  - Serves the SPA (`try_files $uri $uri/ /index.html`) on port 80 and proxies `/api/` to `http://backend:8000` and `/cdn/` to `http://cdn:8080` using Docker's embedded DNS resolver (`127.0.0.11`).

## Deployment

1. Bump `version.txt` on `main` (and keep the `package.json` version aligned); CI publishes `ghcr.io/brain-gaim/frontend:<version>`. Renovate commits on `main` are bumped automatically by `.github/workflows/pr-bump-version.yaml`.
2. Update the image tag in `docker-compose.yaml` after CI succeeds.
