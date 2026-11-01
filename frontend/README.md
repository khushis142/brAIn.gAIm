# brAIn.gAIn Frontend

Angular 22 single-page application for the **brAIn.gAIn** learning feed: a vertical, TikTok-style feed that mixes short videos with small interactive mini-games. In production, nginx serves the app and forwards API calls to the Backend and file requests to the CDN.

## Architecture

```
┌──────────────────────────────── Browser ─────────────────────────────────┐
│                                                                          │
│  main.ts → App (header + <router-outlet>)                                │
│                │                                                         │
│                ▼  app.routes.ts  (requireAuth guard → /login if no JWT)  │
│  ┌─────────────────────────── Pages (modules/) ───────────────────────┐  │
│  │  /            Home feed ──► FeedCard ─┬─► FeedVideo  (MP4 player)  │  │
│  │                                       └─► FeedGame ─┐              │  │
│  │  /gamehub     game catalog + leaderboards ──────────┤              │  │
│  │  /knowledge   study projects & file uploads         │              │  │
│  │  /video-upload  MP4 upload + metadata               │              │  │
│  │  /wardrobe    zombie avatar / accessories           │              │  │
│  │  /settings    profile, interests, logout            │              │  │
│  │  /login /register                                   │              │  │
│  └──────────────┬──────────────────────────────────────┼──────────────┘  │
│                 │ inject()                            │                  │
│  ┌──────────── core/ (services) ────────┐   ┌───── engine/ ──────────┐   │
│  │ ApiService   ← every REST call,      │   │ GameEngineService      │   │
│  │              adds Bearer JWT from    │   │   └► GameSession       │   │
│  │              localStorage            │   │       │ postMessage    │   │
│  │ UserService  login / auth state      │   │       ▼ (protocol v2)  │   │
│  │ GamePrefetchService  pre-warms rounds│   │ ┌───────────────────┐  │   │
│  │ VideoUploadService   CDN + register  │   │ │ <iframe sandbox=  │  │   │
│  │ ZombieService        avatar state    │   │ │  "allow-scripts"> │  │   │
│  └───────┬──────────────────────┬───────┘   │ │ gameRuntime +     │  │   │
│          │                      │           │ │ runtime/ parts    │  │   │
│          │                      │           │ │ + game.js         │  │   │
│          │                      │           │ └───────────────────┘  │   │
│          │                      │           └────────────────────────┘   │
└──────────┼──────────────────────┼────────────────────────────────────────┘
           │ /api/...             │ /cdn/...
           ▼                      ▼
   ┌──────────────── nginx (Docker container, :80) ────────────────┐
   │  serves the built SPA (index.html fallback)                   │
   │  /api/ → http://backend:8000      /cdn/ → http://cdn:8080     │
   └───────────────────────────────────────────────────────────────┘
```

- **Pages** (`src/app/modules/`): one standalone, signal-based component per route.
- **Feed** (`src/app/modules/home/`): fetches one item at a time from the Backend (`POST feed/next`) and moves between cards with swipes or arrow keys. The last 20 items stay in history so you can scroll back, and cards within two steps of the current one stay mounted so a video or game resumes where it was. While a game is being played, it owns swipe and keyboard input.
- **Services** (`src/app/core/`): `ApiService` is the single entry point for Backend and CDN calls (auth, content, feed, games, likes, scores, leaderboards, zombie, projects). The other services build on it; `GamePrefetchService`, for example, requests game rounds in advance so games start without waiting.
- **Shared components** (`src/app/shared/`): header, game player and pause menu, zombie mascot, health badge, upload dropzone, and project folder / file items.
- **Game engine** (`src/app/engine/`): game code is untrusted (it may be LLM-generated), so it runs in a sandboxed iframe and talks to the page only through `postMessage`. See [Sandboxed Game Engine](#sandboxed-game-engine-srcappengine) below.

## Features & Routes

All routes except `/login` and `/register` are protected by the `requireAuth` guard defined in `src/app/app.routes.ts`. Unknown paths redirect to `/`.

| Route | Component | Description |
|---|---|---|
| `/` | `Home` (`src/app/modules/home/`) | Vertical swipe / arrow-key learning feed interleaving short MP4 videos (custom timeline scrubber, play/pause bubble, persistent Brain likes via button or double-tap) and sandboxed learning games with a pause menu, sound toggle, and leaderboards. |
| `/gamehub` | `Gamehub` (`src/app/modules/gamehub/`) | Searchable game catalog with a built-in player, replay, and per-game leaderboards. `/games` redirects here. |
| `/knowledge` | `Upload` (`src/app/modules/upload/`) | Study project workspace: create, rename, delete, and color-code project folders, upload study attachments (PDF, images, text, Markdown, CSV) to the CDN, view generated flashcards, and select the active study project for mini-games. `/upload` redirects here. |
| `/video-upload` | `VideoUpload` (`src/app/modules/video-upload/`) | MP4 uploader (up to 500 MB) to the CDN with content registration (title and tags) on the Backend. |
| `/wardrobe` | `Wardrobe` (`src/app/modules/wardrobe/`) | Zombie mascot customization: choose an avatar and equip unlocked accessories (head, eyes, neck, feet), with unlock progress for locked items. |
| `/settings` | `Settings` (`src/app/modules/settings/`) | User profile, study interests editor (`InterestsDialog`), and logout. |
| `/preview/wordle` | `PreviewWordle` (`src/app/modules/preview-wordle/`) | Temporary local-only harness for the Wordle prototype (`src/assets/games/wordle/`), bypassing the Backend. |
| `/login` | `Login` (`src/app/modules/user/login/`) | OAuth2 password login returning a bearer JWT stored in `localStorage` (`braingain-token`). |
| `/register` | `Register` (`src/app/modules/user/register/`) | Account registration followed by automatic login. |

## Sandboxed Game Engine (`src/app/engine/`)

Games run inside an isolated `<iframe sandbox="allow-scripts">` (opaque origin, strict Content-Security-Policy, heartbeat watchdog). Games call `registerGame()` and implement `init(api)`, `update(dt, input)`, and `render(ctx)`, with optional `resize`, `contextLost`, `contextRestored`, and `destroy` hooks.

The runtime that runs inside the iframe (`gameRuntime.ts` plus the parts in `runtime/`: sound, assets, viewport, WebGL helpers, keys, touch) is serialized into a script string by `gameRuntimeScript.ts` and injected into the iframe. Each game round comes with an asset manifest (`asset_manifest`) that is passed to `GameSession.start` and also determines which asset URLs the iframe's CSP allows.

See [`docs/game-authoring.md`](docs/game-authoring.md) for the full protocol v2 contract: package format and asset manifest, input state (`input.keys[code].{held, justPressed, justReleased}`, `input.pointer`, and multi-touch `input.touches`), sound, WebGL helpers, budgets, results, and host UI design hooks.

## Development & Testing

```bash
npm ci
npm start                  # ng serve on http://localhost:4200/
npm run build              # production build to dist/braingain/browser
npm test -- --watch=false  # Vitest unit test suite
```

The development build uses the Backend and CDN URLs in `src/environments/environment.development.ts`. The production build uses the relative paths `/api` and `/cdn`, which nginx proxies.

## Deployment

- `version.txt` holds the semantic version. Pushing a change to it on `main` triggers `.github/workflows/release-and-build.yaml`, which creates a release and publishes `ghcr.io/brain-gaim/frontend:<version>`. Renovate updates on `main` bump the version automatically (`.github/workflows/pr-bump-version.yaml`).
- `Dockerfile` builds the app with `node:22-alpine` and serves it with `nginx:1.31-alpine` (`nginx.conf`), which falls back to `index.html` for SPA routes and reverse-proxies `/api/` to `http://backend:8000` and `/cdn/` to `http://cdn:8080`.
- `docker-compose.yaml` runs the container on port `8080:80` in the `braingain` Docker network.
