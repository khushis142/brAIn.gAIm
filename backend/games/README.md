# Writing a game

A game is a **fixed JS file** plus a **config**. The code never changes per player: each
time the feed serves a game, an LLM writes fresh **`data`** for it from the player's study
projects, the backend validates it, and the frontend starts the game with it.

How games run (lifecycle, `registerGame`, canvas, UI design) is defined by the frontend in
[`Frontend/docs/game-authoring.md`](https://github.com/brAIn-gAIm/Frontend/blob/main/docs/game-authoring.md)
(protocol v2). This page adds what the backend needs. `example-quiz/` is a complete,
working reference; copy it to start.

## What you deliver

One directory per game:

```
my-game/
├── game.js       # the game, written against the frontend runtime
└── config.json   # which data the game needs, and instructions for the LLM
```

## `config.json`

```json
{
  "context": "Instructions for the LLM: what the game is and what good data looks like.",
  "input_schema": {
    "type": "object",
    "required": ["context", "..."],
    "properties": {
      "context": { "type": "string", "minLength": 1, "maxLength": 120 },
      "...": "the fields your game reads from api.data"
    }
  }
}
```

- **`input_schema`**: a [JSON Schema](https://json-schema.org/) (draft 2020-12) describing
  exactly what `game.js` reads from `api.data`. Every LLM reply is validated against it;
  invalid replies are retried once, then the player gets a video instead.
  - It **must require `context`, a non-empty string**. The runtime requires
    `api.data.context`; the LLM fills it with a short description of the topic.
  - Put every hard limit in the schema: `required`, `minItems`/`maxItems`,
    `minLength`/`maxLength`, `minimum`/`maximum`, `enum`. Text has to fit a phone-sized
    canvas, so cap string lengths.
  - Use `"additionalProperties": false` on objects. Keep it small and flat; no `$ref`.
- **`context`** (top level): plain English instructions for the LLM. Say what the game is,
  what each field means, the difficulty, and the rules a schema cannot express (e.g.
  "`answer` is the index of the correct option; exactly one option is correct"). The LLM
  also gets the player's own notes as "study material", so don't hard-code a topic.

## `game.js`

Follow the frontend guide. In addition:

- **All learning content comes from `api.data`.** Don't hard-code questions or topics.
- **Treat `api.data` as untrusted.** It is LLM output: schema-valid, but anything a string
  can be. Draw it as canvas text or pass it to `setUiDesign` text fields; never build code
  or URLs from it.
- **Be defensive about rules the schema cannot enforce** (an `answer` index out of range,
  duplicate options, …): skip the item, never crash. A crash ends the session.
- **Input is the arrow keys and Space** (`input.keys`); detect presses, not held keys.
- **Report a result** with `api.submitResult({ score, ... })` when the round ends.
- Keep a round short (20 to 60 seconds); it sits between videos in a swipe feed.
- One file, at most **200 KB**, and it must not contain `</script` anywhere (the host
  embeds the code inline).

## Publishing

Hand the directory to the backend team. They publish it with:

```sh
python -m app.seed_game my-game --title "My game" --owner <username>
```

This checks the config and the code (schema valid and requiring `context`, `registerGame(`
present, no `</script`, size), uploads `game.js` to the CDN and registers the game. Titles
must be unique.
