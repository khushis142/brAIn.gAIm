import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pwdlib import PasswordHash

from app.config import get_settings
from app.db import SessionDep
from app.models import User

ACCESS_TOKEN_TTL = timedelta(days=7)
_ALGORITHM = "HS256"

_password_hash = PasswordHash.recommended()
_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _password_hash.verify(password, password_hash)


def create_access_token(user_id: uuid.UUID) -> str:
    payload = {"sub": str(user_id), "exp": datetime.now(UTC) + ACCESS_TOKEN_TTL}
    return jwt.encode(payload, get_settings().jwt_secret, algorithm=_ALGORITHM)


async def get_current_user(
    token: Annotated[str, Depends(_oauth2_scheme)], session: SessionDep
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=[_ALGORITHM])
        user_id = uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise unauthorized from None
    user = await session.get(User, user_id)
    if user is None:
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
