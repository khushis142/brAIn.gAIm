# Security Model: Running Games in the Feed

The feed runs mini-games whose code the frontend cannot vouch for. This page explains what could go wrong, how the frontend contains it, and what is still left to the backend. The full contract for game authors is in [`game-authoring.md`](game-authoring.md).

## What we have to protect against

A game round has two parts:

- **Game code** (`game.js`): fixed JavaScript, published once per game. It comes from a game author, not from the user's own team, and it may contain mistakes or be malicious.
- **Round data** (`data`): questions, words, and other content that the backend has a language model generate from the player's study material for each round. It is untrusted model output.

Both run inside the user's browser, right next to a logged-in session. Without isolation, a game could:

- read the user's login token from `localStorage` and take over the account
- read or change the page around it (the feed, likes, the user's projects)
- send the user's data to any server
- freeze the tab with an endless loop, or exhaust memory with huge canvases or downloads
- flood the app with fake results or oversized messages

## How the frontend contains a game

Each round runs in its own `<iframe>`, created by `GameSession` (`src/app/engine/gameSession.ts`).

**1. The iframe is a separate, anonymous origin.** It is created with `sandbox="allow-scripts"` and nothing else. Without `allow-same-origin`, the browser treats it as a foreign site: the game cannot reach the app's DOM, cookies, `localStorage` (and therefore the login token), or the user's session. It also cannot open pop-ups, submit forms, or navigate the page. Adding `allow-same-origin` would undo all of this, so the project rules forbid it.

**2. A strict Content Security Policy limits what the game can load.** The iframe's document starts with a CSP of `default-src 'none'` and opens only what a game needs:

| Allowed | Source |
|---|---|
| Scripts | the inline runtime and game code, plus `https://esm.sh` for JavaScript modules |
| Images, audio, fonts | `data:` / `blob:` URLs, the game asset path on the CDN, and the exact HTTPS URLs listed in the round's asset manifest |
| Network requests | the same asset URLs and `https://esm.sh` |
| Everything else | blocked |

Asset URLs are allowed by **exact path**, not by whole host, so a game cannot reach other files on the same server.

**3. The page and the game only exchange checked messages.** They communicate through `postMessage`. The page accepts a message only if it comes from that game's own iframe and has a known, well-formed shape (`isSandboxEvent` in `gameProtocol.ts`). Error texts are cut to 500 characters, and UI customization is limited to a fixed set of tokens. A game cannot inject HTML, CSS, URLs, or components into the page. The game receives only what it needs: the round data, the username, and its sound and performance settings, never the token.

**4. A watchdog stops frozen games.** The runtime inside the iframe sends a heartbeat every 500 ms. If the page misses more than three checks in a row, it shows "Game is not responding" and removes the iframe. Hidden tabs are skipped, because browsers slow down timers there and a late heartbeat is not a hang.

**5. Hard budgets cap resource use.** The runtime and the page enforce these limits and stop a game that exceeds them:

| Resource | Limit |
|---|---:|
| Game source | 200 KiB |
| Play time | 5 minutes per run (paused time does not count) |
| Assets | 32 entries, 32 MiB in total, and a per-file limit by type |
| Canvas | 4096 px per side, 16 megapixels in total |
| Results | 3 submissions per run, 32 KiB each |
| UI design text | 200 characters per value, 8 KiB in total |

**6. Generated content is embedded safely.** Before building the iframe document, the page escapes anything in the game code that could close the `<script>` tag or open an HTML comment. The round data is JSON-encoded with `<` and line-separator characters escaped, so model output cannot break out of its script block.

## What the frontend relies on the backend for

The sandbox protects the user and the app from a game. It does not make the game itself trustworthy, so some checks belong to the backend:

- **Publishing games:** the backend validates each game's `config.json` against allowlists before publishing (see `game-authoring.md`).
- **Validating round data:** the backend checks the generated `data` against the game's JSON Schema before serving it.
- **Scores:** results are reported by code running in the browser and passed on to the backend (`POST games/{id}/scores`, tied to a round ID). Like any client-reported score, they can be faked by a determined user, so the backend has to treat leaderboard scores as claims rather than facts.

## Known trade-offs

- **`'unsafe-inline'` scripts:** the runtime and game code are injected inline into the iframe, so the CSP has to allow inline scripts. This is acceptable because the iframe has no access to anything worth protecting, but it means the CSP limits where a game can connect, not which code runs.
- **`https://esm.sh` is trusted:** games may import JavaScript modules from esm.sh, so the sandbox's safety partly depends on that service. Self-hosting the allowed modules on the CDN would remove this dependency.
- **Messages to the iframe use the `'*'` target origin:** this is required, because an anonymous-origin iframe has no origin to name. The page only sends commands (pause, resume, input, sound) and never sensitive data.
