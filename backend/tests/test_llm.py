import json

import httpx
import pytest
from pydantic import ValidationError

from app.config import Settings
from app.generator import llm as llm_module
from app.generator.llm import ChatCompletionsLLM, FakeLLM, LLMBudgetError, LLMError, get_llm

SCHEMA = {"type": "object", "properties": {"context": {"type": "string"}}}


def test_fake_is_the_default_provider() -> None:
    assert isinstance(get_llm(), FakeLLM)


def test_unknown_provider_is_rejected() -> None:
    with pytest.raises(ValidationError, match="llm_provider"):
        Settings(llm_provider="openai")


def test_litellm_needs_its_settings() -> None:
    with pytest.raises(ValidationError, match="LLM_BASE_URL, LLM_MODEL, LLM_API_KEY"):
        Settings(llm_provider="litellm")


def test_litellm_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(
        llm_provider="litellm",
        llm_base_url="http://litellm:4000",
        llm_model="smart",
        llm_api_key="sk-test",
    )
    monkeypatch.setattr(llm_module, "get_settings", lambda: settings)
    get_llm.cache_clear()
    try:
        assert isinstance(get_llm(), ChatCompletionsLLM)
    finally:
        get_llm.cache_clear()
    assert "sk-test" not in repr(settings)


def test_ollama_needs_only_a_model() -> None:
    with pytest.raises(ValidationError, match="LLM_MODEL"):
        Settings(llm_provider="ollama")
    settings = Settings(llm_provider="ollama", llm_model="qwen3:8b")
    assert settings.llm_base_url == "http://localhost:11434/v1"


async def test_ollama_sends_no_key() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"content": "hi"}}]})

    llm = ChatCompletionsLLM(
        "http://localhost:11434/v1", "qwen3:8b", transport=httpx.MockTransport(handler)
    )
    assert await llm.generate("sys", [], max_tokens=10) == "hi"
    assert str(requests[0].url) == "http://localhost:11434/v1/chat/completions"
    assert "authorization" not in requests[0].headers


def _litellm(handler) -> ChatCompletionsLLM:
    return ChatCompletionsLLM(
        "http://litellm:4000/", "smart", "sk-test", transport=httpx.MockTransport(handler)
    )


async def test_litellm_request_and_reply() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"a": 1}'}}]})

    llm = _litellm(handler)
    messages = [{"role": "user", "content": "notes"}]
    assert await llm.generate("sys", messages, json_schema=SCHEMA, max_tokens=100) == '{"a": 1}'
    await llm.generate("sys", messages, max_tokens=100)

    first, second = requests
    assert str(first.url) == "http://litellm:4000/chat/completions"
    assert first.headers["authorization"] == "Bearer sk-test"
    body = json.loads(first.content)
    assert body["model"] == "smart"
    assert body["max_tokens"] == 100
    assert body["messages"] == [{"role": "system", "content": "sys"}, *messages]
    assert body["response_format"]["json_schema"]["schema"] == SCHEMA
    assert "response_format" not in json.loads(second.content)


@pytest.mark.parametrize(
    ("response", "error"),
    [
        (
            httpx.Response(
                400,
                json={"error": {"type": "budget_exceeded", "message": "Budget has been exceeded"}},
            ),
            LLMBudgetError,
        ),
        (httpx.Response(500, text="boom"), LLMError),
        (httpx.Response(200, json={"choices": []}), LLMError),
        (httpx.Response(200, json={"choices": [{"message": {"content": None}}]}), LLMError),
    ],
)
async def test_litellm_errors(response: httpx.Response, error: type[Exception]) -> None:
    llm = _litellm(lambda request: response)
    with pytest.raises(error):
        await llm.generate("sys", [], max_tokens=10)


async def test_litellm_unreachable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("timeout", request=request)

    with pytest.raises(LLMError, match="unreachable"):
        await _litellm(handler).generate("sys", [], max_tokens=10)
