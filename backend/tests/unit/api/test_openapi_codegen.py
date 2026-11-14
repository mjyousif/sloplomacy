"""Verify OpenAPI contract completeness and generated frontend API artifacts."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

from fastapi.routing import APIRoute


def _load_generator() -> ModuleType:
    repo_root = Path(__file__).resolve().parents[4]
    script = repo_root / "scripts" / "generate_api.py"
    spec = importlib.util.spec_from_file_location("scripts_generate_api", script)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_every_api_route_declares_response_model() -> None:
    """Every /api/ HTTP route must declare a typed response_model for OpenAPI codegen."""
    generator = _load_generator()
    missing = [
        f"{sorted(route.methods)} {route.path}"
        for route in generator.iter_app_routes()
        if isinstance(route, APIRoute)
        and route.path.startswith("/api/")
        and route.response_model is None
    ]
    assert missing == [], f"API routes missing response_model: {missing}"


def test_generated_frontend_api_files_are_up_to_date() -> None:
    """Generated schema.gen.ts and sdk.gen.ts must match FastAPI's OpenAPI spec."""
    generator = _load_generator()
    hint = "Run `python scripts/generate_api.py`."
    actual_schema = generator.SCHEMA_PATH.read_text(encoding="utf-8")
    actual_sdk = generator.SDK_PATH.read_text(encoding="utf-8")
    assert actual_schema == generator.render_schema_ts(), f"schema.gen.ts out of date. {hint}"
    assert actual_sdk == generator.render_sdk_ts(), f"sdk.gen.ts out of date. {hint}"
