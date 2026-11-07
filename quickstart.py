#!/usr/bin/env python3
"""
Quickstart script for Diplomacy 1901 Tactical Engine.
Sets up dependencies and launches both the backend (FastAPI) and frontend (Vite) servers.
"""

import argparse
import os
import platform
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"

IS_WINDOWS = platform.system() == "Windows"
VENV_DIR = BACKEND_DIR / ".venv"
VENV_PYTHON = (
    VENV_DIR / ("Scripts" if IS_WINDOWS else "bin") / ("python.exe" if IS_WINDOWS else "python")
)
NPM_CMD = "npm.cmd" if IS_WINDOWS else "npm"


class Colors:
    HEADER = "\033[95m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    RESET = "\033[0m"
    BOLD = "\033[1m"


def print_colored(text: str, color: str = ""):
    if sys.stdout.isatty():
        print(f"{color}{text}{Colors.RESET}")
    else:
        print(text)


def stream_logs(pipe, prefix: str, color: str):
    """Read lines from a sub-process stdout/stderr and output with prefix."""
    try:
        for line in iter(pipe.readline, ""):
            if not line:
                break
            clean_line = line.rstrip()
            if clean_line:
                if sys.stdout.isatty():
                    print(f"{color}[{prefix}]{Colors.RESET} {clean_line}")
                else:
                    print(f"[{prefix}] {clean_line}")
    except Exception:
        pass
    finally:
        try:
            pipe.close()
        except Exception:
            pass


def check_prerequisites():
    print_colored("--> Checking prerequisites...", Colors.HEADER)

    # Check python
    python_version = sys.version_info
    if python_version < (3, 10):
        print_colored(f"Error: Python 3.10+ is required (found {python_version.major}.{python_version.minor})", Colors.RED)
        sys.exit(1)
    print_colored(f"  [OK] Python {python_version.major}.{python_version.minor}.{python_version.micro}", Colors.GREEN)

    # Check npm / node
    npm_path = shutil.which(NPM_CMD) or shutil.which("npm")
    if not npm_path:
        print_colored("Warning: Node.js / npm not found in PATH. Frontend startup may fail.", Colors.YELLOW)
        print_colored("  Please install Node.js from https://nodejs.org/", Colors.YELLOW)
    else:
        print_colored(f"  [OK] npm detected ({npm_path})", Colors.GREEN)


def setup_backend():
    print_colored("--> Setting up Python backend environment...", Colors.HEADER)

    if not VENV_PYTHON.exists():
        print_colored(f"  Creating virtual environment at {VENV_DIR}...", Colors.CYAN)
        subprocess.run([sys.executable, "-m", "venv", str(VENV_DIR)], check=True)

    requirements_file = BACKEND_DIR / "requirements.txt"
    if requirements_file.exists():
        # Check if basic dependencies are installed
        check_cmd = [str(VENV_PYTHON), "-c", "import fastapi, uvicorn, pydantic"]
        res = subprocess.run(check_cmd, capture_output=True)
        if res.returncode != 0:
            print_colored("  Installing Python backend dependencies...", Colors.CYAN)
            subprocess.run(
                [str(VENV_PYTHON), "-m", "pip", "install", "-r", str(requirements_file)],
                check=True,
            )
        else:
            print_colored("  [OK] Backend Python dependencies verified.", Colors.GREEN)
    else:
        print_colored(f"  Note: {requirements_file} not found.", Colors.YELLOW)


def setup_frontend():
    print_colored("--> Setting up Frontend environment...", Colors.HEADER)
    node_modules = FRONTEND_DIR / "node_modules"

    if not node_modules.exists():
        print_colored("  Installing npm dependencies in frontend...", Colors.CYAN)
        subprocess.run([NPM_CMD, "install"], cwd=str(FRONTEND_DIR), check=True)
        print_colored("  [OK] Frontend dependencies installed.", Colors.GREEN)
    else:
        print_colored("  [OK] Frontend node_modules present.", Colors.GREEN)


def run_tests():
    print_colored("--> Running test suites...", Colors.HEADER)

    # Backend tests
    print_colored("  Running backend pytest...", Colors.CYAN)
    backend_res = subprocess.run([str(VENV_PYTHON), "-m", "pytest", "backend"], cwd=str(ROOT_DIR))
    if backend_res.returncode != 0:
        print_colored("Backend tests failed!", Colors.RED)
        return False

    # Frontend build test
    print_colored("  Testing frontend typecheck and build...", Colors.CYAN)
    frontend_res = subprocess.run([NPM_CMD, "run", "build"], cwd=str(FRONTEND_DIR))
    if frontend_res.returncode != 0:
        print_colored("Frontend build failed!", Colors.RED)
        return False

    print_colored("[OK] All tests and builds passed!", Colors.GREEN)
    return True


def backend_env() -> dict:
    """Environment for the local backend, so a local demo sign-in works.

    Demo sign-ins send unsigned `alg: none` tokens, which backend/auth.py only
    accepts when ENVIRONMENT is `development` or `test`. A value already set in
    the shell wins, so `ENVIRONMENT=production python quickstart.py` still rejects
    them. Nothing that deploys the app runs this launcher or may set this flag.
    """
    env = os.environ.copy()
    if not env.get("ENVIRONMENT"):
        env["ENVIRONMENT"] = "development"
    return env


def start_services(backend_only=False, frontend_only=False, no_open=False):
    procs = []

    print_colored("\n=======================================================", Colors.BOLD)
    print_colored("   Starting Diplomacy 1901 Tactical Engine Dev Stack   ", Colors.BOLD + Colors.CYAN)
    print_colored("=======================================================\n", Colors.BOLD)

    # Start Backend
    if not frontend_only:
        print_colored("Starting FastAPI backend on http://127.0.0.1:8000...", Colors.BLUE)
        backend_cmd = [
            str(VENV_PYTHON),
            "-m",
            "uvicorn",
            "main:app",
            "--reload",
            "--port",
            "8000",
        ]
        p_backend = subprocess.Popen(
            backend_cmd,
            cwd=str(BACKEND_DIR),
            env=backend_env(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        procs.append(("Backend", p_backend))

        t_out = threading.Thread(
            target=stream_logs,
            args=(p_backend.stdout, "BACKEND", Colors.BLUE),
            daemon=True,
        )
        t_err = threading.Thread(
            target=stream_logs,
            args=(p_backend.stderr, "BACKEND", Colors.RED),
            daemon=True,
        )
        t_out.start()
        t_err.start()

    # Start Frontend
    if not backend_only:
        print_colored("Starting Vite frontend on http://localhost:5173...", Colors.GREEN)
        frontend_cmd = [NPM_CMD, "run", "dev"]
        p_frontend = subprocess.Popen(
            frontend_cmd,
            cwd=str(FRONTEND_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        procs.append(("Frontend", p_frontend))

        t_out = threading.Thread(
            target=stream_logs,
            args=(p_frontend.stdout, "FRONTEND", Colors.GREEN),
            daemon=True,
        )
        t_err = threading.Thread(
            target=stream_logs,
            args=(p_frontend.stderr, "FRONTEND", Colors.RED),
            daemon=True,
        )
        t_out.start()
        t_err.start()

    if not backend_only and not no_open:
        def open_browser():
            time.sleep(2)
            try:
                webbrowser.open("http://localhost:5173")
            except Exception:
                pass

        threading.Thread(target=open_browser, daemon=True).start()

    print_colored("\nDev servers running!", Colors.BOLD + Colors.GREEN)
    print_colored("  - Frontend: http://localhost:5173", Colors.CYAN)
    print_colored("  - Backend:  http://127.0.0.1:8000 (Docs: http://127.0.0.1:8000/docs)", Colors.CYAN)
    print_colored("Press Ctrl+C to terminate both servers.\n", Colors.YELLOW)

    try:
        while True:
            for name, p in procs:
                ret = p.poll()
                if ret is not None:
                    print_colored(f"{name} process exited with code {ret}", Colors.YELLOW)
                    return
            time.sleep(0.5)
    except KeyboardInterrupt:
        print_colored("\nShutting down dev servers...", Colors.YELLOW)
    finally:
        for name, p in procs:
            try:
                p.terminate()
                p.wait(timeout=3)
            except Exception:
                try:
                    p.kill()
                except Exception:
                    pass
        print_colored("All servers stopped. Goodbye!", Colors.GREEN)


def main():
    parser = argparse.ArgumentParser(description="Quickstart runner for Diplomacy 1901 Tactical Engine")
    parser.add_argument("--backend-only", action="store_true", help="Launch only the backend server")
    parser.add_argument("--frontend-only", action="store_true", help="Launch only the frontend server")
    parser.add_argument("--setup-only", action="store_true", help="Only verify and install dependencies")
    parser.add_argument("--test", action="store_true", help="Run backend tests and frontend build check")
    parser.add_argument("--no-open", action="store_true", help="Do not automatically open the browser")

    args = parser.parse_args()

    check_prerequisites()

    if not args.frontend_only:
        setup_backend()

    if not args.backend_only:
        setup_frontend()

    if args.setup_only:
        print_colored("\n[OK] Setup completed successfully!", Colors.GREEN)
        return

    if args.test:
        success = run_tests()
        sys.exit(0 if success else 1)

    start_services(
        backend_only=args.backend_only,
        frontend_only=args.frontend_only,
        no_open=args.no_open,
    )


if __name__ == "__main__":
    main()
