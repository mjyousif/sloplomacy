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

# Package imports with local fallback
from api import admin, games, history, orders, sandbox, turns, websocket
from api.sandbox import close_private_sandbox, open_private_sandbox
from api.turns import _execute_adjudication, tick_timer, timer_players
from domain.models import FIRST_YEAR, PHASES_BY_SEASON
from engine.order_utils import (
    build_slot_power,
    create_default_orders,
    everyone_is_ready,
    get_required_finalizing_powers,
    put_into_civil_disorder,
    refresh_diagnostics_and_simulation,
    reject_stale_turn,
    reset_foreign_orders,
    resolve_static_path,
    validate_order_references,
)
from engine.phase_timer import start_phase_clock
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from scenarios.presets import (
    SCENARIO_IDS,
    build_scenario,
    seed_initial_multiplayer_lobbies,
)
from security.secrecy import (
    caller_holds_seat,
    reject_on_multiplayer_match,
    require_own_seat,
    sanitize_game_state_for_viewer,
    verify_admin_access,
    verify_power_authorization,
    viewer_power_for,
)
from storage.store import (
    DEFAULT_GAME_ID,
    GAME_HISTORY,
    GAME_PASSCODES,
    GAME_SUMMARIES,
    GAMES,
    HISTORY_UNSAVED,
    MAX_ACTIVE_GAMES,
    PRIVATE_SANDBOXES,
    SANDBOX_CHECKPOINTS,
    SAVES_RUNNING,
    UNSAVED_GAMES,
    cache_loaded_game,
    check_game_capacity,
    evict_game,
    is_multiplayer_match,
    load_saved_game,
    persist_game,
    resolve_game,
    sync_summary,
)
from storage.supabase import (
    delete_game_from_db,
    is_persistence_enabled,
    load_all_summaries_from_db,
    load_game_from_db,
    save_game_to_db,
)
from ws.connection_manager import (
    broadcast_game_update,
    broadcast_lobby_update,
    manager,
)

logger = logging.getLogger("diplomacy.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if is_persistence_enabled():
        logger.info("Supabase database persistence enabled. Synchronizing active games...")
        try:
            summaries = await load_all_summaries_from_db()
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
app.include_router(games.router)
app.include_router(orders.router)
app.include_router(turns.router)
app.include_router(sandbox.router)
app.include_router(admin.router)
app.include_router(history.router)
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


__all__ = [
    "app",
    "CachedStaticFiles",
    "FIRST_YEAR",
    "PHASES_BY_SEASON",
    "SCENARIO_IDS",
    "build_scenario",
    "seed_initial_multiplayer_lobbies",
    "DEFAULT_GAME_ID",
    "MAX_ACTIVE_GAMES",
    "GAMES",
    "GAME_HISTORY",
    "GAME_PASSCODES",
    "GAME_SUMMARIES",
    "HISTORY_UNSAVED",
    "PRIVATE_SANDBOXES",
    "SANDBOX_CHECKPOINTS",
    "SAVES_RUNNING",
    "UNSAVED_GAMES",
    "cache_loaded_game",
    "check_game_capacity",
    "evict_game",
    "is_multiplayer_match",
    "load_saved_game",
    "persist_game",
    "resolve_game",
    "sync_summary",
    "delete_game_from_db",
    "is_persistence_enabled",
    "load_all_summaries_from_db",
    "load_game_from_db",
    "save_game_to_db",
    "broadcast_game_update",
    "broadcast_lobby_update",
    "manager",
    "close_private_sandbox",
    "open_private_sandbox",
    "_execute_adjudication",
    "tick_timer",
    "timer_players",
    "build_slot_power",
    "create_default_orders",
    "everyone_is_ready",
    "get_required_finalizing_powers",
    "put_into_civil_disorder",
    "refresh_diagnostics_and_simulation",
    "reject_stale_turn",
    "reset_foreign_orders",
    "resolve_static_path",
    "validate_order_references",
    "start_phase_clock",
    "caller_holds_seat",
    "reject_on_multiplayer_match",
    "require_own_seat",
    "sanitize_game_state_for_viewer",
    "verify_admin_access",
    "verify_power_authorization",
    "viewer_power_for",
]
