"""ORM models, one module per domain so lanes don't edit the same file (see #11).

Re-export every model here: Alembic's env.py imports this package, and autogenerate only sees
tables whose module has been imported.
"""

from app.models.base import Base
from app.models.content import Content
from app.models.feed import Impression
from app.models.games import GameRound, Score
from app.models.projects import Flashcard, Project, ProjectAttachment
from app.models.users import User
from app.models.zombie import EquippedAccessory, SelectedAvatar, UserAccessory, UserAvatar

__all__ = [
    "Base",
    "Content",
    "EquippedAccessory",
    "Flashcard",
    "GameRound",
    "Impression",
    "Project",
    "ProjectAttachment",
    "Score",
    "SelectedAvatar",
    "User",
    "UserAccessory",
    "UserAvatar",
]
