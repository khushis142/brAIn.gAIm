import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class StudyFieldRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=128)
    field_id: int


class UserUpdate(BaseModel):
    field_id: int


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    field: StudyFieldRead


class Token(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


class VideoItem(BaseModel):
    type: Literal["video"] = "video"
    id: int
    title: str
    url: str


class GameItem(BaseModel):
    type: Literal["game"] = "game"
    id: int
    title: str
    url: str


FeedItem = Annotated[VideoItem | GameItem, Field(discriminator="type")]


class ScoreCreate(BaseModel):
    score: int = Field(ge=0)


class LeaderboardEntry(BaseModel):
    username: str
    score: int
