"""Guards on `supabase/migrations/` that the Supabase CLI and the deploy both depend on."""

import re
from collections import defaultdict
from pathlib import Path

MIGRATIONS = Path(__file__).resolve().parents[3] / "supabase" / "migrations"
NAME = re.compile(r"^(\d{14})_[a-z0-9_]+\.sql$")


def _files() -> list[Path]:
    return sorted(MIGRATIONS.glob("*.sql"))


def test_migrations_exist():
    assert _files(), f"no migrations found in {MIGRATIONS}"


def test_every_migration_is_named_with_a_timestamp_version():
    bad = [f.name for f in _files() if not NAME.match(f.name)]
    assert not bad, f"migrations must be named <14-digit timestamp>_<name>.sql: {bad}"


def test_no_two_migrations_share_a_version():
    """The Supabase CLI keys migrations on the timestamp and rejects a repeated one."""
    by_version = defaultdict(list)
    for f in _files():
        match = NAME.match(f.name)
        if match:
            by_version[match.group(1)].append(f.name)
    duplicates = {v: names for v, names in by_version.items() if len(names) > 1}
    assert not duplicates, f"migrations share a version: {duplicates}"
