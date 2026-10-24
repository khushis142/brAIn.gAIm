import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import pytest

from app.generator.games import (
    GameGenerationError,
    check_game_code,
    generate_game,
    reference_game,
)
from app.generator.inputs import MAX_ATTEMPTS
from app.generator.llm import LLM, FakeLLM, Message

GAMES = Path(__file__).parents[1] / "games"
REFERENCE = Path(__file__).parents[1] / "app/generator/reference"


class ScriptedLLM(LLM):
    def __init__(self, *replies: str) -> None:
        self.replies = list(replies)
        self.calls: list[list[Message]] = []

    async def generate(
        self,
        system: str,
        messages: Sequence[Message],
        *,
        json_schema: dict[str, Any] | None = None,
        max_tokens: int,
    ) -> str:
        self.calls.append(list(messages))
        return self.replies.pop(0)


@pytest.mark.parametrize("game", sorted(GAMES.glob("*/game.js")), ids=lambda p: p.parent.name)
def test_reviewed_games_pass_the_checks(game: Path) -> None:
    assert check_game_code(game.read_text()) == []


def test_reference_is_the_example_quiz() -> None:
    for name in ("game.js", "config.json"):
        assert (REFERENCE / name).read_text() == (GAMES / "example-quiz" / name).read_text()


@pytest.mark.parametrize(
    ("code", "error"),
    [
        ("console.log('no registration');", "never calls registerGame"),
        ("registerGame({}); const s = '</SCRIPT>';", "</script"),
        ("registerGame({}); fetch('/x');", "fetch"),
        ("registerGame({}); new Function('return 1');", "new Function"),
        ("registerGame({}); import('x');", "import"),
        ("registerGame({}); const u = 'https://evil.test';", "https://"),
        ("registerGame({}); localStorage.x = 1;", "localStorage"),
        ("registerGame({});" + " " * 200_001, "larger than"),
    ],
)
def test_check_game_code_rejects(code: str, error: str) -> None:
    assert error in "; ".join(check_game_code(code))


async def test_fake_llm_generates_the_reference_game() -> None:
    game = await generate_game(FakeLLM(), ["# Biology\n\nCells divide."])
    assert game == reference_game()


async def test_retries_with_the_errors() -> None:
    bad = json.loads(reference_game().model_dump_json())
    bad["game_js"] = "fetch('x')"
    llm = ScriptedLLM(json.dumps(bad), reference_game().model_dump_json())
    assert await generate_game(llm, []) == reference_game()
    feedback = llm.calls[1][-1]["content"]
    assert "registerGame" in feedback and "fetch" in feedback


async def test_invalid_config_is_rejected() -> None:
    bad = json.loads(reference_game().model_dump_json())
    bad["config"]["input_schema"] = {"type": "object"}
    llm = ScriptedLLM(*[json.dumps(bad)] * MAX_ATTEMPTS)
    with pytest.raises(GameGenerationError, match="context"):
        await generate_game(llm, [])
