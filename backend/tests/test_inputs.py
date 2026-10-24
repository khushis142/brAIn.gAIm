import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import pytest
from jsonschema import validate
from pydantic import ValidationError

from app.generator.inputs import MAX_ATTEMPTS, GameConfig, InputGenerationError, generate_input
from app.generator.llm import LLM, FakeLLM, Message

EXAMPLE = GameConfig.model_validate_json(
    (Path(__file__).parents[1] / "games/example-quiz/config.json").read_text()
)


class ScriptedLLM(LLM):
    """Replies with the given texts in order and records every call."""

    def __init__(self, *replies: str) -> None:
        self.replies = list(replies)
        self.calls: list[tuple[str, list[Message]]] = []

    async def generate(
        self,
        system: str,
        messages: Sequence[Message],
        *,
        json_schema: dict[str, Any] | None = None,
        max_tokens: int,
    ) -> str:
        self.calls.append((system, list(messages)))
        return self.replies.pop(0)


def test_config_rejects_invalid_schema() -> None:
    with pytest.raises(ValidationError, match="not a valid JSON Schema"):
        GameConfig(input_schema={"type": "nonsense"}, context="x")


async def test_fake_llm_fills_the_example_game() -> None:
    game_input = await generate_input(FakeLLM(), EXAMPLE, ["# Biology\n\nCells divide."])
    validate(game_input, EXAMPLE.input_schema)


async def test_prompt_carries_context_schema_and_projects() -> None:
    valid = json.dumps(await generate_input(FakeLLM(), EXAMPLE, []))
    llm = ScriptedLLM(valid)
    await generate_input(llm, EXAMPLE, ["# Thesis\n\nSpaced repetition"])
    system, messages = llm.calls[0]
    assert EXAMPLE.context in system
    assert json.dumps(EXAMPLE.input_schema) in system
    assert "Spaced repetition" in messages[0]["content"]


async def test_invalid_reply_is_retried_with_errors() -> None:
    valid = json.dumps(await generate_input(FakeLLM(), EXAMPLE, []))
    llm = ScriptedLLM("not json", valid)
    assert json.loads(valid) == await generate_input(llm, EXAMPLE, [])
    retry_messages = llm.calls[1][1]
    assert retry_messages[-2] == {"role": "assistant", "content": "not json"}
    assert "not valid JSON" in retry_messages[-1]["content"]


async def test_gives_up_after_max_attempts() -> None:
    llm = ScriptedLLM(*[json.dumps({"questions": []})] * MAX_ATTEMPTS)
    with pytest.raises(InputGenerationError):
        await generate_input(llm, EXAMPLE, [])
    assert len(llm.calls) == MAX_ATTEMPTS
