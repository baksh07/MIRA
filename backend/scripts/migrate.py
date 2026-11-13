"""Apply supabase/migrations/*.sql in order (once each), then supabase/seed.sql.

Usage (from backend/):  uv run python scripts/migrate.py
Reads DATABASE_URL from the environment or backend/.env.
"""

import sys
from pathlib import Path

import psycopg

from mira_backend.core.config import get_settings

ROOT = Path(__file__).resolve().parents[2] / "supabase"


def main() -> int:
    url = get_settings().database_url
    if not url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 1
    with psycopg.connect(url, autocommit=False) as conn:
        conn.execute(
            "create table if not exists public.schema_migrations "
            "(name text primary key, applied_at timestamptz not null default now())"
        )
        conn.execute("alter table public.schema_migrations enable row level security")
        applied = {row[0] for row in conn.execute("select name from public.schema_migrations")}
        for path in sorted((ROOT / "migrations").glob("*.sql")):
            if path.name in applied:
                print(f"skip   {path.name}")
                continue
            conn.execute(path.read_text(encoding="utf-8"))
            conn.execute("insert into public.schema_migrations (name) values (%s)", (path.name,))
            print(f"apply  {path.name}")
        conn.execute((ROOT / "seed.sql").read_text(encoding="utf-8"))
        print("seed   seed.sql")
        conn.commit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
