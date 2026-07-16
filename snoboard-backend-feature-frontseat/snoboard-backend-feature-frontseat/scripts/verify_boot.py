#!/usr/bin/env python3
"""Smoke test: app must import without DATABASE_URL (no crash-loop on deploy).

Run from snoboard-backend-feature-frontseat/snoboard-backend-feature-frontseat:
  python scripts/verify_boot.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Strip DB env so import-time code cannot rely on a live Postgres DSN.
for key in list(os.environ):
    if key in {
        "DATABASE_URL",
        "SUPABASE_DB_URL",
        "POSTGRES_URL",
        "DIRECT_URL",
        "SUPABASE_DB_PASSWORD",
        "DB_PASSWORD",
        "POSTGRES_PASSWORD",
    }:
        os.environ.pop(key, None)

try:
    from app.main import app  # noqa: F401
except Exception as exc:
    print(f"verify_boot FAILED: {exc}", file=sys.stderr)
    raise SystemExit(1) from exc

print("verify_boot OK: app.main imported without DATABASE_URL")
