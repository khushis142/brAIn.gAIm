"""Adapter for OpenAI-compatible chat completions APIs, which serve two providers:

- the self-hosted LiteLLM proxy (#44), which routes model aliases to Anthropic and enforces
  spend budgets (production);
- a local Ollama (`http://localhost:11434/v1`), for development without any key.

Prompts contain users' documents: never log them or the replies.
"""

from collections.abc import Sequence
from typing import Any

import httpx

from app.generator.llm.base import LLM, LLMBudgetError, LLMError, Message

# Long replies (whole games) take minutes, especially on local models.
_TIMEOUT = httpx.Timeout(600, connect=5)


class ChatCompletionsLLM(LLM):
    def __init__(
        self,
        base_url: str,
        model: str,
        api_key: str | None = None,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._model = model
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {api_key}"} if api_key else {},
            timeout=_TIMEOUT,
            transport=transport,
        )

    async def generate(
        self,
        system: str,
        messages: Sequence[Message],
        *,
        json_schema: dict[str, Any] | None = None,
        max_tokens: int,
    ) -> str:
        body: dict[str, Any] = {
            "model": self._model,
            "max_tokens": max_tokens,
            "messages": [{"role": "system", "content": system}, *messages],
        }
        if json_schema is not None:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "reply", "schema": json_schema},
            }
        try:
            res = await self._client.post("/chat/completions", json=body)
        except httpx.HTTPError as error:
            raise LLMError(f"LLM provider unreachable: {type(error).__name__}") from error
        if res.is_error:
            raise _error(res)
        try:
            content = res.json()["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as error:
            raise LLMError("LLM provider returned an unexpected response") from error
        if not isinstance(content, str):
            raise LLMError("LLM provider returned no text")
        return content


def _error(res: httpx.Response) -> LLMError:
    try:
        error = res.json().get("error") or {}
    except ValueError:
        error = {}
    if not isinstance(error, dict):
        error = {"message": str(error)}
    kind = str(error.get("type", ""))
    message = f"LLM provider {res.status_code} {kind}: {str(error.get('message', ''))[:300]}"
    # LiteLLM's answer for a key whose budget is used up.
    if kind == "budget_exceeded" or "budget" in str(error.get("message", "")).lower():
        return LLMBudgetError(message)
    return LLMError(message)
