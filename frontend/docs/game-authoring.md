# Game Authoring Guide: Frontend and Backend

This is the complete authoring contract for games in the feed. A game is a
fixed JavaScript file plus a configuration file. The JavaScript is published
once and does not change per player. Each time the feed serves the game, the
backend asks an LLM to create fresh `data` from the player's study projects,
validates that data, and the frontend starts the fixed game with it.

The frontend executes the game in a sandboxed iframe. The backend owns game
registration, schema validation, and publishing. Both sides must follow the
contract in this document.

## What to deliver

Create one directory per game:

```text
my-game/
|- game.js       # fixed game code written against this runtime
`- config.json   # data schema and LLM instructions
```

The backend publishes `game.js` and registers the game metadata. It does not
generate a new JavaScript file for each player.

## Backend configuration

Each game must include a `config.json` like this:

```json
{
  "context": "Create short biology quiz data about the player's study notes.",
  "renderer": "2d",
  "orientation": "portrait",
  "minDurationSeconds": 20,
  "maxDurationSeconds": 60,
  "input": ["touch", "keyboard"],
  "assets": [],
  "input_schema": {
    "type": "object",
    "required": ["context", "questions"],
    "properties": {
      "context": {
        "type": "string",
        "minLength": 1,
        "maxLength": 120
      },
      "questions": {
        "type": "array",
        "minItems": 1,
        "maxItems": 8,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["prompt", "options", "answer"],
          "properties": {
            "prompt": { "type": "string", "minLength": 1, "maxLength": 120 },
            "options": {
              "type": "array",
              "minItems": 2,
              "maxItems": 4,
              "items": { "type": "string", "minLength": 1, "maxLength": 60 }
            },
            "answer": { "type": "integer", "minimum": 0, "maximum": 3 }
          }
        }
      }
    },
    "additionalProperties": false
  }
}
```

The package metadata describes the mobile requirements used by the feed when
selecting and presenting a game:

- `renderer` is `2d` or `webgl` and must match the game registration.
- `orientation` is the preferred `portrait` or `landscape` layout. Games must
  still respond to `api.viewport.orientation` changes when the device rotates.
- `minDurationSeconds` and `maxDurationSeconds` are positive integer bounds;
  `minDurationSeconds` must not exceed `maxDurationSeconds`. The game should
  submit its result within this window and avoid requiring a longer session.
- `input` lists every supported input source: `touch`, `keyboard`, and/or
  `gamepad`. Include only inputs the game genuinely supports, and always list
  `touch` for a phone-first game.
- `assets` is the list of approved asset IDs used by the package. It is not a
  list of URLs; URLs, types, and byte limits belong to the host-provided asset
  manifest described below. Every listed ID must exist in that manifest.

The backend should validate these fields before publishing a package. Keep
the metadata strict and use an allowlist for `renderer`, `orientation`, and
`input`; reject unknown fields when validating package configuration.

`input_schema` is JSON Schema Draft 2020-12. It describes exactly what the
game reads from `api.data`. The backend validates every LLM response against
this schema. An invalid response is retried once; if it is still invalid, the
feed serves a video instead of starting the game.

The schema must require `context` as a non-empty string. This field is the
short description of the learning topic or situation supplied to the game and
is also the context the LLM uses when filling the other fields. The top-level
`context` in `config.json` is different: it is the English instruction given
to the LLM. Explain the game, every generated field, the difficulty, and rules
JSON Schema cannot express. For example, say that `answer` is the index of
the only correct option.

Put every hard limit in the schema: `required`, `minItems`, `maxItems`,
`minLength`, `maxLength`, `minimum`, `maximum`, and `enum`. Keep schemas small
and mostly flat. Use `additionalProperties: false` on objects and do not use
`$ref`. Text must fit on a phone-sized canvas, so string length limits are
important.

## Required registration

Every game must register exactly once:

```js
registerGame({
  renderer: '2d',
  init(api) {},
  update(dt, input) {},
  render(ctx) {},
});
```

The required hooks are:

- `init(api)`: called once before the game loop starts.
- `update(dt, input)`: called once per animation frame. `dt` is elapsed time in
  seconds and is clamped by the runtime.
- `render(ctx)`: draws one frame using the selected rendering context.

Optional hooks are `resize(width, height, viewport)` and `destroy()`.

The runtime keeps `width` and `height` in logical CSS pixels. The canvas backing
store is scaled for the device-pixel ratio, so games should draw using the
logical dimensions and must not use `canvas.width` or `canvas.height` directly.
The current viewport is also available as `api.viewport`:

```js
{
  width: 800,
  height: 600,
  pixelWidth: 1600,
  pixelHeight: 1200,
  devicePixelRatio: 2,
  orientation: 'landscape',
  safeArea: { top: 0, right: 0, bottom: 24, left: 0 }
}
```

`resize` is called when the logical dimensions, device-pixel ratio, orientation,
or safe-area insets change. Use `safeArea` when placing controls near screen
edges, and use `orientation` to select a layout. The runtime measures the
safe-area environment provided by the device and automatically tracks browser
resize, orientation, and visual-viewport changes.

## Mobile performance

The host can provide a performance profile when starting a game:

```js
session.start(gameCode, {
  username: 'alex',
  data: { context: 'A short reaction game.' },
  performance: {
    targetFps: 30,          // 30 or 60; default: 60
    adaptiveQuality: true,  // default: true
    maxPixelRatio: 1.5,     // clamped by the runtime to 1..4; default: 2
    reducedEffects: false,  // default: false
  },
});
```

Games can inspect the live state through `api.performance`:

```js
{
  targetFps: 60,
  adaptiveQuality: true,
  reducedEffects: false,
  frameTime: 4.2,
  averageFrameTime: 5.1,
  qualityScale: 1
}
```

`frameTime` and `averageFrameTime` are milliseconds. `qualityScale` starts at
`1` and can decrease to `0.5` when adaptive quality detects repeated slow
frames. The runtime lowers the canvas backing-store resolution, while keeping
the logical `width`, `height`, and input coordinates unchanged. This prevents
a small phone from rendering an unnecessarily large high-DPI canvas. The
runtime never increases quality automatically during a run.

Use `reducedEffects` to skip optional visual work such as particles, shadows,
post-processing, and animation flourishes. It becomes `true` when the host
requests reduced effects or adaptive quality has reduced `qualityScale`.
Keep gameplay, input handling, and readable text working in either mode. Draw
in logical coordinates and use `api.viewport.pixelWidth` and
`api.viewport.pixelHeight` only when a renderer specifically needs physical
backing-store dimensions.

## Rendering modes and 3D support

Games use the 2D renderer by default. A game that needs GPU rendering can opt
into WebGL by declaring:

```js
registerGame({
  renderer: 'webgl',
  init(api) {},
  update(dt, input) {},
  render(gl) {},
});
```

For `renderer: 'webgl'`, the runtime requests WebGL2 first and falls back to
WebGL. The selected mode is available as `api.renderer`, and `render(gl)`
receives the WebGL rendering context. The runtime clears the color and depth
buffers and updates the viewport before each frame. A game owns shaders,
buffers, matrices, camera logic, and all other 3D rendering code.

Games that do not need custom shaders can use the small approved built-in 3D
helper instead:

```js
let scene;

function init(api) {
  scene = api.webgl.createBasicScene();
  scene?.addBox({ z: 0, size: 1, color: [0.2, 0.7, 1, 1] });
}

function render() {
  scene?.render();
}

function contextRestored(api) {
  // WebGL resources are invalid after context loss; recreate the scene.
  scene = api.webgl.createBasicScene();
  scene?.addBox({ z: 0, size: 1, color: [0.2, 0.7, 1, 1] });
}
```

`createBasicScene()` provides a camera and colored boxes for simple 3D games.
It is intentionally small; use a separately approved prebundled 3D runtime
when a game needs models, lighting, animation systems, or advanced materials.
The helper returns `null` when the game is not using WebGL.

The capability report is available at `api.webgl.capabilities`:

```js
{
  available: true,
  webgl2: true,
  maxTextureSize: 4096,
  maxViewportDimensions: [4096, 4096],
  antialias: true,
  highPerformance: true,
  renderer: 'GPU name when the browser exposes it'
}
```

Use `maxTextureSize` and `maxViewportDimensions` to choose compatible assets
and render targets. `highPerformance` is only a hint: prefer simpler effects
when it is `false`, and continue to handle missing capabilities gracefully.

WebGL context loss is recoverable. When it happens, rendering pauses and the
runtime calls optional `contextLost()`. After the browser restores the
context, the runtime recreates the WebGL context, refreshes the capability
report, calls `contextRestored(api)`, and resumes rendering. Recreate all
buffers, shaders, textures, and scene objects in `contextRestored`; WebGL
resources from before the loss cannot be reused.

For the default `renderer: '2d'`, `render(ctx)` receives a
`CanvasRenderingContext2D`; the runtime resets and restores its drawing state
around each frame. Do not use 2D methods with a WebGL context or WebGL methods
with a 2D context.

Games should release GPU resources in `destroy()`. The iframe remains
sandboxed and the Content Security Policy still prevents normal network
access, so advanced WebGL libraries and assets must be bundled or supplied by
the approved asset system. The existing 200 KB source limit still applies.

## Inputs

The host starts a game with a game-code string and an input object:

```ts
session.start(gameCode, {
  username: 'alex',
  data: {
    context: 'A short reaction game for a learning feed.',
    difficulty: 'hard',
    questions: ['one', 'two'],
  },
  width: 800,
  height: 600,
});
```

Inside `init`, the game receives:

```js
function init(api) {
  console.log(api.username); // 'alex'
  console.log(api.data);     // the custom game data
}
```

`data.context` is required. It describes the learning or product context that
the AI used to create or configure the game. The AI may fill the remaining
game-specific fields, such as difficulty, questions, or content identifiers.

The remaining `data` fields are game-defined and may contain nested
JSON-compatible values: objects, arrays, strings, numbers, booleans, and
`null`. Do not rely on functions, class instances, DOM nodes, or circular
references. The host can add fields to the startup object later without
changing the game lifecycle.

## Assets

The host supplies an approved asset manifest when starting the game. Game code
receives asset IDs, never arbitrary URLs:

```js
session.start(gameCode, {
  username: 'alex',
  data: { context: 'A short reaction game.' },
  assets: {
    player: {
      kind: 'image',
      url: 'https://cdn.example.com/games/player.png',
      maxBytes: 500000,
      preload: true,
    },
    success: {
      kind: 'audio',
      url: 'https://cdn.example.com/games/success.ogg',
    },
    titleFont: {
      kind: 'font',
      url: 'https://cdn.example.com/games/title.woff2',
    },
    scene: {
      kind: 'model',
      url: 'https://cdn.example.com/games/scene.glb',
    },
  },
});
```

Only approved HTTPS backend/CDN entries are accepted. The runtime rejects
unknown IDs, mismatched asset kinds, non-HTTPS URLs, and assets larger than
the hard limits: 5 MB for images, 10 MB for audio, 2 MB for fonts, and 15 MB
for models. `maxBytes` may impose a smaller per-asset limit, but cannot raise
the runtime limit. The runtime also limits the CSP to the origins in the
manifest.

Load assets by ID. Loads are cached and concurrent requests for one ID share
the same promise:

```js
async function init(api) {
  const player = await api.assets.loadImage('player');
  const success = await api.assets.loadAudio('success');
  await api.assets.preload(['titleFont', 'scene']);

  if (player) drawPlayer(player);
  if (success) playSuccess(success);
}
```

Entries marked `preload: true` begin loading before `init`. Calling
`api.assets.preload()` with no arguments waits for all manifest-declared
preloads; passing IDs preloads only those entries. Loading progress is live:

```js
const progress = api.assets.progress;
// progress.loaded, progress.total, progress.bytesLoaded, progress.bytesTotal
```

`loadImage` returns an `HTMLImageElement`, `loadAudio` an `HTMLAudioElement`,
`loadFont` a boolean, and `loadModel` an `ArrayBuffer`. Missing, blocked,
oversized, or failed assets resolve to `null` (or `false` for fonts) and never
throw. Always provide a gameplay-safe fallback when an optional asset is not
available. Asset bytes are fetched with credentials omitted and the sandbox
does not expose arbitrary network access to game code.

Keyboard, touch, and gamepad input is available through `input.keys`. The
runtime currently tracks `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, and
`Space`. Each key has the same edge-aware shape regardless of its source:

```js
const space = input.keys.Space;
if (space.justPressed) startAction();
if (space.held) continueAction();
if (space.justReleased) finishAction();
```

`justPressed` and `justReleased` are true only during the update frame where
the transition occurs. Gamepad button 0 maps to `Space`, the D-pad maps to the
arrow keys, and the left stick maps to the arrow keys with a 0.5 deadzone.

On touch screens the runtime presses the same keys, so a game written for the
keyboard also works on phones without extra code:

| Gesture | Key |
| --- | --- |
| Tap | `Space`, pressed for about 100 ms |
| Swipe up, down, left or right | The matching arrow key, pressed for about 100 ms |
| Press and hold on the left or right half | `ArrowLeft` or `ArrowRight`, held until the finger lifts (dragging across switches it) |

Design controls around these gestures: use Space to confirm or act, arrow
presses to choose, and held left/right for continuous movement. Use
`justPressed` for one-shot actions instead of keeping a separate previous-key
snapshot.

## Outputs

A game reports its result with a finite numeric score:

```js
api.submitResult({
  score: 42,
  level: 3,
  completed: true,
});
```

`score` is required. Additional fields are allowed and should be JSON-compatible.
The host keeps the latest result on `GameSession.result`, so future versions
can add output fields without changing the score contract.

Submit a result when the meaningful game attempt ends. Submitting another
result replaces the previous result, which supports retries or checkpointed
games.

## Complete example

```js
let width;
let height;
let api;
let time = 0;
let finished = false;

function init(gameApi) {
  api = gameApi;
  width = api.width;
  height = api.height;
  console.log(api.viewport.orientation); // 'portrait' or 'landscape'
  console.log(api.data.context); // context supplied to the AI
  api.setUiDesign({
    pauseMenu: {
      title: 'Ready when you are',
      message: 'Pause and return when you are focused.',
      resumeLabel: 'Continue',
    },
    leaderboard: {
      title: 'Reaction results',
      subtitle: 'Your result compared with the feed.',
      scoreLabel: 'Points',
    },
  });
}

function update(dt, input) {
  if (finished) return;

  time += dt;
  if (input.keys.Space.justPressed) {
    finished = true;
    api.submitResult({
      score: Math.floor(time * 10),
      mode: api.data.mode || 'default',
    });
  }
}

function render(ctx) {
  ctx.fillStyle = '#12141c';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Press Space to finish', 20, 30);
}

function resize(newWidth, newHeight, viewport) {
  width = newWidth;
  height = newHeight;
}

registerGame({ init, update, render, resize });
```

## Designing the host UI

Games may design the host-controlled pause menu and end-of-run leaderboard by
calling `api.setUiDesign(design)`. This is a declarative design, not HTML: the
Angular host owns the layout, buttons, styling, accessibility, and behavior.
The game supplies text and chooses which supported surfaces it wants to use.

### Pause menu

```js
api.setUiDesign({
  theme: {
    accent: 'amber',
    panel: 'dark',
    density: 'compact',
  },
  pauseMenu: {
    title: 'Focus break',
    message: 'The timer is stopped. Continue when ready.',
    resumeLabel: 'Continue game',
  },
});
```

### Safe visual theme

The optional `theme` object lets the game influence the look and feel without
injecting CSS:

- `accent`: one of `teal`, `amber`, `rose`, or `sky`.
- `panel`: `dark` or `light`.
- `density`: `compact` or `comfortable`.

These are design tokens, not CSS values. The Angular host maps them to its own
approved colors, spacing, contrast, and layout. Missing or invalid values use
the host defaults. Raw colors, CSS strings, URLs, HTML, templates, and event
handlers are not accepted.

Games may use `theme` together with `pauseMenu` and `leaderboard`:

```js
api.setUiDesign({
  theme: { accent: 'rose', panel: 'dark', density: 'comfortable' },
  leaderboard: {
    title: 'Reaction results',
    scoreLabel: 'Points',
  },
});
```

The runtime validates the token names before sending the design to the host,
and the host validates the design again before storing it. This defense in
depth is important because game code is untrusted. The host still controls DOM
creation, accessibility, click behavior, and the final visual system.

The host shows a Pause control when `pauseMenu` exists. Selecting it sends a
`pause` command to the runtime and displays the title, message, and resume
label. Selecting the resume action sends `resume`. The runtime stops the game
loop while paused and clears pressed keys so a key held during the pause cannot
leak into the next frame.

### Leaderboard

```js
api.setUiDesign({
  leaderboard: {
    title: 'Dodge leaderboard',
    subtitle: 'Survive longer to move up.',
    scoreLabel: 'Survival points',
  },
});
```

When the game submits a result, the host displays the leaderboard surface. The
design controls its heading, supporting text, and label for the player score.
The submitted result supplies the score and any game-specific metadata. The
current application uses mock leaderboard rows; a future feed implementation
can replace those rows with backend data without changing the game contract.

Only the documented text fields are rendered. Games cannot provide HTML,
Angular templates, event handlers, CSS, or arbitrary components. This keeps
generated designs safe and lets the host maintain a consistent feed experience.

### Design timing and updates

Call `setUiDesign` during `init`, before gameplay starts. Calling it later is
allowed and replaces the previous design, which can support stages or modes,
but a game should avoid changing labels every frame. Starting a new session
clears the previous design. UI design is optional; games that omit it use the
host defaults.

The design object is JSON-compatible and extensible. Unknown fields are ignored
by the current host and may be supported by a future protocol version. Text is
displayed as text, not interpreted as markup.

## Rules for `game.js`

All learning content must come from `api.data`. Do not hard-code questions,
answers, study topics, or player-specific content in the JavaScript file. The
file is fixed and reused for every player.

Treat `api.data` as untrusted LLM output. The backend schema validates its
shape, but strings can still contain unexpected content. Draw values as canvas
text or pass them to the safe text fields of `setUiDesign`; never turn them
into JavaScript, HTML, CSS, URLs, or dynamic script sources.

Be defensive about rules JSON Schema cannot express. For example, skip a
question when its answer index is outside the options array, when options are
duplicates, or when a required gameplay relationship is invalid. Do not throw:
an uncaught game error ends the session.

`input.keys` holds `KeyState` objects (`{ held, justPressed, justReleased }`)
for `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, and `Space`. For
one-shot keyboard actions, check `input.keys.Space.justPressed` (or
`input.keys.ArrowLeft?.justPressed`). For continuous movement, check
`input.keys.ArrowLeft?.held`. The runtime clears keys when focus or page
visibility changes.

Mobile and pointer input is available through `input.pointer`:

```js
function update(dt, input) {
  if (input.pointer.justPressed) {
    // Start or select something once, on touch or mouse press.
  }
  if (input.pointer.down) {
    player.x = input.pointer.normalizedX * api.width;
  }
}
```

Pointer Events cover touch, pen, and mouse input. The pointer coordinates are
provided in logical canvas pixels (`x`, `y`) and normalized coordinates from
`0` to `1` (`normalizedX`, `normalizedY`). `down` remains true while a pointer
is held. `justPressed` and `justReleased` are true only during the frame where
the transition occurs. `deltaX` and `deltaY` contain movement since the last
game frame. The runtime applies `touch-action: none` to the canvas so vertical
swipes do not scroll the iframe while a game is being played.

Use pointer input for mobile controls and keep keyboard input as a desktop
fallback. Avoid relying on hover, right-click, or precise multi-button mouse
controls on a phone. The runtime tracks one active pointer; games needing
multi-touch should be added through a future multi-pointer contract.

Keep a round between 20 and 60 seconds because games appear between videos in
a swipe feed. Submit a result with `api.submitResult({ score, ... })` when the
round ends. `score` must be a finite number; additional result fields must be
JSON-compatible.

The game source must be at most 200 KB (204,800 UTF-8 bytes) and must not
contain `</script` in any letter casing. The backend publisher rejects files that violate these rules,
and the frontend checks them again before constructing the iframe. The host
embeds the source in an inline script, so this restriction is required even
when the source appears inside a JavaScript comment.

## Publishing

Give the complete game directory to the backend team. They publish it with:

```sh
python -m app.seed_game my-game --title "My game" --owner <username>
```

Publishing validates the config and code, including the required `context`,
the presence of `registerGame(`, the source-size limit, and the absence of
`</script`. It uploads `game.js` to the CDN and registers the game. Game titles
must be unique.

## Lifecycle and limitations

- The runtime calls `init` before the first update.
- The game should not create its own animation loop. The runtime owns it.
- The runtime clears keyboard state when focus or page visibility changes.
- Touch input follows one finger at a time; other fingers are ignored.
- `destroy()` is called when the host stops the game, when the view is removed,
  or after a runtime failure.
- The iframe has a restrictive Content Security Policy and no network access.
- Do not include a closing `</script>` sequence in generated game code because
  the host embeds the code in an inline script element.
- Runtime errors, rejected promises, invalid registration, and missing
  registration are reported to the host and stop the session.
- A malformed UI design causes the runtime to report an error rather than
  passing unsafe values to the host.

The protocol version is currently `2`. Every game input must contain a non-empty
`data.context` string. Games should depend only on the public
registration contract and the `api` fields described above.