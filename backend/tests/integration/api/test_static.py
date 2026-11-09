"""Serving the built frontend: path safety, gzip and cache headers."""

import pytest
from engine.order_utils import (
    resolve_static_path,
)
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


@pytest.mark.parametrize(
    "requested",
    [
        "../secret.txt",
        "..%2fsecret.txt".replace("%2f", "/"),
        "assets/../../secret.txt",
        "../static-evil/index.html",
        "/etc/passwd",
        "//etc/passwd",
        "bad\x00name",
        "",
        "assets",
        "missing.js",
    ],
)
def test_static_lookup_never_leaves_the_static_folder(tmp_path, requested):
    root = tmp_path / "static"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text("app")
    (tmp_path / "secret.txt").write_text("secret")
    (tmp_path / "static-evil").mkdir()
    (tmp_path / "static-evil" / "index.html").write_text("evil")

    assert resolve_static_path(str(root), requested) is None


def test_static_lookup_does_not_follow_links_out_of_the_folder(tmp_path):
    root = tmp_path / "static"
    root.mkdir()
    (tmp_path / "secret.txt").write_text("secret")
    (root / "link.txt").symlink_to(tmp_path / "secret.txt")

    assert resolve_static_path(str(root), "link.txt") is None


def test_static_lookup_finds_real_files(tmp_path):
    root = tmp_path / "static"
    (root / "assets").mkdir(parents=True)
    (root / "favicon.svg").write_text("icon")
    (root / "assets" / "app.js").write_text("js")

    assert resolve_static_path(str(root), "favicon.svg") == str((root / "favicon.svg").resolve())
    assert resolve_static_path(str(root), "assets/app.js") == str(
        (root / "assets" / "app.js").resolve()
    )


def test_gzip_compression_and_static_caching(tmp_path, monkeypatch):
    """
    Verify GZipMiddleware compresses large JSON responses to conserve Cloud Run egress,
    and static asset handlers set immutable Cache-Control headers.
    """
    # 1. GZip compression on large responses (> 1000 bytes)
    res_gzip = client.get("/api/game?game_id=proto_1901", headers={"Accept-Encoding": "gzip"})
    assert res_gzip.status_code == 200
    assert res_gzip.headers.get("content-encoding") == "gzip"

    res_raw = client.get("/api/game?game_id=proto_1901", headers={"Accept-Encoding": "identity"})
    assert res_raw.status_code == 200
    assert res_raw.headers.get("content-encoding") != "gzip"

    # 2. Cached static files
    from fastapi import FastAPI
    from main import CachedStaticFiles

    assets_dir = tmp_path / "assets"
    assets_dir.mkdir()
    asset_file = assets_dir / "bundle-test.js"
    asset_file.write_text("console.log('test');")

    static_app = FastAPI()
    static_app.mount("/assets", CachedStaticFiles(directory=str(assets_dir)), name="assets")
    static_client = TestClient(static_app)
    res_asset = static_client.get("/assets/bundle-test.js")
    assert res_asset.status_code == 200
    assert "public" in res_asset.headers.get("cache-control", "")
    assert "immutable" in res_asset.headers.get("cache-control", "")
