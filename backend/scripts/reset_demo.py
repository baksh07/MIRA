"""Restore the demo drivers to their seeded preferences and memories.

Usage (from backend/):  uv run python scripts/reset_demo.py
Drops what visitors taught MIRA (preferences, memories, session history) for
the two demo drivers, then re-applies supabase/seed.sql.
"""

from pathlib import Path

import psycopg

from mira_backend.core.config import get_settings

SEED = Path(__file__).resolve().parents[2] / "supabase" / "seed.sql"
DEMO = ("daniel", "sophia")

with psycopg.connect(get_settings().database_url) as conn:
    ids = [row[0] for row in conn.execute("select id from drivers where slug = any(%s)", (list(DEMO),))]
    for table in ("driver_preferences", "memories", "sessions"):
        conn.execute(f"delete from {table} where driver_id = any(%s)", (ids,))  # sessions cascade to messages
    conn.execute(SEED.read_text(encoding="utf-8"))
    conn.commit()
    prefs = conn.execute(
        "select d.slug, p.value from driver_preferences p join drivers d on d.id = p.driver_id where p.key = 'temperature_c' order by d.slug"
    ).fetchall()
    print("demo reset; temperature preferences:", prefs)
