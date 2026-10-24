# Game Authoring Guide

This is the contract for games in the feed. A game is published once as fixed
JavaScript. The backend generates only the player's `data`, validates it, and
starts the fixed game in the frontend's sandboxed iframe.

## Package

Each game contains:

```text
my-game/
|- game.js       # fixed game code
`- config.json   # package metadata, JSON Schema, and LLM instructions
```

The backend must validate `config.json` before publishing. Reject unknown
fields and use allowlists for `renderer`, `orientation`, and `input`.

Example configuration:

```json
{
  "context": "Create short biology quiz data from the player's study notes.",
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
      "context": { "type": "string", "minLength": 1, "maxLength": 120 },
      "questions": {
        "type": "array", "minItems": 1, "maxItems": 8,
        "items": {
          "type": "object", "additionalProperties": false,
          "required": ["prompt", "options", "answer"],
          "properties": {
            "prompt": { "type": "string", "minLength": 1, "maxLength": 120 },
            "options": {
              "type": "array", "minItems": 2, "maxItems": 4,
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

`context` at the top level is the English instruction for the LLM.
`data.context` is the required non-empty learning context passed to the game.
They are different values.

`input_schema` is JSON Schema Draft 2020-12. Validate every generated response;
retry an invalid response once, then serve a video instead of starting the game.
Keep schemas small. Use `required`, length/item limits, numeric bounds, enums,
and `additionalProperties: false`. Explain rules that JSON Schema cannot
express, such as which answer is correct.

Metadata rules:

- `renderer`: `2d` or `webgl`; it must match `registerGame`.
- `orientation`: preferred `portrait` or `landscape`; support rotation anyway.
- `minDurationSeconds` and `maxDurationSeconds`: positive integer bounds, with
  minimum no greater than maximum. Finish within this range when practical.
- `input`: supported values from `touch`, `keyboard`, and `gamepad`. Include
  `touch` for phone-first games.
- `assets`: approved asset IDs, not URLs. Every ID must exist in the manifest.

## Registering a game

Call `registerGame` exactly once. These hooks are required:

```js
registerGame({
  renderer: '2d', // omit for 2d; use 'webgl' for WebGL
  init(api) {},
  update(dt, input) {},
  render(ctx) {},
});
```

Optional hooks are `resize(width, height, viewport)`, `contextLost()`,
`contextRestored(api)`, and `destroy()`.

The runtime owns the animation loop. Do not create a second loop with
`requestAnimationFrame`, `setInterval`, or `setTimeout`.

### Dimensions and scope

Dimensions are logical CSS pixels. They are available only through `api` or
explicit variables that your game declares. `width` and `height` are **not
global variables**. This is wrong:

```js
function init(api) {
  const width = api.width;
}
function render(ctx) {
  ctx.fillRect(0, 0, width, height); // ReferenceError: width is not defined
}
```

Use `api.width` directly, or keep module-level variables and update them in
`resize`:

```js
let width = 0;
let height = 0;

function init(api) {
  width = api.width;
  height = api.height;
}

function resize(newWidth, newHeight) {
  width = newWidth;
  height = newHeight;
}

function render(ctx) {
  ctx.fillRect(0, 0, width, height);
}

registerGame({ init, update, render, resize });
```

Do not use `canvas.width` or `canvas.height` for logical coordinates. Those are
physical backing-store dimensions. Use `api.width`, `api.height`, or:

```js
api.viewport // width, height, pixelWidth, pixelHeight, devicePixelRatio,
             // orientation, safeArea { top, right, bottom, left }
```

`resize` runs when logical dimensions, device-pixel ratio, orientation, or safe
areas change. Use `safeArea` for edge controls and `orientation` for layout.

## API

`init(api)` receives:

```js
{
  width, height, username, data, renderer,
  viewport,
  performance,
  assets,
  webgl,
  submitResult(result),
  setUiDesign(design)
}
```

`data` contains JSON-compatible values only: objects, arrays, strings, numbers,
booleans, and `null`. It must contain a non-empty `context`. Treat all data as
untrusted LLM output; validate relationships defensively and do not throw.

`api.performance` contains `targetFps`, `adaptiveQuality`, `reducedEffects`,
`frameTime`, `averageFrameTime`, and `qualityScale`. The host may use 30 or 60
FPS, reduce effects, and lower `qualityScale` from 1 to 0.5. Keep gameplay and
text readable when `reducedEffects` is true.

## Rendering

The default renderer is 2D; `render(ctx)` receives a
`CanvasRenderingContext2D`. The runtime resets drawing state around each frame.
For WebGL, `render(gl)` receives WebGL2 or WebGL and the runtime clears and
updates the viewport before rendering.

WebGL games may use `api.webgl.createBasicScene()` for simple colored boxes.
`api.webgl.capabilities` reports `available`, `webgl2`, `maxTextureSize`,
`maxViewportDimensions`, `antialias`, `highPerformance`, and `renderer`.
Use the capability values to choose compatible effects and render targets.

On context loss, rendering pauses and `contextLost()` may run. After restore,
the runtime creates a new context and calls `contextRestored(api)`. Recreate all
WebGL resources there; old buffers, shaders, and textures cannot be reused.
Release GPU resources in `destroy()`.

## Feed lifecycle

The host owns these states:

| State | Meaning |
| --- | --- |
| `preloading` | Code and startup resources are being prepared. |
| `visible` | Fully visible, but transitioning or not yet eligible to run. |
| `playing` | Fully visible, iframe focused by the host, and allowed to run. |
| `partially visible` | Part of the card is visible; gameplay is paused. |
| `paused` | Hidden, unfocused, tab hidden, or another feed item is active. |
| `completed` | A result was submitted; gameplay remains paused. |
| `disposed` | The feed permanently removed the game and called `destroy()`. |

The host pauses games when the card leaves the viewport, the user swipes to
another item, the browser tab is hidden, or a video becomes active. It also
pauses partially visible cards. A game resumes only when its card is fully
visible, the tab is visible, and the feed transition has finished. The host
focuses the iframe itself before resuming; parent-window focus events are not
used as a gameplay gate because focusing a sandboxed iframe can blur the parent
window. Returning to the card resumes the existing game; it does not reload it.

A valid result moves the game to `completed`. Treat that as the end of the
attempt. `destroy()` is for permanent teardown and is the only transition to
`disposed`.

## Input

`update(dt, input)` receives clamped elapsed seconds and this input shape:

```js
input.keys.ArrowUp
input.keys.ArrowDown
input.keys.ArrowLeft
input.keys.ArrowRight
input.keys.Space
// each value: { held, justPressed, justReleased }
input.pointer
// x, y, normalizedX, normalizedY, down, justPressed, justReleased,
// deltaX, deltaY
```

Use `justPressed` for one-shot actions and `held` for continuous movement. The
runtime clears keys when focus or page visibility changes.

Gamepad button 0 maps to Space; D-pad buttons map to arrows; the left stick
maps to arrows with a 0.5 deadzone. Touch gestures use the same keys:

| Gesture | Key |
| --- | --- |
| Tap | Space for about 100 ms |
| Swipe | Matching arrow for about 100 ms |
| Hold on left/right half | ArrowLeft/ArrowRight until release |

Pointer Events support touch, pen, and mouse. The runtime tracks one active
pointer. Design for touch; do not require hover, right-click, or multi-button
mouse input.

## Assets

The host provides an approved manifest. Games use IDs, never arbitrary URLs:

```js
assets: {
  player: {
    kind: 'image',
    url: 'https://cdn.example.com/player.png',
    maxBytes: 500000,
    preload: true
  }
}
```

Kinds are `image`, `audio`, `font`, and `model`. URLs must be approved HTTPS
origins. Load by ID:

```js
const image = await api.assets.loadImage('player');
const audio = await api.assets.loadAudio('success');
const fontLoaded = await api.assets.loadFont('titleFont');
const model = await api.assets.loadModel('scene');
await api.assets.preload(['titleFont', 'scene']);
```

Loads are cached and concurrent requests share a promise. Missing or failed
assets return `null` (`false` for fonts); provide a fallback. Progress is
available as `api.assets.progress.loaded`, `total`, `bytesLoaded`, and
`bytesTotal`. Preloads marked in the manifest begin before `init`.

## Budgets and security

The iframe is sandboxed with `allow-scripts`, has an opaque origin, and uses a
restrictive Content Security Policy. Game code is untrusted and must not be
able to access the host DOM or arbitrary network resources.

The runtime stops a game that exceeds these hard limits:

| Resource | Limit |
| --- | ---: |
| Execution time | 5 minutes per run |
| Approved asset entries | 32 |
| Aggregate declared asset bytes | 32 MiB |
| One image / audio / font / model | 5 / 10 / 2 / 15 MiB |
| Logical canvas width or height | 4096 px |
| Canvas backing-store area | 16 megapixels |
| One result payload | 32 KiB UTF-8 JSON |
| Result submissions | 3 per run |
| One UI text value | 200 characters |
| Complete UI design | 8 KiB UTF-8 JSON |
| Game source | 200 KiB UTF-8 bytes |

`maxBytes` may lower an asset limit but cannot raise it. Asset bytes are
checked while reading the response. Pausing does not reset execution time.
Canvas limits apply to host dimensions and the physical backing store.

## Results

Submit one final, compact, JSON-compatible object with a finite numeric score:

```js
api.submitResult({ score: 42, level: 3, completed: true });
```

A game may submit at most three results, but normal games should submit once
when the meaningful attempt ends. The host keeps the latest valid result and
shows the result view.

## Host UI design

`api.setUiDesign()` accepts safe declarative text only. It cannot create HTML,
CSS, URLs, templates, event handlers, or components. Supported tokens are:

```js
api.setUiDesign({
  theme: { accent: 'amber', panel: 'dark', density: 'compact' },
  pauseMenu: {
    title: 'Pause',
    message: 'Take a break.',
    resumeLabel: 'Continue'
  },
  leaderboard: {
    title: 'Results',
    subtitle: 'Good run.',
    scoreLabel: 'Points'
  }
});
```

`accent` is `teal`, `amber`, `rose`, or `sky`; `panel` is `dark` or `light`;
`density` is `compact` or `comfortable`. Call this during `init` when possible.
Later calls replace the previous design; do not update it every frame.

## Backend and source rules

- Put all player-specific learning content in `api.data`, not in `game.js`.
- Keep rounds practical for a swipe feed, normally 20 to 60 seconds.
- Handle missing assets and invalid data with safe fallbacks.
- Do not create HTML, JavaScript, CSS, URLs, or dynamic scripts from LLM data.
- Do not throw from normal gameplay; an uncaught error ends the session.
- The source must be at most 200 KiB and must not contain `</script` in any
  casing, including in comments, because it is embedded in an inline script.
- The protocol version is currently `2`.
