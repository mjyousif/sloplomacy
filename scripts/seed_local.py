#!/usr/bin/env python3
"""Seed local backend memory or Supabase with stress/repro game boards.

Examples:
    # Seed the 75-unit "all pieces" board into a running local backend & benchmark POST /api/order
    python scripts/seed_local.py --benchmark

    # Seed into Supabase directly (reads SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY from env or .env)
    python scripts/seed_local.py --target supabase --game-id solo_all_pieces

    # Seed any built-in scenario preset (e.g., 1 turn away from victory for Game Over / War Ledger)
    python scripts/seed_local.py --preset one_turn_from_win

    # Seed into Supabase directly (reads SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY from env or .env)
    python scripts/seed_local.py --target supabase --preset one_turn_from_win --game-id solo_endgame

    # Run only the in-process engine benchmark without a running server
    python scripts/seed_local.py --target none --benchmark
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from domain.board import Power, UnitType  # noqa: E402
from domain.game_state import GameState, MultiplayerGameSummary  # noqa: E402
from domain.orders import Order, OrderType  # noqa: E402
from engine.order_utils import (  # noqa: E402
    adjudicate_turn,
    compute_unit_options,
    create_default_orders,
    refresh_diagnostics_and_simulation,
    validate_orders,
)
from scenarios.presets import (  # noqa: E402
    SCENARIO_IDS,
    build_all_pieces_units,
    build_scenario,
    build_scenario_history,
)
from storage import supabase  # noqa: E402

POWERS = list(Power)


def _load_dotenv_if_present() -> None:
    """Populate os.environ from repo .env / backend/.env without overwriting existing vars."""
    for env_path in (REPO_ROOT / ".env", BACKEND_DIR / ".env"):
        if not env_path.is_file():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val


def build_game_state(preset: str, game_id: str) -> GameState:
    """Construct the GameState for the requested preset."""
    if preset == "all_pieces":
        state = build_scenario("standard_1901", game_id=game_id)
        units = build_all_pieces_units()
        state.units = units
        state.orders = create_default_orders(units, state.phase)
        state.scenario_id = "all_pieces"
        refresh_diagnostics_and_simulation(state)
        return state

    if preset not in SCENARIO_IDS:
        available = ", ".join(["all_pieces", *sorted(SCENARIO_IDS)])
        raise ValueError(f"Unknown preset '{preset}'. Available: {available}")

    return build_scenario(preset, game_id=game_id)


def _dev_auth_headers(user_id: str, email: str) -> dict[str, str]:
    header = (
        base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode())
        .rstrip(b"=")
        .decode()
    )
    payload = (
        base64.urlsafe_b64encode(json.dumps({"sub": user_id, "email": email, "exp": int(time.time()) + 3600}).encode())
        .rstrip(b"=")
        .decode()
    )
    return {"Authorization": f"Bearer {header}.{payload}."}


def _seed_one_turn_from_win_lobby(client: httpx.Client, base: str, state: GameState) -> str:
    """Create a public lobby match 1 turn from victory with pre-resolved turn history."""
    host_headers = _dev_auth_headers("bot_sultan", "sultan@diplomacy.local")
    create_resp = client.post(
        f"{base}/api/games",
        json={
            "name": "Final Push to 18 SCs (1 Turn from Victory)",
            "creator_power": "TURKEY",
            "user_id": "bot_sultan",
            "email": "sultan@diplomacy.local",
            "display_name": "Sultan Mehmed",
        },
        headers=host_headers,
    )
    if create_resp.status_code != 200:
        raise RuntimeError(
            f"POST /api/games failed ({create_resp.status_code}): {create_resp.text}"
        )
    mp_gid = create_resp.json()["game_id"]

    for snap in build_scenario_history("one_turn_from_win", mp_gid):
        for ord_obj in snap.orders.values():
            if not ord_obj.is_explicit:
                continue
            ord_resp = client.post(
                f"{base}/api/order",
                params={"game_id": mp_gid},
                json={"order": ord_obj.model_dump(mode="json")},
                headers=host_headers,
            )
            if ord_resp.status_code != 200:
                raise RuntimeError(
                    f"POST /api/order failed ({ord_resp.status_code}): {ord_resp.text}"
                )
        adj_resp = client.post(
            f"{base}/api/adjudicate",
            params={"game_id": mp_gid},
            headers=host_headers,
        )
        if adj_resp.status_code != 200:
            raise RuntimeError(
                f"POST /api/adjudicate failed ({adj_resp.status_code}): {adj_resp.text}"
            )

    turn_resp = client.post(
        f"{base}/api/admin/set-turn",
        params={"game_id": mp_gid},
        json={"season": state.season, "year": state.year, "phase": state.phase},
        headers=host_headers,
    )
    if turn_resp.status_code != 200:
        raise RuntimeError(
            f"POST /api/admin/set-turn failed ({turn_resp.status_code}): {turn_resp.text}"
        )
    turn_state = turn_resp.json()

    edit_resp = client.post(
        f"{base}/api/admin/board-edit",
        params={"game_id": mp_gid},
        json={
            "expected_revision": turn_state["board_revision"],
            "expected_season": turn_state["season"],
            "expected_year": turn_state["year"],
            "expected_phase": turn_state["phase"],
            "units": [u.model_dump(mode="json") for u in state.units],
            "ownership": {k: v.value for k, v in state.ownership.items()},
            "orders": {k: v.model_dump(mode="json") for k, v in state.orders.items()},
            "summary_lines": [
                "Seeded 17-SC endgame board via scripts/seed_local.py (one_turn_from_win)"
            ],
        },
        headers=host_headers,
    )
    if edit_resp.status_code != 200:
        raise RuntimeError(
            f"POST /api/admin/board-edit failed ({edit_resp.status_code}): {edit_resp.text}"
        )

    fin_resp = client.post(
        f"{base}/api/finalize",
        params={"game_id": mp_gid},
        json={"power": "TURKEY", "force": True},
        headers=host_headers,
    )
    if fin_resp.status_code != 200:
        raise RuntimeError(f"POST /api/finalize failed ({fin_resp.status_code}): {fin_resp.text}")

    return mp_gid


def seed_api(base_url: str, game_id: str, preset: str, state: GameState) -> None:
    """Seed the game into a running local backend via /api/test/seed (+ /api/admin/board-edit)."""
    base = base_url.rstrip("/")
    scenario_for_seed = "standard_1901" if preset == "all_pieces" else preset

    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            f"{base}/api/test/seed",
            json={"scenario_id": scenario_for_seed, "game_id": game_id},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"POST /api/test/seed failed ({resp.status_code}): {resp.text}")
        seeded = resp.json()

        if preset == "all_pieces":
            edit_payload = {
                "expected_revision": seeded["board_revision"],
                "expected_season": seeded["season"],
                "expected_year": seeded["year"],
                "expected_phase": seeded["phase"],
                "units": [u.model_dump(mode="json") for u in state.units],
                "ownership": {k: v.value for k, v in state.ownership.items()},
                "orders": {k: v.model_dump(mode="json") for k, v in state.orders.items()},
                "summary_lines": [
                    f"Seeded {len(state.units)} units via scripts/seed_local.py (all_pieces)"
                ],
            }
            edit_resp = client.post(
                f"{base}/api/admin/board-edit",
                params={"game_id": game_id},
                json=edit_payload,
            )
            if edit_resp.status_code != 200:
                raise RuntimeError(
                    f"POST /api/admin/board-edit failed ({edit_resp.status_code}): {edit_resp.text}"
                )

        if preset == "one_turn_from_win":
            if game_id != "proto_1901":
                proto_resp = client.post(
                    f"{base}/api/test/seed",
                    json={"scenario_id": "one_turn_from_win", "game_id": "proto_1901"},
                )
                if proto_resp.status_code != 200:
                    raise RuntimeError(
                        f"POST /api/test/seed proto_1901 failed ({proto_resp.status_code}): {proto_resp.text}"
                    )
            mp_gid = _seed_one_turn_from_win_lobby(client, base, state)
            print(
                f"[api] Seeded public lobby '{mp_gid}' ('Final Push to 18 SCs (1 Turn from Victory)' — claim FRANCE & Finalize to win)"
            )

    print(f"[api] Seeded '{preset}' ({len(state.units)} units) as game_id='{game_id}' at {base}")


async def seed_supabase(game_id: str, preset: str, state: GameState) -> None:
    """Seed the game directly into Supabase multiplayer_games."""
    if not supabase.is_persistence_enabled():
        raise RuntimeError(
            "Supabase persistence is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
        )
    summary = MultiplayerGameSummary(
        game_id=game_id,
        name=f"Local Seed ({preset})",
        status="active",
        phase=state.phase,
        season=state.season,
        year=state.year,
        created_at=datetime.now(timezone.utc).isoformat(),
        is_sandbox=not game_id.startswith("mp_"),
        is_private=False,
    )
    ok = await supabase.save_game_to_db(
        game_id=game_id,
        state=state,
        summary=summary,
        history=build_scenario_history(preset, game_id),
    )
    if not ok:
        raise RuntimeError(f"Failed to save game_id='{game_id}' to Supabase.")
    print(f"[supabase] Seeded '{preset}' ({len(state.units)} units) as room_code='{game_id}'")


def run_inprocess_benchmark(state: GameState) -> None:
    """Time refresh_diagnostics_and_simulation and its substeps locally."""
    t0 = time.perf_counter()
    refresh_diagnostics_and_simulation(state)
    t1 = time.perf_counter()

    t_val0 = time.perf_counter()
    validate_orders(
        state.units,
        state.orders,
        include_unassigned_warnings=False,
        phase=state.phase,
        builds=state.builds,
        retreats=state.retreats,
    )
    t_val1 = time.perf_counter()

    t_adj0 = time.perf_counter()
    adjudicate_turn(
        state.units,
        state.orders,
        state.ownership,
        state.season,
        state.year,
        state.phase,
        retreats=state.retreats,
    )
    t_adj1 = time.perf_counter()

    t_opt0 = time.perf_counter()
    compute_unit_options(
        state.units,
        state.orders,
        state.phase,
        retreats=state.retreats,
    )
    t_opt1 = time.perf_counter()

    print("\n[benchmark:in-process]")
    print(f"  units: {len(state.units)}")
    print(f"  refresh_diagnostics_and_simulation: {(t1 - t0) * 1000:.2f} ms")
    print(f"    validate_orders:                  {(t_val1 - t_val0) * 1000:.2f} ms")
    print(f"    adjudicate_turn:                  {(t_adj1 - t_adj0) * 1000:.2f} ms")
    print(f"    compute_unit_options:             {(t_opt1 - t_opt0) * 1000:.2f} ms")


def run_api_benchmark(base_url: str, game_id: str, state: GameState, runs: int) -> None:
    """Send POST /api/order requests to the running backend and measure round-trip time."""
    unit = next((u for u in state.units if u.unit_type == UnitType.FLEET), state.units[0])
    opts = state.unit_options.get(unit.id)
    target = opts.direct_moves[0] if opts and opts.direct_moves else None
    order = Order(
        unit_id=unit.id,
        power=unit.power,
        unit_type=unit.unit_type,
        origin=unit.province,
        origin_coast=unit.coast,
        order_type=OrderType.MOVE if target else OrderType.HOLD,
        target=target,
        is_explicit=True,
    )
    payload = {
        "order": order.model_dump(mode="json"),
        "turn": f"{state.season} {state.year} {state.phase}",
    }

    base = base_url.rstrip("/")
    print(f"\n[benchmark:api] POST {base}/api/order?game_id={game_id} ({runs} run(s))")
    with httpx.Client(timeout=30.0) as client:
        for i in range(runs):
            t0 = time.perf_counter()
            resp = client.post(
                f"{base}/api/order",
                params={"game_id": game_id},
                json=payload,
            )
            dt_ms = (time.perf_counter() - t0) * 1000
            size_kb = len(resp.content) / 1024
            print(f"  run {i + 1}: HTTP {resp.status_code} | {dt_ms:.1f} ms | {size_kb:.1f} KB")
            if resp.status_code != 200:
                print(f"    body: {json.dumps(resp.text)[:200]}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Seed local backend or Supabase with stress/repro Diplomacy boards."
    )
    parser.add_argument(
        "--preset",
        default="all_pieces",
        help="Board preset: 'all_pieces' (75 units, default), 'one_turn_from_win', or any SCENARIO_IDS key.",
    )
    parser.add_argument(
        "--game-id",
        default=None,
        help="Target game_id / room_code (defaults to 'local_all_pieces', 'proto_1901' for one_turn_from_win, or 'local_<preset>').",
    )
    parser.add_argument(
        "--target",
        choices=["api", "supabase", "both", "none"],
        default="api",
        help="Where to seed the game (default: api).",
    )
    parser.add_argument(
        "--api-url",
        default="http://127.0.0.1:8000",
        help="Running backend base URL (default: http://127.0.0.1:8000).",
    )
    parser.add_argument(
        "--benchmark",
        action="store_true",
        help="Run in-process and/or API latency benchmarks after building/seeding.",
    )
    parser.add_argument(
        "--runs",
        type=int,
        default=3,
        help="Number of POST /api/order calls for --benchmark (default: 3).",
    )
    args = parser.parse_args()
    if args.game_id is None:
        if args.preset == "all_pieces":
            args.game_id = "local_all_pieces"
        elif args.preset == "one_turn_from_win":
            args.game_id = "proto_1901"
        else:
            args.game_id = f"local_{args.preset}"

    _load_dotenv_if_present()
    state = build_game_state(args.preset, args.game_id)

    if args.target in ("api", "both"):
        seed_api(args.api_url, args.game_id, args.preset, state)
    if args.target in ("supabase", "both"):
        asyncio.run(seed_supabase(args.game_id, args.preset, state))

    if args.benchmark:
        run_inprocess_benchmark(state)
        if args.target in ("api", "both"):
            run_api_benchmark(args.api_url, args.game_id, state, args.runs)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
