"""The Docker image installs `requirements-runtime.lock`, so it must keep up with its ranges."""

import re
from pathlib import Path

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name
from packaging.version import Version

ROOT = Path(__file__).resolve().parents[3]
BACKEND = ROOT / "backend"


def _ranges() -> list[Requirement]:
    lines = (BACKEND / "requirements-runtime.txt").read_text().splitlines()
    return [Requirement(line) for line in lines if line.strip() and not line.startswith("#")]


def _pins() -> dict[str, Version]:
    text = (BACKEND / "requirements-runtime.lock").read_text()
    found = re.findall(r"(?m)^([A-Za-z0-9_.-]+)==([^\s\\]+)", text)
    return {canonicalize_name(name): Version(version) for name, version in found}


def test_lock_pins_every_range_inside_it():
    """Fails after a range is edited without running scripts/lock-requirements.sh."""
    pins = _pins()
    for req in _ranges():
        name = canonicalize_name(req.name)
        assert name in pins, f"{req.name} is not in requirements-runtime.lock"
        assert req.specifier.contains(pins[name]), (
            f"requirements-runtime.lock pins {req.name}=={pins[name]}, "
            f"outside {req.specifier}; run scripts/lock-requirements.sh"
        )


def test_every_lock_entry_has_hashes():
    text = (BACKEND / "requirements-runtime.lock").read_text()
    entries = re.split(r"(?m)^(?=[A-Za-z0-9_.-]+==)", text)[1:]
    assert entries
    for entry in entries:
        assert "--hash=sha256:" in entry, f"no hash for {entry.splitlines()[0]}"


def test_dockerfile_installs_the_lock_with_hashes():
    dockerfile = (ROOT / "Dockerfile").read_text()
    assert "--require-hashes -r requirements-runtime.lock" in dockerfile
