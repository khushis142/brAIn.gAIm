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
- A malformed UI design causes the runtime to report an error rather than
  passing unsafe values to the host.

The protocol version is currently `2`. Every game input must contain a non-empty
`data.context` string. Games should depend only on the public
registration contract and the `api` fields described above.