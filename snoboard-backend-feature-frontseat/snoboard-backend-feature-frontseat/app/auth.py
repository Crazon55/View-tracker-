"""Auth middleware — verifies Supabase JWT and restricts to @owledmedia.com."""

import logging
import jwt
from jwt import PyJWKClient
from functools import lru_cache
from fastapi import Request, HTTPException

logger = logging.getLogger(__name__)

from app.config import get_settings

ALLOWED_DOMAIN = "owledmedia.com"
ADMIN_ROLE_IDS = frozenset({"senior_cs", "boss_man", "ai_dev", "admin", "ai_automations"})


def parse_roles(role_str: str) -> set[str]:
    return {r.strip() for r in (role_str or "").split(",") if r.strip()}


def is_admin_role(role_str: str) -> bool:
    return bool(parse_roles(role_str) & ADMIN_ROLE_IDS)


async def require_admin(request: Request):
    """FastAPI dependency — admin roles only (Senior CS, Boss Man, AI Dev)."""
    claims = await require_auth(request)
    from app.database.client import get_supabase_client

    email = claims.get("email", "")
    client = get_supabase_client()
    data = client.table("user_roles").select("role").eq("email", email).execute().data
    if not data or not is_admin_role(data[0].get("role", "")):
        raise HTTPException(status_code=403, detail="Admin access required")
    return claims


@lru_cache
def _get_jwks_url() -> str:
    url = get_settings().supabase_url.rstrip("/")
    return f"{url}/auth/v1/.well-known/jwks.json"


@lru_cache
def _get_jwk_client() -> PyJWKClient:
    return PyJWKClient(_get_jwks_url(), cache_keys=True, lifespan=300)


def verify_token(token: str) -> dict:
    """Verify a Supabase JWT and return its claims."""
    settings = get_settings()
    decode_opts = {"audience": "authenticated", "leeway": 120}
    last_err: Exception | None = None

    # Supabase access tokens are usually HS256 signed with the project JWT secret.
    jwt_secret = (getattr(settings, "supabase_jwt_secret", None) or "").strip()
    if jwt_secret:
        try:
            return jwt.decode(token, jwt_secret, algorithms=["HS256"], **decode_opts)
        except jwt.InvalidTokenError as e:
            last_err = e
            logger.debug("HS256 verify failed: %s", e)

    # Asymmetric keys (RS256 / ES256) via Supabase JWKS.
    try:
        signing_key = _get_jwk_client().get_signing_key_from_jwt(token)
        alg = jwt.get_unverified_header(token).get("alg", "RS256")
        allowed = ["RS256", "ES256", "ES384", "ES512"]
        if alg not in allowed:
            allowed.append(alg)
        return jwt.decode(token, signing_key.key, algorithms=allowed, **decode_opts)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        last_err = e
        logger.warning("JWKS verify failed: %s", e)
    except Exception as e:
        last_err = e
        logger.warning("JWKS client error: %s", e)

    if last_err:
        raise HTTPException(status_code=401, detail=f"Invalid token: {last_err}")
    raise HTTPException(status_code=401, detail="Invalid token signing key")


async def require_auth(request: Request):
    """FastAPI dependency — extracts and validates the Bearer token."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization token")

    token = auth_header.removeprefix("Bearer ")
    claims = verify_token(token)

    email = claims.get("email", "")
    if not email.endswith(f"@{ALLOWED_DOMAIN}"):
        raise HTTPException(status_code=403, detail="Access restricted to @owledmedia.com accounts")

    request.state.user = claims
    return claims
