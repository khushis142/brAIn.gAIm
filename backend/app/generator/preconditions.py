"""Server-side steps that run on a game's generated input before the round is ready.

A game declares them in `config.json` under `preconditions`. A `tts` step reads values from
the input by `path` (a JSON Pointer where `*` matches every array item) and writes its
result into a sibling field `into`; a `random_file` step writes one of a fixed list of CDN
files (e.g. background video clips) into the top-level field `into`. Steps report the JSON
Pointers of the CDN URLs they wrote as assets, which the host must fetch (the game iframe
has no network access) before starting the game.
"""

import random
import uuid
from collections.abc import Iterator
from typing import Annotated, Any, Literal

import httpx
from pydantic import BaseModel, Field

from app import cdn
from app.generator import tts

_IDENTIFIER = r"^[A-Za-z_][A-Za-z0-9_]*$"


class TtsStep(BaseModel):
    """Speak each matched text; write the audio file's URL into `into`."""

    type: Literal["tts"]
    path: str = Field(
        pattern=r"^(/([A-Za-z0-9_-]+|\*))*/[A-Za-z0-9_-]+$",
        examples=["/questions/*/question"],
    )
    into: str = Field(pattern=_IDENTIFIER, examples=["questionAudio"])

    def check_against(self, schema: dict[str, Any]) -> None:
        """Fail if `path` does not lead to a string in `schema`, or `into` is taken."""
        *parents, key = self.path.strip("/").split("/")
        node = schema
        for segment in parents:
            if segment == "*":
                if node.get("type") != "array":
                    raise ValueError(f"precondition path {self.path} uses '*' on a non-array")
                node = node.get("items", {})
            else:
                node = _property(node, segment)
        if _property(node, key).get("type") != "string":
            raise ValueError(f"precondition path {self.path} must point to a string")
        if self.into in node.get("properties", {}):
            raise ValueError(f"precondition target {self.into!r} clashes with a schema property")


class CdnFileRef(BaseModel):
    id: uuid.UUID
    filename: str = Field(pattern=r"^[A-Za-z0-9._-]+$")


class RandomFileStep(BaseModel):
    """Write the URL of one randomly chosen file of `files` into the top-level field `into`."""

    type: Literal["random_file"]
    files: list[CdnFileRef] = Field(min_length=1)
    into: str = Field(pattern=_IDENTIFIER, examples=["backgroundVideo"])

    def check_against(self, schema: dict[str, Any]) -> None:
        if self.into in schema.get("properties", {}):
            raise ValueError(f"precondition target {self.into!r} clashes with a schema property")


PreconditionStep = Annotated[TtsStep | RandomFileStep, Field(discriminator="type")]


def _property(node: dict[str, Any], name: str) -> dict[str, Any]:
    properties = node.get("properties", {})
    if name not in properties:
        raise ValueError(f"precondition path refers to unknown property {name!r}")
    return properties[name]


class PreconditionError(Exception):
    pass


def _matches(data: Any, segments: list[str], pointer: str = "") -> Iterator[tuple[dict, str, str]]:
    """Yield (parent object, key, pointer to parent) for every string the path selects."""
    head, *rest = segments
    if not rest:
        if isinstance(data, dict) and isinstance(data.get(head), str):
            yield data, head, pointer
        return
    if head == "*":
        children = enumerate(data) if isinstance(data, list) else []
    else:
        children = [(head, data[head])] if isinstance(data, dict) and head in data else []
    for name, child in children:
        yield from _matches(child, rest, f"{pointer}/{name}")


async def run_preconditions(steps: list[PreconditionStep], data: dict[str, Any]) -> list[str]:
    """Apply `steps` to `data` in place; return JSON Pointers of the asset URLs written."""
    assets = []
    try:
        for step in steps:
            if isinstance(step, RandomFileStep):
                file = random.choice(step.files)
                data[step.into] = cdn.file_url(file.id, file.filename)
                assets.append(f"/{step.into}")
                continue
            for parent, key, pointer in list(_matches(data, step.path.strip("/").split("/"))):
                audio = await tts.synthesize(parent[key])
                file_id, filename = await cdn.upload(audio, "speech.wav", "audio/wav")
                parent[step.into] = cdn.file_url(file_id, filename)
                assets.append(f"{pointer}/{step.into}")
    except (tts.TTSError, httpx.HTTPError) as error:
        raise PreconditionError(str(error)) from error
    return assets
