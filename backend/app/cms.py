"""Client for the content management system (CMS) that owns all feed content.

The CMS API is not defined yet. This module is an in-process mock shaped after the
expected endpoints; once the real CMS exists, only the function bodies change:

    GET /fields                    -> list_fields()
    GET /videos?field=<slug>       -> list_content("video", slug)
    GET /games?field=<slug>        -> list_content("game", slug)
    GET /video/<id>, GET /game/<id> -> get_content(kind, id)
"""

from dataclasses import dataclass
from typing import Literal

Kind = Literal["video", "game"]


@dataclass(frozen=True)
class StudyField:
    slug: str
    name: str


@dataclass(frozen=True)
class ContentSummary:
    id: str
    title: str


@dataclass(frozen=True)
class Content:
    id: str
    title: str
    url: str


@dataclass(frozen=True)
class _MockItem:
    id: str
    kind: Kind
    field: str
    title: str
    url: str


_TEST_VIDEOS = "https://test-videos.co.uk/vids"

_MOCK_FIELDS = [
    StudyField(slug="computer-science", name="Computer Science"),
    StudyField(slug="engineering", name="Engineering"),
]

# Videos are public sample clips; game URLs are placeholders until a game exists.
_MOCK_CONTENT = [
    _MockItem("cs-big-o", "video", "computer-science", "Big-O in 60 seconds",
              f"{_TEST_VIDEOS}/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4"),
    _MockItem("cs-recursion", "video", "computer-science", "Recursion explained",
              f"{_TEST_VIDEOS}/jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4"),
    _MockItem("cs-hashing", "video", "computer-science", "How hash maps work",
              f"{_TEST_VIDEOS}/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4"),
    _MockItem("cs-sorting-quiz", "game", "computer-science", "Sorting quiz",
              "https://cms.invalid/games/cs-sorting-quiz.js"),
    _MockItem("eng-beams", "video", "engineering", "Why beams bend",
              "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"),
    _MockItem("eng-circuits", "video", "engineering", "Ohm's law in a minute",
              "https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4"),
    _MockItem("eng-units-quiz", "game", "engineering", "Units quiz",
              "https://cms.invalid/games/eng-units-quiz.js"),
]  # fmt: skip


async def list_fields() -> list[StudyField]:
    return list(_MOCK_FIELDS)


async def list_content(kind: Kind, field: str) -> list[ContentSummary]:
    return [
        ContentSummary(id=item.id, title=item.title)
        for item in _MOCK_CONTENT
        if item.kind == kind and item.field == field
    ]


async def get_content(kind: Kind, content_id: str) -> Content | None:
    for item in _MOCK_CONTENT:
        if item.kind == kind and item.id == content_id:
            return Content(id=item.id, title=item.title, url=item.url)
    return None
