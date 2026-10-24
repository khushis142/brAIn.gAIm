# Writing a game

A game is a **fixed JS template** plus a **config**. The game code never changes per player:
each time the feed serves a game, an LLM writes fresh **input data** for it from the
player's study projects, and the game renders that input.

`example-quiz/` is a complete, working reference. Copy it to start.

## What you deliver

One directory per game:

```
my-game/
├── game.js       # the game
└── config.json   # what input the game needs, and what it is about
```

## `config.json`

```json
{
  "context": "What the game is and what good input looks like, written for the LLM.",
  "input_schema": { "type": "object", "...": "JSON Schema of the input" }
}
```

- **`input_schema`**: a [JSON Schema](https://json-schema.org/) (draft 2020-12) describing
  exactly the data `game.js` reads. The top level must be an `object`. Every LLM reply is
  validated against it; invalid replies are retried, then the player gets a video instead.
  - Put every hard limit in the schema: `required`, `minItems`/`maxItems`,
    `minLength`/`maxLength`, `minimum`/`maximum`, `enum`.
  - Use `"additionalProperties": false` on objects.
  - Keep it small and flat; no `$ref`. Larger schemas produce worse LLM output.
- **`context`**: plain English instructions for the LLM. Say what the game is, what each
  field means, the difficulty, and the rules a schema cannot express (e.g. "`answer` is
  the index of the correct option; exactly one option is correct").

The LLM also receives the player's projects (their own notes) as study material, so write
the context in terms of "the study material", not a fixed topic.

## `game.js`

- **One self-contained file**, at most **200 KB**. No `import`, `fetch`, `XMLHttpRequest`,
  `eval`, `localStorage`, and no external URLs.
- It talks to the app only through the `BrainGain` SDK (brAIn-gAIm/Frontend#10):

  | Call | When |
  |---|---|
  | `BrainGain.onInit(input => { … })` | Receives the generated input; start the game here |
  | `BrainGain.ready()` | Once, after registering `onInit` |
  | `BrainGain.answer({ conceptId, correct, ms })` | After each answered item |
  | `BrainGain.progress(fraction)` | Progress from `0` to `1` |
  | `BrainGain.complete({ score })` | At the end; `score` from `0` to `100` |

- **Treat the input as untrusted data.** It comes from an LLM and can contain anything a
  string can. Render it with `textContent`, never `innerHTML`, and don't build code or URLs
  from it.
- **Be defensive about rules the schema cannot enforce** (an `answer` index that is out of
  range, duplicate options, …): skip or clamp, never crash.
- Keep a round short: the feed is a swipe feed, so aim for 20 to 60 seconds.

## Publishing

Hand the directory to the backend team. They publish it with:

```sh
python -m app.seed_game my-game --title "My game" --owner <username>
```

This uploads `game.js` to the CDN and stores the config. The config is validated on
publish; an invalid `input_schema` is rejected. Game titles must be unique.
