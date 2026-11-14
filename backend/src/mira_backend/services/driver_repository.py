"""Persistent driver data (Supabase Postgres).

Every method that touches personal data takes the driver id and filters by it;
there is no way to ask for "all memories". `InMemoryDriverRepository` mirrors
the Postgres one for tests and for running locally without a database.
"""

import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any, Protocol
from uuid import UUID

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from mira_backend.models.driver import Driver, Memory, MemoryCategory, PreferenceKey, SessionRecord

logger = logging.getLogger(__name__)


class DriverRepository(Protocol):
    async def list_drivers(self) -> list[Driver]: ...
    async def get_driver(self, driver_id: UUID) -> Driver | None: ...
    async def get_preferences(self, driver_id: UUID) -> dict[str, Any]: ...
    async def set_preference(self, driver_id: UUID, key: PreferenceKey, value: Any, source: str) -> None: ...
    async def list_memories(self, driver_id: UUID, limit: int = 20) -> list[Memory]: ...
    async def add_memory(self, driver_id: UUID, category: MemoryCategory, content: str) -> Memory | None: ...
    async def delete_memory(self, driver_id: UUID, memory_id: UUID) -> bool: ...
    async def start_session(self, vehicle_id: UUID, driver_id: UUID) -> SessionRecord: ...
    async def end_session(self, session_id: UUID, summary: str | None = None) -> None: ...
    async def add_message(self, session_id: UUID, role: str, content: str) -> None: ...
    async def recent_messages(self, session_id: UUID, limit: int = 12) -> list[dict[str, str]]: ...


def _normalise(text: str) -> str:
    return " ".join(text.lower().split()).rstrip(".")


class PostgresDriverRepository:
    def __init__(self, url: str) -> None:
        # Supabase's pooler does not keep prepared statements across clients.
        self._pool = AsyncConnectionPool(
            url, min_size=1, max_size=5, open=False, kwargs={"prepare_threshold": None, "row_factory": dict_row}
        )

    async def open(self) -> None:
        await self._pool.open(wait=True, timeout=20)

    async def close(self) -> None:
        await self._pool.close()

    async def _fetch(self, sql: str, *args: Any) -> list[dict[str, Any]]:
        async with self._pool.connection() as conn:
            cursor = await conn.execute(sql, args)
            return await cursor.fetchall() if cursor.description else []

    async def list_drivers(self) -> list[Driver]:
        rows = await self._fetch("select id, slug, display_name, gender, avatar from drivers order by display_name")
        return [Driver(**row) for row in rows]

    async def get_driver(self, driver_id: UUID) -> Driver | None:
        rows = await self._fetch("select id, slug, display_name, gender, avatar from drivers where id = %s", driver_id)
        return Driver(**rows[0]) if rows else None

    async def get_preferences(self, driver_id: UUID) -> dict[str, Any]:
        rows = await self._fetch("select key, value from driver_preferences where driver_id = %s", driver_id)
        return {row["key"]: row["value"] for row in rows}

    async def set_preference(self, driver_id: UUID, key: PreferenceKey, value: Any, source: str) -> None:
        await self._fetch(
            "insert into driver_preferences (driver_id, key, value, source) values (%s, %s, %s::jsonb, %s) "
            "on conflict (driver_id, key) do update set value = excluded.value, source = excluded.source, updated_at = now()",
            driver_id, key, json.dumps(value), source,
        )

    async def list_memories(self, driver_id: UUID, limit: int = 20) -> list[Memory]:
        rows = await self._fetch(
            "select id, category, content, created_at from memories where driver_id = %s order by created_at desc limit %s",
            driver_id, limit,
        )
        return [Memory(**row) for row in rows]

    async def add_memory(self, driver_id: UUID, category: MemoryCategory, content: str) -> Memory | None:
        existing = await self.list_memories(driver_id, limit=100)
        if any(_normalise(m.content) == _normalise(content) for m in existing):
            return None
        rows = await self._fetch(
            "insert into memories (driver_id, category, content) values (%s, %s, %s) returning id, category, content, created_at",
            driver_id, category, content.strip(),
        )
        return Memory(**rows[0])

    async def delete_memory(self, driver_id: UUID, memory_id: UUID) -> bool:
        rows = await self._fetch(
            "delete from memories where id = %s and driver_id = %s returning id", memory_id, driver_id
        )
        return bool(rows)

    async def start_session(self, vehicle_id: UUID, driver_id: UUID) -> SessionRecord:
        driver = await self.get_driver(driver_id)
        if driver is None:
            raise LookupError("Unknown driver")
        # A driver is in one car at a time: a visit left open (page reloaded, tab closed) ends now.
        await self._fetch("update sessions set ended_at = now() where driver_id = %s and ended_at is null", driver_id)
        rows = await self._fetch(
            "insert into sessions (vehicle_id, driver_id) values (%s, %s) returning id", vehicle_id, driver_id
        )
        return SessionRecord(id=rows[0]["id"], vehicle_id=vehicle_id, driver=driver)

    async def end_session(self, session_id: UUID, summary: str | None = None) -> None:
        await self._fetch(
            "update sessions set ended_at = now(), summary = coalesce(%s, summary) where id = %s", summary, session_id
        )

    async def add_message(self, session_id: UUID, role: str, content: str) -> None:
        await self._fetch(
            "insert into session_messages (session_id, role, content) values (%s, %s, %s)",
            session_id, role, content[:4000],
        )

    async def recent_messages(self, session_id: UUID, limit: int = 12) -> list[dict[str, str]]:
        rows = await self._fetch(
            "select role, content from (select id, role, content from session_messages where session_id = %s "
            "order by id desc limit %s) recent order by id",
            session_id, limit,
        )
        return [{"role": row["role"], "content": row["content"]} for row in rows]


class InMemoryDriverRepository:
    """Same behaviour as the Postgres repository, held in memory."""

    def __init__(self) -> None:
        daniel = Driver(id=uuid.uuid4(), slug="daniel", display_name="Daniel", gender="male", avatar="daniel")
        sophia = Driver(id=uuid.uuid4(), slug="sophia", display_name="Sophia", gender="female", avatar="sophia")
        self.drivers = {d.id: d for d in (daniel, sophia)}
        self.preferences: dict[UUID, dict[str, Any]] = {
            daniel.id: {"temperature_c": 22, "seat_heating": 1, "driving_mode": "comfort", "ambient_color": "#5AA9FF",
                        "ambient_brightness": 70, "music_volume": 35},
            sophia.id: {"temperature_c": 19.5, "seat_heating": 0, "driving_mode": "sport", "ambient_color": "#FF5A8A",
                        "ambient_brightness": 85, "music_volume": 55},
        }
        self.memories: dict[UUID, list[Memory]] = {daniel.id: [], sophia.id: []}
        self.sessions: dict[UUID, SessionRecord] = {}
        self.ended: set[UUID] = set()
        self.messages: dict[UUID, list[dict[str, str]]] = {}

    async def list_drivers(self) -> list[Driver]:
        return sorted(self.drivers.values(), key=lambda d: d.display_name)

    async def get_driver(self, driver_id: UUID) -> Driver | None:
        return self.drivers.get(driver_id)

    async def get_preferences(self, driver_id: UUID) -> dict[str, Any]:
        return dict(self.preferences.get(driver_id, {}))

    async def set_preference(self, driver_id: UUID, key: PreferenceKey, value: Any, source: str) -> None:
        if source not in ("seed", "agent", "user"):  # mirrors the database check constraint
            raise ValueError(f"invalid preference source {source!r}")
        self.preferences.setdefault(driver_id, {})[key] = value

    async def list_memories(self, driver_id: UUID, limit: int = 20) -> list[Memory]:
        return sorted(self.memories.get(driver_id, []), key=lambda m: m.created_at, reverse=True)[:limit]

    async def add_memory(self, driver_id: UUID, category: MemoryCategory, content: str) -> Memory | None:
        bucket = self.memories.setdefault(driver_id, [])
        if any(_normalise(m.content) == _normalise(content) for m in bucket):
            return None
        memory = Memory(id=uuid.uuid4(), category=category, content=content.strip(), created_at=datetime.now(UTC))
        bucket.append(memory)
        return memory

    async def delete_memory(self, driver_id: UUID, memory_id: UUID) -> bool:
        bucket = self.memories.get(driver_id, [])
        kept = [m for m in bucket if m.id != memory_id]
        self.memories[driver_id] = kept
        return len(kept) != len(bucket)

    async def start_session(self, vehicle_id: UUID, driver_id: UUID) -> SessionRecord:
        driver = self.drivers.get(driver_id)
        if driver is None:
            raise LookupError("Unknown driver")
        for open_id, open_record in self.sessions.items():
            if open_record.driver.id == driver_id:
                self.ended.add(open_id)
        record = SessionRecord(id=uuid.uuid4(), vehicle_id=vehicle_id, driver=driver)
        self.sessions[record.id] = record
        return record

    async def end_session(self, session_id: UUID, summary: str | None = None) -> None:
        self.ended.add(session_id)

    async def add_message(self, session_id: UUID, role: str, content: str) -> None:
        self.messages.setdefault(session_id, []).append({"role": role, "content": content})

    async def recent_messages(self, session_id: UUID, limit: int = 12) -> list[dict[str, str]]:
        return self.messages.get(session_id, [])[-limit:]
