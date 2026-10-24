# brAIn.gAIn Frontend

Angular 21 single-page application for the **brAIn.gAIn** short-video and interactive mini-game learning feed.

## Features & Routes

All application routes (except `/login` and `/register`) are protected by the `requireAuth` route guard (`src/app/core/auth.guard.ts`).

| Route | Component | Description |
|---|---|---|
| `/` | `Home` (`src/app/modules/home/`) | Vertical swipe / `ArrowDown` learning feed interleaving short MP4 videos (custom timeline scrubber, play/pause bubble, double-tap brain-burst likes) and sandboxed iframe learning games (`GameEngineService` / `GameSession`). |
| `/upload` | `Upload` (`src/app/modules/upload/`) | Study project workspace: create, rename, delete, and color-code project folders, upload study attachments (PDF, images, text, Markdown, CSV) to the CDN, and select the active study project for mini-games. |
| `/video-upload` | `VideoUpload` (`src/app/modules/video-upload/`) | MP4 video uploader (up to 500 MB) to the CDN and content registration with title and tags on the Backend. |
| `/settings` | `Settings` (`src/app/modules/settings/`) | User profile view, study interests editor (`InterestsDialog`), and logout. |
| `/login` | `Login` (`src/app/modules/user/login/`) | OAuth2 password login returning a bearer JWT stored in `localStorage` (`braingain-token`). |
| `/register` | `Register` (`src/app/modules/user/register/`) | Account registration and automatic login. |

## Sandboxed Game Engine (`src/app/engine/` & `src/assets/game-runtime.js`)

Games run inside an isolated `<iframe sandbox="allow-scripts">` (opaque origin, strict Content-Security-Policy, heartbeat watchdog). Games call `registerGame()` and implement `init(api)`, `update(dt, input)`, and `render(ctx)` (with optional `resize`, `contextLost`, `contextRestored`, and `destroy` hooks).

See [`docs/game-authoring.md`](docs/game-authoring.md) for the complete protocol v2 contract, input state (`input.keys[code].{held, justPressed, justReleased}` and `input.pointer`), WebGL helpers, and UI design hooks.

## Development & Testing

```bash
npm ci
npm start                  # ng serve on http://localhost:4200/
npm run build              # production build to dist/braingain/browser
npm test -- --watch=false  # Vitest unit test suite
```

## Deployment

- `version.txt` tracks the semantic version (`0.2.8`). Pushing a change to `version.txt` on `main` triggers `.github/workflows/release-and-build.yaml` to publish `ghcr.io/brain-gaim/frontend:<version>`.
- `Dockerfile` builds the Angular app with Node 22 and serves it with `nginx:1.31-alpine` (`nginx.conf`), reverse-proxying `/api/` to `http://backend:8000` and `/cdn/` to `http://cdn:8080`.
- `docker-compose.yaml` deploys the container on port `8080:80` attached to the `braingain` Docker network.
