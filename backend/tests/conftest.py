import os

# Settings are read at import time; provide test values before importing the app.
# Presigning is offline, so S3 needs no running service.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://unused@localhost/unused"
)
os.environ.update(
    S3_BUCKET="test",
    S3_ENDPOINT_URL="http://localhost:9000",
    S3_ACCESS_KEY_ID="test",
    S3_SECRET_ACCESS_KEY="test",
    JWT_SECRET="test-secret-at-least-32-bytes-long!!",
)
