# backend/auth.py
"""
Cryptographic Supabase JWT Authorization & Identity Extraction
Validates tokens signed by Supabase Auth (both ES256 asymmetric and HS256 symmetric)
for multiplayer admin operations.
"""

import logging
import os
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from models import AuthUser

logger = logging.getLogger("diplomacy.auth")

security = HTTPBearer(auto_error=False)

JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
JWT_PUBLIC_KEY = os.getenv("SUPABASE_JWT_PUBLIC_KEY")

_JWKS_CLIENTS = {}


def get_jwt_secret() -> Optional[str]:
    """Retrieve the Supabase JWT secret from the environment with module fallback."""
    return os.getenv("SUPABASE_JWT_SECRET") or JWT_SECRET


def get_jwt_public_key() -> Optional[str]:
    """Retrieve the Supabase JWT public key (for ES256/asymmetric) from the environment."""
    return os.getenv("SUPABASE_JWT_PUBLIC_KEY") or JWT_PUBLIC_KEY


def get_supabase_url() -> str:
    """Retrieve the Supabase base URL."""
    url = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or "").strip()
    return url.rstrip("/")


def get_jwks_client(supabase_url: str) -> Optional[jwt.PyJWKClient]:
    """Return a cached PyJWKClient for the given Supabase URL."""
    if not supabase_url:
        return None
    if supabase_url not in _JWKS_CLIENTS:
        jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
        _JWKS_CLIENTS[supabase_url] = jwt.PyJWKClient(jwks_url, cache_keys=True)
    return _JWKS_CLIENTS[supabase_url]


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[AuthUser]:
    """Extract and cryptographically verify the Supabase JWT Bearer token (supports ES256 and HS256)."""
    if not credentials:
        return None

    token = credentials.credentials
    jwt_secret = get_jwt_secret()
    jwt_pub_key = get_jwt_public_key()
    sb_url = get_supabase_url()

    # Determine algorithm from token header
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")
    except Exception:
        alg = "HS256"

    # Dev fallback when neither secrets nor Supabase URL are configured in local environment
    if not jwt_secret and not jwt_pub_key and not sb_url:
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
        if alg == "ES256":
            # Asymmetric ECC verification
            if jwt_pub_key:
                payload = jwt.decode(
                    token,
                    jwt_pub_key,
                    algorithms=["ES256"],
                    options={"verify_aud": False},
                )
            elif sb_url:
                jwks_client = get_jwks_client(sb_url)
                if not jwks_client:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Supabase URL not configured for JWKS validation.",
                    )
                signing_key = jwks_client.get_signing_key_from_jwt(token)
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=["ES256"],
                    options={"verify_aud": False},
                )
            elif not jwt_secret:
                # Local dev fallback when no public key or Supabase URL is available
                unverified = jwt.decode(token, options={"verify_signature": False})
                return AuthUser(
                    user_id=unverified.get("sub", "dev_user"),
                    email=unverified.get("email"),
                    is_authenticated=True,
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token signed with ES256, but no public key or Supabase URL configured.",
                )
        else:
            # Symmetric HS256 verification
            if not jwt_secret:
                unverified = jwt.decode(token, options={"verify_signature": False})
                return AuthUser(
                    user_id=unverified.get("sub", "dev_user"),
                    email=unverified.get("email"),
                    is_authenticated=True,
                )
            payload = jwt.decode(
                token,
                jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
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
