"""Keyless adapter: answers with minimal schema-valid data so the pipeline and frontend can be
built and tested without a provider. Asked for a whole game, it returns the reference quiz.
"""

import json
from collections.abc import Sequence
from typing import Any

from app.generator.llm.base import LLM, Message


class FakeLLM(LLM):
    async def generate(
        self,
        system: str,
        messages: Sequence[Message],
        *,
        json_schema: dict[str, Any] | None = None,
        max_tokens: int,
    ) -> str:
        # Imported here: the generator depends on this package, not the other way round.
        from app.generator.games import GAME_SCHEMA_TITLE, reference_game

        if json_schema is None:
            return "This is a fake reply."
        if json_schema.get("title") == GAME_SCHEMA_TITLE:
            return reference_game().model_dump_json()
        return json.dumps(_example(json_schema))


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
