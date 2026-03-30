"""Auth middleware — verifies Supabase JWT and restricts to @owledmedia.com."""

import logging
import jwt
import requests
from functools import lru_cache
from fastapi import Request, HTTPException

logger = logging.getLogger(__name__)

from app.config import get_settings

ALLOWED_DOMAIN = "owledmedia.com"


@lru_cache
def _get_jwks_url() -> str:
    url = get_settings().supabase_url
    return f"{url}/auth/v1/.well-known/jwks.json"


@lru_cache
def _get_jwks() -> dict:
    resp = requests.get(_get_jwks_url())
    resp.raise_for_status()
    return resp.json()


def _get_signing_key(token: str):
    jwks = _get_jwks()
    header = jwt.get_unverified_header(token)
    for key in jwks["keys"]:
        if key["kid"] == header["kid"]:
            return jwt.algorithms.RSAAlgorithm.from_jwk(key)
    raise HTTPException(status_code=401, detail="Invalid token signing key")


def verify_token(token: str) -> dict:
    """Verify a Supabase JWT and return its claims."""
    try:
        key = _get_signing_key(token)
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience="authenticated",
            leeway=120,
        )
        return claims
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


async def require_auth(request: Request):
    """FastAPI dependency — extracts and validates the Bearer token."""
    auth_header = request.headers.get("Authorization", "")
    logger.info(f"Auth header present: {bool(auth_header)}, starts with Bearer: {auth_header.startswith('Bearer ')}")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization token")

    token = auth_header.removeprefix("Bearer ")
    claims = verify_token(token)
    logger.info(f"Auth success for: {claims.get('email', 'unknown')}")

    email = claims.get("email", "")
    if not email.endswith(f"@{ALLOWED_DOMAIN}"):
        raise HTTPException(status_code=403, detail="Access restricted to @owledmedia.com accounts")

    request.state.user = claims
    return claims
