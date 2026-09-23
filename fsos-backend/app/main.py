"""FSOS API — serves the FSOS frontend from the FSOS Supabase project.

Kept separate from the snoboard backend: that one still serves the live snoboard app
from the old database, and nothing here should be able to disturb it.
"""
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .auth import Caller, current_caller
from .config import CORS_ORIGINS, DEV_LOGIN, SUPABASE_URL
from .routers import people

app = FastAPI(title="FSOS API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(people.router)
app.include_router(people.roles_router)


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
