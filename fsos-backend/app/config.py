"""Settings for the FSOS API, read from fsos-backend/.env (git-ignored)."""
import os
from pathlib import Path

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

if not SUPABASE_URL or not SERVICE_KEY:
    raise RuntimeError("FSOS_SUPABASE_URL and FSOS_SUPABASE_SERVICE_KEY must be set in fsos-backend/.env")
