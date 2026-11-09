"""
Integration tests for Docker container runtime parity & import isolation (Closes #129).

Ensures that:
1. No source module in backend/ uses `from backend...` or `import backend...`,
   which breaks in production where files are mounted directly at /app without an enclosing backend/ folder.
2. The full match lifecycle (create, join, order, finalize, leave, surrender, sandbox, admin)
   executes successfully when sys.modules and sys.path strictly enforce container-isolated resolution.
"""

import ast
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from main import app
from scenarios.presets import seed_initial_multiplayer_lobbies


@pytest.fixture(autouse=True)
def reset_lobbies():
    seed_initial_multiplayer_lobbies()


def test_no_stray_backend_package_imports_in_production_source():
    """
    Static AST scan: Asserts that no production file in backend/ imports from 'backend.*'.

    In Cloud Run / Docker (WORKDIR /app, COPY backend/ ./), files are located at /app/
    and there is no top-level 'backend' package in sys.path.
    Any `from backend.x import y` will raise ModuleNotFoundError in production.
    """
    backend_dir = Path(__file__).resolve().parents[2]
    violations = []

    for py_file in backend_dir.rglob("*.py"):
        # Exclude tests/ directory from production import checks
        if "tests" in py_file.parts:
            continue

        try:
            tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
        except SyntaxError:
            continue

        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                if node.module == "backend" or node.module.startswith("backend."):
                    violations.append(
                        f"{py_file.relative_to(backend_dir)}:{node.lineno}: from {node.module} import ..."
                    )
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name == "backend" or alias.name.startswith("backend."):
                        violations.append(
                            f"{py_file.relative_to(backend_dir)}:{node.lineno}: import {alias.name}"
                        )

    assert not violations, (
        f"Found {len(violations)} production source files importing from 'backend.*':\n"
        + "\n".join(violations)
        + "\nModules must use relative or domain-level imports (e.g. 'from api.turns import ...') "
        "because in Docker/Cloud Run code runs from /app where 'backend' does not exist in sys.path."
    )


def test_container_runtime_import_isolation_full_lifecycle():
    """
    Dynamic execution test: Exercises the full campaign lifecycle through TestClient
    with 'backend' stripped from sys.modules and repository roots excluded from sys.path.

    Specifically verifies that joining games (issue #129) and subsequent lifecycle actions
    do not trigger ModuleNotFoundError on lazy or function-level imports.
    """
    hidden_modules = {
        k: v for k, v in list(sys.modules.items()) if k == "backend" or k.startswith("backend.")
    }
    for k in hidden_modules:
        del sys.modules[k]

    orig_path = list(sys.path)
    sys.path = [
        p
        for p in sys.path
        if not p.endswith("restructure_codebase_files") and not p.endswith("sloplomacy")
    ]

    client = TestClient(app)

    try:
        # 1. Verify lobby browser is accessible
        games_res = client.get("/api/games")
        assert games_res.status_code == 200, f"GET /api/games failed: {games_res.text}"

        # 2. Create new multiplayer campaign
        create_res = client.post(
            "/api/games",
            json={
                "name": "Container Parity Campaign",
                "creator_power": "FRANCE",
                "creator_email": "creator@parity.test",
                "is_private": False,
            },
        )
        assert create_res.status_code == 200, f"Create game failed: {create_res.text}"
        data = create_res.json()
        game_id = data["game_id"]
        creator_id = data["participants"]["FRANCE"]["user_id"]

        # 3. Join campaign as Turkey (the exact flow that regressed in issue #129)
        join_res = client.post(
            f"/api/games/{game_id}/join",
            json={
                "power": "TURKEY",
                "user_id": "user_turkey_parity",
                "email": "turkey@parity.test",
                "display_name": "Gage",
            },
        )
        assert join_res.status_code == 200, f"Join game failed: {join_res.text}"
        join_data = join_res.json()
        assert "TURKEY" in join_data["summary"]["participants"]
        assert join_data["summary"]["participants"]["TURKEY"]["display_name"] == "Gage"

        # 4. Submit order for joined power
        game_state_res = client.get(f"/api/game?game_id={game_id}")
        assert game_state_res.status_code == 200
        turkey_units = [
            u for u in game_state_res.json()["state"]["units"] if u["power"] == "TURKEY"
        ]
        assert len(turkey_units) > 0
        u0 = turkey_units[0]

        order_res = client.post(
            f"/api/order?game_id={game_id}",
            json={
                "order": {
                    "unit_id": u0["id"],
                    "power": "TURKEY",
                    "unit_type": u0["unit_type"],
                    "origin": u0["province"],
                    "target": "BUL",
                    "order_type": "MOVE",
                }
            },
        )
        assert order_res.status_code == 200, f"Order submission failed: {order_res.text}"

        # 5. Finalize orders
        finalize_res = client.post(
            f"/api/finalize?game_id={game_id}",
            json={"power": "TURKEY", "finalized": True},
        )
        assert finalize_res.status_code == 200, f"Finalize failed: {finalize_res.text}"

        # 6. Leave campaign (exercises lazy adjudication & timer imports)
        leave_res = client.post(
            f"/api/games/{game_id}/leave",
            json={"user_id": "user_turkey_parity", "power": "TURKEY"},
        )
        assert leave_res.status_code == 200, f"Leave game failed: {leave_res.text}"

        # 7. Surrender power
        surrender_res = client.post(
            f"/api/games/{game_id}/surrender",
            json={"user_id": creator_id, "power": "FRANCE"},
        )
        assert surrender_res.status_code == 200, f"Surrender failed: {surrender_res.text}"

        # 8. Sandbox enter & exit
        sbx_enter = client.post("/api/sandbox/enter?game_id=proto_1901", json={"power": "FRANCE"})
        assert sbx_enter.status_code == 200, f"Sandbox enter failed: {sbx_enter.text}"
        sbx_exit = client.post("/api/sandbox/exit?game_id=proto_1901", json={"power": "FRANCE"})
        assert sbx_exit.status_code == 200, f"Sandbox exit failed: {sbx_exit.text}"

        # 9. Admin set turn
        admin_res = client.post(
            "/api/admin/set-turn?game_id=proto_1901",
            json={"year": 1902, "season": "Spring", "phase": "Movement"},
        )
        assert admin_res.status_code == 200, f"Admin set turn failed: {admin_res.text}"

        # Clean up proto_1901
        client.post(
            "/api/admin/set-turn?game_id=proto_1901",
            json={"year": 1901, "season": "Spring", "phase": "Movement"},
        )
    finally:
        sys.path = orig_path
        sys.modules.update(hidden_modules)
