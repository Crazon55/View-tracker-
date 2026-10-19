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

# Apify, for scraping the views/likes of posts that are live. The token is a secret and
# lives only in .env. Unset, the "Scrape views" button reports that it isn't set up
# rather than failing obscurely. The actor ids are Apify's own Instagram Reel Scraper
# and Instagram Post Scraper; override them if the team moves to a different actor.
APIFY_TOKEN = (os.getenv("FSOS_APIFY_TOKEN") or "").strip()
APIFY_REEL_ACTOR = (os.getenv("FSOS_APIFY_REEL_ACTOR") or "xMc5Ga1oCONPmWJIa").strip()
APIFY_POST_ACTOR = (os.getenv("FSOS_APIFY_POST_ACTOR") or "nH2AHrwxeTRJoN5hX").strip()

# Secret in the URL of the 6-Day calendar feed (GET /api/calendar/six-day.ics?token=…). A calendar
# app cannot sign in, so this is its only guard. Unset disables the route.
CALENDAR_TOKEN = (os.getenv("FSOS_CALENDAR_TOKEN") or "").strip()

# Email for the 6-Day invites (POST /api/calendar/send-six-day-invite). Plain SMTP, so it works with a
# Google Workspace account (smtp.gmail.com + an app password) or any mail service. Secrets live only in
# .env. Without these set, the route reports that email is not set up instead of failing.
SMTP_HOST = (os.getenv("FSOS_SMTP_HOST") or "").strip()
SMTP_PORT = int(os.getenv("FSOS_SMTP_PORT") or 587)
SMTP_USER = (os.getenv("FSOS_SMTP_USER") or "").strip()
SMTP_PASSWORD = os.getenv("FSOS_SMTP_PASSWORD") or ""
SMTP_FROM = (os.getenv("FSOS_SMTP_FROM") or SMTP_USER).strip()
SIX_DAY_INVITE_TO = (os.getenv("FSOS_SIX_DAY_INVITE_TO") or "").strip()
APP_URL = (os.getenv("FSOS_APP_URL") or "https://thefrontseatmedia.com").rstrip("/")

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
