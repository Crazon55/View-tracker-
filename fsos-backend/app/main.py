"""FSOS API — serves the FSOS frontend from the FSOS Supabase project.

Kept separate from the snoboard backend: that one still serves the live snoboard app
from the old database, and nothing here should be able to disturb it.
"""
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .auth import Caller, current_caller
from .config import CORS_ORIGINS, DEV_LOGIN, SUPABASE_URL
from .routers import collab, distribution, ideas, news, people, performance, production, settings, tools, workspace

app = FastAPI(title="FSOS API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for _r in (
    people.router, people.roles_router,
    workspace.router,
    ideas.router, ideas.versions_router, ideas.batches_router, ideas.categories_router,
    production.router,
    distribution.router,
    performance.router,
    collab.router, collab.notifications_router,
    settings.router, settings.settings_router,
    tools.router, tools.growth_router,
    news.router,
):
    app.include_router(_r)


@app.get("/api/health")
async def health():
    """Liveness plus a real database round-trip."""
    rows = await db.select("people", {"select": "id", "limit": 1})
    return {
        "ok": True,
        "project": SUPABASE_URL.split("//")[-1].split(".")[0],
        "database": "reachable" if rows is not None else "empty",
        "devLogin": DEV_LOGIN,
    }


@app.get("/api/me")
async def me(caller: Caller = Depends(current_caller)):
    """The signed-in person, their roles and their effective access."""
    return {
        "person": {k: caller.person.get(k) for k in ("id", "name", "email", "initials", "color", "roles", "streams", "active")},
        "access": caller.access,
        "pending": not caller.roles,
    }


@app.on_event("shutdown")
async def _shutdown():
    await db.aclose()
