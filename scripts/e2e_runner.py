#!/usr/bin/env python3
"""
Sloplomacy - LLM-Driven E2E Interactive & Visual Test Runner.

Orchestrates headless/headed Playwright test scenarios, captures visual screenshots
at each game step, collects runtime telemetry, and provides clean inspection artifacts
for LLM coding agents and human developers.
"""

import argparse
import json
import os
import platform
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"
BACKEND_DIR = ROOT_DIR / "backend"
ARTIFACTS_DIR = ROOT_DIR / "artifacts" / "e2e"

IS_WINDOWS = platform.system() == "Windows"
NPM_CMD = "npm.cmd" if IS_WINDOWS else "npm"
NPX_CMD = "npx.cmd" if IS_WINDOWS else "npx"

SCENARIO_MAP = {
    "movement": "e2e/movement_and_orders.spec.ts",
    "movement_and_orders": "e2e/movement_and_orders.spec.ts",
    "sandbox": "e2e/sandbox_isolation.spec.ts",
    "sandbox_isolation": "e2e/sandbox_isolation.spec.ts",
    "blunder": "e2e/blunder_sanity_modal.spec.ts",
    "blunder_sanity": "e2e/blunder_sanity_modal.spec.ts",
    "blunder_sanity_modal": "e2e/blunder_sanity_modal.spec.ts",
    "retreats": "e2e/retreats_dislodgement.spec.ts",
    "retreats_dislodgement": "e2e/retreats_dislodgement.spec.ts",
    "builds": "e2e/winter_builds.spec.ts",
    "winter_builds": "e2e/winter_builds.spec.ts",
    "mobile": "e2e/mobile_compact_hud.spec.ts",
    "mobile_compact_hud": "e2e/mobile_compact_hud.spec.ts",
}

SCENARIO_DESCRIPTIONS = {
    "movement": "Map reticle Move, Support vector, Hold toggle, adjudication, and Admin Console turn rollback.",
    "sandbox": "Lobby launch, Hypothetical Mode foreign pre-move isolation, and order retention check.",
    "blunder": "Tactical blunder diagnostics, illegal order detection, and pre-finalization sanity check modal.",
    "retreats": "Spring dislodgement detection, retreat destination validation, and retreat resolution.",
    "builds": "Winter adjustments, Army/Fleet builds, bicoastal STP/NC Fleet build, deficit disband, and advance to 1902.",
    "mobile": "Mobile phone viewport (390x844), CompactTopBar, order problem modal, 3-dots menu, and touch navigation.",
}


class Colors:
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BOLD = "\033[1m"
    RESET = "\033[0m"


def print_colored(text: str, color: str = ""):
    if sys.stdout.isatty():
        print(f"{color}{text}{Colors.RESET}")
    else:
        print(text)


def is_service_ready(url: str, timeout: float = 2.0) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.status in (200, 304, 404)
    except Exception:
        return False


def wait_for_service(url: str, name: str, max_wait: float = 25.0) -> bool:
    start_time = time.time()
    while time.time() - start_time < max_wait:
        if is_service_ready(url):
            return True
        time.sleep(0.5)
    return False


def list_scenarios():
    print_colored("\n=== Sloplomacy E2E Interactive Test Scenarios ===", Colors.CYAN + Colors.BOLD)
    print("Available scenarios for LLM agents & developers:\n")
    unique_scenarios = ["movement", "sandbox", "blunder", "retreats", "builds", "mobile"]
    for key in unique_scenarios:
        desc = SCENARIO_DESCRIPTIONS.get(key, "")
        spec = SCENARIO_MAP.get(key, "")
        print_colored(f"  * {key.ljust(12)} -> {desc}", Colors.GREEN)
        print(f"    Spec: frontend/{spec}\n")
    print("Usage:")
    print("  python scripts/e2e_runner.py run <scenario_name> [--headed]")
    print("  python scripts/e2e_runner.py run --all\n")


def print_scenario_artifacts(scenario_name: str):
    target_dir = ARTIFACTS_DIR / scenario_name
    summary_file = target_dir / "summary.json"

    if not target_dir.exists():
        return

    print_colored(f"\n--- Artifacts for [{scenario_name}] ---", Colors.CYAN + Colors.BOLD)

    if summary_file.exists():
        try:
            with open(summary_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            status = data.get("status", "UNKNOWN")
            status_color = Colors.GREEN if status == "PASSED" else Colors.RED
            print_colored(f"Status: {status}", status_color + Colors.BOLD)

            steps = data.get("steps", [])
            print(f"Captured {len(steps)} step screenshots:")
            for s in steps:
                s_name = s.get("name", "")
                s_path = s.get("screenshot", "")
                uri = Path(s_path).as_uri() if s_path else ""
                print(f"  Step {s.get('step')}: {s_name}")
                print(f"    -> {uri}")

            errs = data.get("consoleErrors", [])
            if errs:
                print_colored(f"\nBrowser Console Errors ({len(errs)}):", Colors.YELLOW)
                for err in errs:
                    print(f"  [ERROR] {err}")

            page_errs = data.get("pageErrors", [])
            if page_errs:
                print_colored(f"\nUncaught Page Runtime Errors ({len(page_errs)}):", Colors.RED)
                for perr in page_errs:
                    print(f"  [PAGEERROR] {perr}")
        except Exception as ex:
            print(f"Could not parse summary: {ex}")
    else:
        # List raw images
        pngs = sorted(target_dir.glob("*.png"))
        for png in pngs:
            print(f"  -> {png.as_uri()}")


def run_scenario(scenario_arg: str, headed: bool = False, base_url: str = "http://localhost:5173") -> int:
    backend_proc = None
    frontend_proc = None

    try:
        # Check backend
        backend_url = "http://localhost:8000/api/game"
        if not is_service_ready(backend_url):
            print_colored("--> Starting FastAPI backend on :8000...", Colors.CYAN)
            backend_cmd = [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"]
            backend_env = os.environ.copy()
            if not backend_env.get("ENVIRONMENT"):
                backend_env["ENVIRONMENT"] = "development"
            backend_proc = subprocess.Popen(
                backend_cmd,
                cwd=str(BACKEND_DIR),
                env=backend_env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if not wait_for_service(backend_url, "FastAPI Backend"):
                print_colored("[FAIL] FastAPI backend failed to start on :8000", Colors.RED)
                return 1
            print_colored("--> FastAPI backend is active.", Colors.GREEN)

        # Check frontend
        frontend_url = base_url
        if not is_service_ready(frontend_url):
            print_colored(f"--> Starting Vite frontend on {base_url}...", Colors.CYAN)
            frontend_proc = subprocess.Popen(
                [NPM_CMD, "run", "dev"],
                cwd=str(FRONTEND_DIR),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if not wait_for_service(frontend_url, "Vite Frontend"):
                print_colored(f"[FAIL] Vite frontend failed to start on {frontend_url}", Colors.RED)
                return 1
            print_colored("--> Vite frontend is active.", Colors.GREEN)

        # Determine specs to run
        if scenario_arg == "--all" or scenario_arg == "all":
            spec_args = [
                "e2e/movement_and_orders.spec.ts",
                "e2e/sandbox_isolation.spec.ts",
                "e2e/blunder_sanity_modal.spec.ts",
                "e2e/retreats_dislodgement.spec.ts",
                "e2e/winter_builds.spec.ts",
                "e2e/mobile_compact_hud.spec.ts",
            ]
            target_scenarios = [
                "movement_and_orders",
                "sandbox_isolation",
                "blunder_sanity_modal",
                "retreats_dislodgement",
                "winter_builds",
                "mobile_compact_hud",
            ]
        else:
            clean_name = scenario_arg.lower().strip()
            if clean_name not in SCENARIO_MAP:
                print_colored(f"[ERROR] Unknown scenario '{scenario_arg}'.", Colors.RED)
                list_scenarios()
                return 1
            spec_file = SCENARIO_MAP[clean_name]
            spec_args = [spec_file]
            target_scenarios = [Path(spec_file).name.replace(".spec.ts", "")]

        print_colored(f"\n=======================================================", Colors.CYAN)
        print_colored(f"  Executing Playwright E2E Scenario: {scenario_arg}", Colors.CYAN + Colors.BOLD)
        print_colored(f"=======================================================\n", Colors.CYAN)

        cmd = [NPX_CMD, "playwright", "test"] + spec_args
        if headed:
            cmd.append("--headed")

        env = os.environ.copy()
        env["E2E_BASE_URL"] = base_url

        ret = subprocess.run(cmd, cwd=str(FRONTEND_DIR), env=env)

        for sc in target_scenarios:
            print_scenario_artifacts(sc)

        if ret.returncode == 0:
            print_colored("\n[PASS] E2E scenario executed successfully!\n", Colors.GREEN + Colors.BOLD)
        else:
            print_colored(f"\n[FAIL] E2E scenario exited with code {ret.returncode}\n", Colors.RED + Colors.BOLD)

        return ret.returncode

    finally:
        for proc, label in ((frontend_proc, "Vite"), (backend_proc, "FastAPI")):
            if proc and proc.poll() is None:
                print(f"Stopping background {label} server...")
                if IS_WINDOWS:
                    subprocess.run(
                        ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                else:
                    proc.terminate()
                    try:
                        proc.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        proc.kill()


def main():
    parser = argparse.ArgumentParser(description="Sloplomacy LLM-Driven E2E Interactive Test Runner")
    subparsers = parser.add_subparsers(dest="command")

    # List command
    subparsers.add_parser("list", help="List all available interactive test scenarios")

    # Run command
    run_parser = subparsers.add_parser("run", help="Run an interactive E2E scenario")
    run_parser.add_argument("scenario", nargs="?", default="movement", help="Scenario name (or 'all' / '--all')")
    run_parser.add_argument("--headed", action="store_true", help="Launch real visible browser")
    run_parser.add_argument("--all", action="store_true", help="Run all available scenarios")
    run_parser.add_argument("--base-url", default="http://localhost:5173", help="Base URL of the frontend")

    args = parser.parse_args()

    if args.command == "list" or not args.command:
        list_scenarios()
        return 0

    if args.command == "run":
        target = "all" if args.all else args.scenario
        return run_scenario(target, headed=args.headed, base_url=args.base_url)

    return 0


if __name__ == "__main__":
    sys.exit(main())
