# Game Authoring Guide

Games are JavaScript files executed inside a sandboxed iframe. They do not
import Angular code and cannot access the host page directly.

## Required registration

Every game must register exactly once:

```js
registerGame({
  init(api) {},
  update(dt, input) {},
  render(ctx) {},
});
```

The required hooks are:

- `init(api)`: called once before the game loop starts.
- `update(dt, input)`: called once per animation frame. `dt` is elapsed time in
  seconds and is clamped by the runtime.
- `render(ctx)`: draws one frame using the 2D canvas context.

Optional hooks are `resize(width, height)` and `destroy()`.

## Inputs

The host starts a game with a game-code string and an input object:

```ts
session.start(gameCode, {
  username: 'alex',
  data: {
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

`data` is game-defined and may contain nested JSON-compatible values: objects,
arrays, strings, numbers, booleans, and `null`. Do not rely on functions,
class instances, DOM nodes, or circular references. The host can add fields to
the startup object later without changing the game lifecycle.

Keyboard input is available through `input.keys`. The runtime currently tracks
`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, and `Space`.

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
}

function update(dt, input) {
  if (finished) return;

  time += dt;
  if (input.keys.Space) {
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

function resize(newWidth, newHeight) {
  width = newWidth;
  height = newHeight;
}

registerGame({ init, update, render, resize });
```

## Lifecycle and limitations

- The runtime calls `init` before the first update.
- The game should not create its own animation loop. The runtime owns it.
- The runtime clears keyboard state when focus or page visibility changes.
- `destroy()` is called when the host stops the game, when the view is removed,
  or after a runtime failure.
- The iframe has a restrictive Content Security Policy and no network access.
- Do not include a closing `</script>` sequence in generated game code because
  the host embeds the code in an inline script element.
- Runtime errors, rejected promises, invalid registration, and missing
  registration are reported to the host and stop the session.

The protocol version is currently `1`. Games should depend only on the public
registration contract and the `api` fields described above.