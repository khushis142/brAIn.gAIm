import uuid
from datetime import datetime
from pathlib import PurePosixPath
from typing import Annotated, Any, Literal, Self

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

Kind = Literal["video", "game"]

# Videos the frontend can play (the CDN accepts more).
_VIDEO_EXTENSIONS = {".mp4"}
# Project attachments: documents and images. No SVG, it can carry scripts.
_ATTACHMENT_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".txt", ".md", ".csv"}


def _check_cdn_filename(filename: str, allowed: set[str], what: str) -> None:
    if "/" in filename or "\\" in filename:
        raise ValueError("filename must not contain path separators")
    if PurePosixPath(filename).suffix.lower() not in allowed:
        raise ValueError(f"{what} must be one of: {', '.join(sorted(allowed))}")


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=128)


def _blank_to_none(text: str | None) -> str | None:
    return text.strip() or None if text is not None else None


class UserUpdate(BaseModel):
    # Omitted = unchanged, null or blank = cleared.
    interests: Annotated[str | None, Field(max_length=2000), AfterValidator(_blank_to_none)] = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    interests: str | None


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
    """Registers a video the client already uploaded to the CDN.

    Games are never registered through the API: they are JS that runs in the app, so only
    server-side code (generator, seeding) creates them.
    """

    id: uuid.UUID = Field(description="File id returned by the CDN upload")
    filename: str = Field(min_length=1, max_length=255, description="As returned by the CDN")
    title: str = Field(min_length=1, max_length=200)
    tags: Tags = []

    @model_validator(mode="after")
    def _check_filename(self) -> Self:
        _check_cdn_filename(self.filename, _VIDEO_EXTENSIONS, "a video")
        return self


class ContentUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    tags: Tags | None = None


class ContentRead(BaseModel):
    id: uuid.UUID
    kind: Kind
    title: str
    tags: list[str]
    owner: str
    url: str
    created_at: datetime


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    body: str = Field("", max_length=100_000, description="Markdown")


class ProjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    body: str | None = Field(None, max_length=100_000, description="Markdown")


class AttachmentCreate(BaseModel):
    """Registers a file the client already uploaded to the CDN."""

    id: uuid.UUID = Field(description="File id returned by the CDN upload")
    filename: str = Field(min_length=1, max_length=255, description="As returned by the CDN")

    @model_validator(mode="after")
    def _check_filename(self) -> Self:
        _check_cdn_filename(self.filename, _ATTACHMENT_EXTENSIONS, "an attachment")
        return self


class AttachmentRead(BaseModel):
    id: uuid.UUID
    filename: str
    url: str
    created_at: datetime


class ProjectRead(BaseModel):
    id: uuid.UUID
    name: str
    body: str
    attachments: list[AttachmentRead]
    created_at: datetime
    updated_at: datetime


class VideoItem(BaseModel):
    type: Literal["video"] = "video"
    id: uuid.UUID
    title: str
    url: str


class GameItem(BaseModel):
    type: Literal["game"] = "game"
    id: uuid.UUID
    title: str
    url: str = Field(description="The game's JS file")
    round_id: uuid.UUID
    input: dict[str, Any] = Field(description="Generated input matching the game's schema")


FeedItem = Annotated[VideoItem | GameItem, Field(discriminator="type")]


class ScoreCreate(BaseModel):
    score: int = Field(ge=0)


class LeaderboardEntry(BaseModel):
    username: str
    score: int
