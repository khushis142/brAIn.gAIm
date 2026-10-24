"""Keyless adapter: answers with canned games so the pipeline, worker and frontend can be built
and tested without a provider.

The games in `fake_games/` are placeholders in the brAIn-gAIm/Frontend#10 format until the
brAIn-gAIm/Frontend#13 reference games exist; replace them with those.
"""

import hashlib
import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from app.generator.llm.base import LLM, Message

_GAMES_DIR = Path(__file__).parent / "fake_games"


def _load_games() -> list[str]:
    return [
        json.dumps(
            {
                "manifest": json.loads((game / "manifest.json").read_text()),
                "game_js": (game / "game.js").read_text(),
            }
        )
        for game in sorted(_GAMES_DIR.iterdir())
    ]


class FakeLLM(LLM):
    def __init__(self) -> None:
        self._games = _load_games()

    async def generate(
        self,
        system: str,
        messages: Sequence[Message],
        *,
        json_schema: dict[str, Any] | None = None,
        max_tokens: int,
    ) -> str:
        if json_schema is not None:
            return json.dumps(_example(json_schema))
        # Same prompt, same game, so tests are deterministic.
        prompt = json.dumps([system, list(messages)]).encode()
        index = int.from_bytes(hashlib.sha256(prompt).digest()[:4]) % len(self._games)
        return self._games[index]


def _example(schema: dict[str, Any], index: int = 0) -> Any:
    """A minimal instance of `schema`, enough for the schemas games declare (no $ref)."""
    if "const" in schema:
        return schema["const"]
    if "enum" in schema:
        return schema["enum"][0]
    for combinator in ("oneOf", "anyOf", "allOf"):
        if combinator in schema:
            return _example(schema[combinator][0], index)
    kind = schema.get("type", "object")
    if isinstance(kind, list):
        kind = next((k for k in kind if k != "null"), "null")
    match kind:
        case "object":
            properties = schema.get("properties", {})
            return {name: _example(sub, index) for name, sub in properties.items()}
        case "array":
            count = max(schema.get("minItems", 1), 1)
            return [_example(schema.get("items", {}), i) for i in range(count)]
        case "string":
            text = f"example {index + 1}"
            return text.ljust(schema.get("minLength", 0), ".")
        case "integer" | "number":
            return schema.get("minimum", 0)
        case "boolean":
            return False
        case _:
            return None
