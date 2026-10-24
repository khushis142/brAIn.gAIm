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
        # Same prompt, same game, so tests are deterministic; `json_schema` is not enforced.
        prompt = json.dumps([system, list(messages)]).encode()
        index = int.from_bytes(hashlib.sha256(prompt).digest()[:4]) % len(self._games)
        return self._games[index]
