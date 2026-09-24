"""What counts as a deliverable link.

A version's deliverable is the thing a reviewer opens, and it has to be a working file
in Canva or Drive. The field accepted any text at all, so a typo, a half-pasted URL or
somebody's personal blog went in and nobody found out until the reviewer clicked it and
got nowhere — which is a round trip of a day on a thing due today.

The check is on the host, deliberately. Canva and Drive both mint URLs in several
shapes and any attempt to match the path would go stale the next time either of them
changes a route.

The frontend has the same rule in lib/links.js for immediate feedback; this is the one
that decides, because the API is reachable without the UI.
"""
from urllib.parse import urlparse

from fastapi import HTTPException

# Suffix match, so app.canva.com and www.canva.com pass with the bare domains.
ALLOWED_HOSTS = (
    "canva.com",
    "canva.site",
    "drive.google.com",
    "docs.google.com",
)

LABEL = "a Canva or Google Drive link"


def host_of(url: str) -> str | None:
    """The hostname, tolerating a URL pasted without its scheme."""
    raw = (url or "").strip()
    if not raw:
        return None
    if "://" not in raw:
        raw = f"https://{raw}"
    try:
        host = (urlparse(raw).hostname or "").lower()
    except ValueError:
        return None
    return host or None


def is_allowed(url: str) -> bool:
    host = host_of(url)
    if not host:
        return False
    return any(host == h or host.endswith(f".{h}") for h in ALLOWED_HOSTS)


def require_asset_link(url: str) -> str:
    """Return the url, or refuse it with a message naming what was actually pasted."""
    cleaned = (url or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail=f"Paste {LABEL}.")
    if not is_allowed(cleaned):
        host = host_of(cleaned) or cleaned[:40]
        raise HTTPException(
            status_code=400,
            detail=f"{host} is not Canva or Drive. The reviewer needs to open the file — paste {LABEL}.",
        )
    return cleaned
