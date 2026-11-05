# backend/auth.py
"""
Cryptographic Supabase JWT Authorization & Identity Extraction
Validates HS256 tokens signed by Supabase Auth for multiplayer admin operations.
"""

import os
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from models import AuthUser

security = HTTPBearer(auto_error=False)

JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")


def get_jwt_secret() -> Optional[str]:
    """Retrieve the Supabase JWT secret from the environment with module fallback."""
    return os.getenv("SUPABASE_JWT_SECRET") or JWT_SECRET


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[AuthUser]:
    """Extract and cryptographically verify the Supabase JWT Bearer token."""
    if not credentials:
        return None

    token = credentials.credentials
    jwt_secret = get_jwt_secret()

    if not jwt_secret:
        # Dev fallback when secrets are not configured in local environment
        try:
            unverified = jwt.decode(token, options={"verify_signature": False})
            return AuthUser(
                user_id=unverified.get("sub", "dev_user"),
                email=unverified.get("email"),
                is_authenticated=True,
            )
        except Exception:
            return None

    try:
        payload = jwt.decode(
            token,
            jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},  # Supabase audience is usually 'authenticated'
        )
        user_id = payload.get("sub")
        email = payload.get("email")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload: missing subject ('sub').",
            )
        return AuthUser(user_id=user_id, email=email, is_authenticated=True)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired.",
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {str(exc)}",
        )
