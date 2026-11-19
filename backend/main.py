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

from api import (
    account,
    admin,
    admin_units,
    games,
    history,
    lobby,
    orders,
    press,
    sandbox,
    seats,
    turns,
    websocket,
)
from engine.order_utils import resolve_static_path
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from scenarios.presets import seed_dev_games
from security.secrecy import saved_sandbox_guard
from storage import supabase
from storage.store import (
    GAME_SUMMARIES,
    PROFILE_NAMES,
    UNSAVED_GAMES,
    hydrate_summary_profiles,
    persist_game,
)
from telemetry import TelemetryMiddleware

logger = logging.getLogger("diplomacy.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if supabase.is_persistence_enabled():
        logger.info("Supabase database persistence enabled. Synchronizing active games...")
        try:
            profile_names = await supabase.load_profile_names_from_db()
            PROFILE_NAMES.update(profile_names)
            summaries = await supabase.load_all_summaries_from_db()
            for gid, summary in summaries.items():
                if gid not in GAME_SUMMARIES:
                    hydrate_summary_profiles(summary)
                    GAME_SUMMARIES[gid] = summary
            logger.info("Loaded %d game summaries from Supabase on startup.", len(summaries))
        except Exception as ex:
            logger.warning("Could not synchronize games on startup: %s", ex)
    if (
        os.getenv("ENVIRONMENT", "").lower() == "development"
        and os.getenv("SEED_DEV_GAMES", "1") != "0"
    ):
        await seed_dev_games()
    try:
        yield
    finally:
        for gid in list(UNSAVED_GAMES):
            try:
                await persist_game(gid)
            except Exception as ex:
                logger.warning("Could not flush unsaved game '%s' on shutdown: %s", gid, ex)
        await supabase.close_http_client()


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


_SECURITY_HEADERS: tuple[tuple[bytes, bytes], ...] = (
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
    (b"permissions-policy", b"geolocation=(), camera=(), microphone=()"),
)


class SecurityHeadersMiddleware:
    """Defense-in-depth HTTP security headers (pure ASGI so BackgroundTasks don't block keep-alive)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(_SECURITY_HEADERS)
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)


app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(TelemetryMiddleware)


# Include modular domain routers
# A saved sandbox is its owner's alone, on every HTTP route. The game socket checks it itself.
# `lobby` comes before `games` so /api/games/browse and /mine are not read as a game id.
for http_router in (
    account,
    lobby,
    games,
    seats,
    orders,
    turns,
    sandbox,
    admin,
    admin_units,
    history,
    press,
):
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
