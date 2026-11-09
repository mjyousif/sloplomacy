"""FastAPI Tactical Diplomacy Adjudication & Multiplayer Room Server."""

# ruff: noqa: E402

import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Ensure both repo root and backend directory are in sys.path
_BACKEND_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _BACKEND_DIR.parent
for _p in (str(_BACKEND_DIR), str(_REPO_ROOT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from api import admin, admin_units, games, history, orders, sandbox, seats, turns, websocket
from engine.order_utils import resolve_static_path
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from security.secrecy import saved_sandbox_guard
from storage import supabase
from storage.store import GAME_SUMMARIES

logger = logging.getLogger("diplomacy.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if supabase.is_persistence_enabled():
        logger.info("Supabase database persistence enabled. Synchronizing active games...")
        try:
            summaries = await supabase.load_all_summaries_from_db()
            for gid, summary in summaries.items():
                if gid not in GAME_SUMMARIES:
                    GAME_SUMMARIES[gid] = summary
            logger.info("Loaded %d game summaries from Supabase on startup.", len(summaries))
        except Exception as ex:
            logger.warning("Could not synchronize games on startup: %s", ex)
    yield


app = FastAPI(
    title="Sloplomacy Adjudication & Game Server",
    description="Full DATC diplomacy adjudication engine, sandbox war room, and multiplayer game server.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Middleware
is_production = os.getenv("ENVIRONMENT", "").lower() == "production"
if is_production:
    allowed_origin = os.getenv("FRONTEND_ORIGIN")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[allowed_origin] if allowed_origin else [],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Defense-in-depth HTTP security headers."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
    return response


# Include modular domain routers
# A saved sandbox is its owner's alone, on every HTTP route. The game socket checks it itself.
for http_router in (games, seats, orders, turns, sandbox, admin, admin_units, history):
    app.include_router(http_router.router, dependencies=[Depends(saved_sandbox_guard)])
app.include_router(websocket.router)


class CachedStaticFiles(StaticFiles):
    """Static asset file handler with Cache-Control headers for content-hashed bundles."""

    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


# Static SPA mounting
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(STATIC_DIR):
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", CachedStaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if (
            full_path.startswith("api/")
            or full_path.startswith("ws/")
            or full_path in ("docs", "openapi.json", "redoc")
        ):
            raise HTTPException(status_code=404, detail="Not Found")
        file_path = resolve_static_path(STATIC_DIR, full_path)
        if file_path:
            return FileResponse(file_path, headers={"Cache-Control": "public, max-age=86400"})
        index_file = os.path.join(STATIC_DIR, "index.html")
        if os.path.isfile(index_file):
            return FileResponse(index_file, headers={"Cache-Control": "no-cache, must-revalidate"})
        raise HTTPException(status_code=404, detail="Frontend index.html not found")
