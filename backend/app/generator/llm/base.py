from abc import ABC, abstractmethod
from collections.abc import Sequence
from typing import Any, Literal, TypedDict


class Message(TypedDict):
    role: Literal["user", "assistant"]
    content: str


class LLMError(Exception):
    """The provider failed to answer (unreachable, rejected the request, bad response)."""


class LLMBudgetError(LLMError):
    """The provider refused because the key's spend budget is used up."""


class LLM(ABC):
    @abstractmethod
    async def generate(
        self,
        system: str,
        messages: Sequence[Message],
        *,
        json_schema: dict[str, Any] | None = None,
        max_tokens: int,
    ) -> str:
        """Return the model's reply text; with `json_schema`, a JSON document matching it.

        Raises `LLMError` when the provider cannot answer.
        """

    async def aclose(self) -> None:  # noqa: B027
        """Close underlying network resources, if any."""
