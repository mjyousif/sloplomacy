#!/usr/bin/env python3
"""Seed local backend memory or Supabase with stress/repro game boards.

Examples:
    # Seed the 75-unit "all pieces" board into a running local backend & benchmark POST /api/order
    python scripts/seed_local.py --benchmark

    # Seed into Supabase directly (reads SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY from env or .env)
    python scripts/seed_local.py --target supabase --game-id solo_all_pieces

    # Seed any built-in scenario preset
    python scripts/seed_local.py --preset spring_retreats_demo --game-id local_retreats

    # Run only the in-process engine benchmark without a running server
    python scripts/seed_local.py --target none --benchmark
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from domain.board import Power, ProvinceType, Unit, UnitType  # noqa: E402
from domain.game_state import GameState, MultiplayerGameSummary  # noqa: E402
from domain.orders import Order, OrderType  # noqa: E402
from engine.order_utils import (  # noqa: E402
    adjudicate_turn,
    compute_unit_options,
    create_default_orders,
    refresh_diagnostics_and_simulation,
    validate_orders,
)
from engine.topology.provinces import PROVINCES  # noqa: E402
from scenarios.presets import SCENARIO_IDS, build_scenario  # noqa: E402
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


def build_all_pieces_units() -> list[Unit]:
    """Build 75 units (36 fleets, 39 armies) across all 75 passable provinces."""
    passable = [prov for prov in PROVINCES.values() if prov.type != ProvinceType.IMPASSABLE]
    seas = [p for p in passable if p.type == ProvinceType.SEA]
    coasts = [p for p in passable if p.type == ProvinceType.COAST]
    lands = [p for p in passable if p.type == ProvinceType.LAND]

    # Put fleets on all 19 sea zones + first 17 coastal provinces (36 fleets total),
    # and armies on the remaining coastal + inland provinces (39 armies total).
    fleet_provs = seas + coasts[:17]
    army_provs = coasts[17:] + lands

    units: list[Unit] = []
    idx = 0
    for prov in fleet_provs:
        power = POWERS[idx % len(POWERS)]
        coast = prov.coasts[0] if prov.coasts else None
        units.append(
            Unit(
                id=f"{power.value[:3]}_F_{prov.id}",
                power=power,
                unit_type=UnitType.FLEET,
                province=prov.id,
                coast=coast,
            )
        )
        idx += 1

    for prov in army_provs:
        power = POWERS[idx % len(POWERS)]
        units.append(
            Unit(
                id=f"{power.value[:3]}_A_{prov.id}",
                power=power,
                unit_type=UnitType.ARMY,
                province=prov.id,
                coast=None,
            )
        )
        idx += 1

    return units


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
                "expected_revision": seeded["state_revision"],
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
        is_sandbox=True,
        is_private=False,
    )
    ok = await supabase.save_game_to_db(
        game_id=game_id,
        state=state,
        summary=summary,
        history=[],
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
        help="Board preset: 'all_pieces' (75 units, default) or any SCENARIO_IDS key.",
    )
    parser.add_argument(
        "--game-id",
        default="local_all_pieces",
        help="Target game_id / room_code (default: local_all_pieces).",
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
