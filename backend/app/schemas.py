import uuid
from datetime import datetime
from pathlib import PurePosixPath
from typing import Annotated, Literal, Self

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

Kind = Literal["video", "game"]

# File types the frontend can play/run, per kind (the CDN accepts more).
_EXTENSIONS: dict[str, set[str]] = {"video": {".mp4"}, "game": {".js", ".mjs"}}


class StudyFieldRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=128)
    field: str


class UserUpdate(BaseModel):
    field: str


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    field: str
    is_developer: bool


class Token(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


def _normalize_tags(tags: list[str]) -> list[str]:
    return list(dict.fromkeys(tag.strip().lower() for tag in tags if tag.strip()))


# Free-form, lowercased and de-duplicated.
Tags = Annotated[
    list[Annotated[str, Field(min_length=1, max_length=32)]],
    Field(max_length=20),
    AfterValidator(_normalize_tags),
]


class ContentCreate(BaseModel):
    """Registers a file the client already uploaded to the CDN."""

    id: uuid.UUID = Field(description="File id returned by the CDN upload")
    filename: str = Field(min_length=1, max_length=255, description="As returned by the CDN")
    kind: Kind
    title: str = Field(min_length=1, max_length=200)
    field: str
    tags: Tags = []

    @model_validator(mode="after")
    def _check_filename(self) -> Self:
        if "/" in self.filename or "\\" in self.filename:
            raise ValueError("filename must not contain path separators")
        if PurePosixPath(self.filename).suffix.lower() not in _EXTENSIONS[self.kind]:
            allowed = ", ".join(sorted(_EXTENSIONS[self.kind]))
            raise ValueError(f"a {self.kind} must be one of: {allowed}")
        return self


class ContentUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    field: str | None = None
    tags: Tags | None = None


class ContentRead(BaseModel):
    id: uuid.UUID
    kind: Kind
    title: str
    field: str
    tags: list[str]
    owner: str
    url: str
    created_at: datetime


class VideoItem(BaseModel):
    type: Literal["video"] = "video"
    id: uuid.UUID
    title: str
    url: str


class GameItem(BaseModel):
    type: Literal["game"] = "game"
    id: uuid.UUID
    title: str
    url: str


FeedItem = Annotated[VideoItem | GameItem, Field(discriminator="type")]


class ScoreCreate(BaseModel):
    score: int = Field(ge=0)


class LeaderboardEntry(BaseModel):
    username: str
    score: int
