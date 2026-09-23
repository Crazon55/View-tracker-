"""Settings for the FSOS API, read from fsos-backend/.env (git-ignored)."""
import os
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

SUPABASE_URL = (os.getenv("FSOS_SUPABASE_URL") or "").rstrip("/")
SERVICE_KEY = os.getenv("FSOS_SUPABASE_SERVICE_KEY") or ""
ANON_KEY = os.getenv("FSOS_SUPABASE_ANON_KEY") or ""
ALLOWED_EMAIL_DOMAIN = (os.getenv("FSOS_ALLOWED_EMAIL_DOMAIN") or "").strip().lower()
CORS_ORIGINS = [o.strip() for o in (os.getenv("FSOS_CORS_ORIGINS") or "http://localhost:3000").split(",") if o.strip()]

# Local development only: lets requests authenticate with `X-FSOS-Dev-Email: name@…`
# instead of a real login, so the API can be exercised before Google sign-in exists.
# Must never be enabled on a deployed instance.
DEV_LOGIN = (os.getenv("FSOS_DEV_LOGIN") or "").strip().lower() == "true"

# Shared secret for POST /api/news/ingest, used by the n8n workflow that collects
# stories. It is deliberately narrow: it can add news articles and do nothing else, so
# a machine on someone else's cloud never needs the service-role key. Unset disables
# the route entirely.
INGEST_TOKEN = (os.getenv("FSOS_NEWS_INGEST_TOKEN") or "").strip()

if not SUPABASE_URL or not SERVICE_KEY:
    raise RuntimeError("FSOS_SUPABASE_URL and FSOS_SUPABASE_SERVICE_KEY must be set in fsos-backend/.env")


def _is_local(origin: str) -> bool:
    host = urlparse(origin).hostname or ""
    return host in ("localhost", "127.0.0.1", "::1", "0.0.0.0")


# Dev login accepts an email header in place of a token: anyone who can reach the API
# can be anyone. That is fine on a laptop and catastrophic anywhere else, and the only
# reliable signal for "anywhere else" is being asked to serve a real origin. Refusing to
# start is the point — a warning in a log nobody reads is how this ships by accident.
if DEV_LOGIN:
    public = [o for o in CORS_ORIGINS if not _is_local(o)]
    if public:
        raise RuntimeError(
            "FSOS_DEV_LOGIN=true accepts an email header instead of a real login, so it must "
            f"never run anywhere reachable. FSOS_CORS_ORIGINS includes {', '.join(public)}. "
            "Turn off FSOS_DEV_LOGIN, or keep the origins to localhost while developing."
        )
