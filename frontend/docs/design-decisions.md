# Design Decisions

Short records of the main choices in this frontend: what we decided, why, and what it costs. They are meant for readers who want to understand the reasoning, not only the code.

## 1. Run games in a sandboxed iframe

**Decision:** Every game round runs in its own `<iframe sandbox="allow-scripts">`. The page talks to it only through `postMessage`.

**Why:** Game code is written by third parties and fed with model-generated data, so it must not reach the user's session or the rest of the app. An iframe without `allow-same-origin` is the isolation browsers already enforce reliably, and it still gives the game its own canvas, audio, and input. Running the code directly in the page would give it full access to the app. Details are in [`security-model.md`](security-model.md).

**Trade-off:** Everything a game needs (input, sound, assets, resizing) has to go through a message protocol, and the runtime has to be shipped into the iframe as a script string.

## 2. Ship the game runtime as self-contained functions

**Decision:** The code that runs inside the iframe (`gameRuntime.ts` and its parts in `engine/runtime/`) is written as normal TypeScript, then turned into a script string with `Function.prototype.toString()` (`gameRuntimeScript.ts`).

**Why:** The runtime stays type-checked, unit-tested, and editable like the rest of the app, but needs no second build step or separate bundle to get into the iframe.

**Trade-off:** These functions must be fully self-contained: they may use type imports and browser globals, but no imported values. Shared constants such as budgets and the protocol version are passed in as configuration instead.

## 3. Treat the feed as cards with a short history

**Decision:** The feed fetches one item at a time (`POST feed/next`), keeps the last 20 items, and keeps cards within two steps of the current one mounted. Cards further away are unmounted and only remember their position.

**Why:** Fetching one item at a time lets the backend pick each next item fresh instead of committing to a fixed list. Keeping neighbors mounted means scrolling back resumes a video or game exactly where it was, without reloading. Unmounting the rest keeps memory use flat during long sessions.

**Trade-off:** Going back more than 20 items is not possible, and a card further than two steps away restarts its video or game from its remembered position instead of continuing live.

## 4. A game controls the feed while it's played

**Decision:** While a game is being played, it receives swipes and arrow keys, and the feed can't move forward until the game is finished. Going back is still allowed. Off-screen and leaving cards are paused.

**Why:** Many games use swipes and arrow keys themselves, so the same gesture can't also mean "next card". Pausing games that aren't on screen saves battery and keeps play time fair, since the 5-minute budget only counts time spent playing. IT also consciously breaks the user out of his or her scrolling habit by disabling it. The user has to consciously start scrolling again after completing the game, hopefully breaking the damaging habit of doom scrolling. 

**Trade-off:** Users can't skip a game they've started by swiping forward; they have to finish it or go back.

## 5. Load game rounds before they're needed

**Decision:** `GamePrefetchService` requests game rounds in advance and keeps them in memory until they're used: for the first three games in the game hub, when the pointer hovers over a game, and for the next round while the current one is being played.

**Why:** Starting a round means generating content on the backend, which can take a moment. Requesting it early makes games start and restart without waiting.

**Trade-off:** Some prefetched rounds are never played, which costs backend work. The cache holds at most one round per game, and a failed prefetch is simply dropped and retried on demand.

## 6. Send all backend calls through one service

**Decision:** `ApiService` (`src/app/core/api.service.ts`) is the only place that calls the backend or the CDN. It adds the login token and holds the request and response types.

**Why:** Authentication, URLs, and data types live in one file, so a change to the backend contract is made in one place, and components stay focused on the UI. It also makes services easy to replace in tests.

**Trade-off:** The service is long, because it covers every feature area. Splitting it per feature would be the next step if it keeps growing.
