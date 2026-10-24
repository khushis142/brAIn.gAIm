import os

# Settings are read at import time; provide test values before importing the app.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://unused@localhost/unused"
)
os.environ["JWT_SECRET"] = "test-secret-at-least-32-bytes-long!!"
