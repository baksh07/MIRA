"""Driver sessions: who is driving which simulated car.

Identifying a driver binds the browser session's car to that driver and applies
their stored preferences through the vehicle simulator (the same validated path
every other change takes). All per-driver data access is resolved from the
session here, on the server: the client never chooses whose memories it reads.
"""

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from mira_backend.models.driver import SessionRecord, SessionStarted
from mira_backend.models.vehicle import (
    ControlMusic,
    SetAmbientLighting,
    SetDrivingMode,
    SetFanSpeed,
    SetSeatHeating,
    SetTemperature,
    VehicleCommand,
)
from mira_backend.services.briefing import preferred_name
from mira_backend.services.driver_repository import DriverRepository
from mira_backend.services.vehicle_simulator import vehicles

logger = logging.getLogger(__name__)


def preferences_to_commands(prefs: dict[str, Any]) -> list[VehicleCommand]:
    """Turn stored preferences into simulator commands. Invalid values are skipped, never applied."""
    commands: list[VehicleCommand] = []
    builders = [
        ("temperature_c", lambda v: SetTemperature(celsius=float(v))),
        ("fan_speed", lambda v: SetFanSpeed(level=int(v))),
        ("seat_heating", lambda v: SetSeatHeating(level=int(v))),
        ("driving_mode", lambda v: SetDrivingMode(mode=v)),
        ("music_volume", lambda v: ControlMusic(volume=int(v))),
    ]
    for key, build in builders:
        if key in prefs:
            try:
                commands.append(build(prefs[key]))
            except (ValueError, TypeError):
                logger.warning("skipping invalid stored preference %s=%r", key, prefs[key])
    if "ambient_color" in prefs or "ambient_brightness" in prefs:
        try:
            commands.append(
                SetAmbientLighting(color=prefs.get("ambient_color"), brightness=prefs.get("ambient_brightness"))
            )
        except (ValueError, TypeError):
            logger.warning("skipping invalid stored ambient lighting preference")
    return commands


class SessionService:
    def __init__(self, repo: DriverRepository) -> None:
        self.repo = repo
        self._active: dict[str, SessionRecord] = {}

    def current(self, vehicle_id: UUID | str) -> SessionRecord | None:
        return self._active.get(str(vehicle_id))

    async def identify(self, vehicle_id: UUID, driver_id: UUID) -> SessionStarted:
        await self.leave(vehicle_id)
        record = await self.repo.start_session(vehicle_id, driver_id)
        # A driver MIRA knows nothing about yet gets onboarding for this session.
        memories = [m.content for m in await self.repo.list_memories(driver_id, limit=20)]
        new_driver = not memories
        call_me = preferred_name(record.driver.display_name, memories)
        record = record.model_copy(update={"onboarding": new_driver, "call_me": call_me})
        self._active[str(vehicle_id)] = record

        car = vehicles.get(str(vehicle_id))
        applied: list[str] = []
        for command in preferences_to_commands(await self.repo.get_preferences(driver_id)):
            result = await car.apply(command)
            applied.append(result.message)

        name = call_me
        if new_driver:
            greeting = (
                f"Hi {name}, I'm MIRA. This is our first drive together, so I'd love to get to know you "
                "and make this car yours. First things first: what should I call you?"
            )
        elif applied:
            greeting = f"Welcome back, {name}. I've set things up the way you like them."
        else:
            greeting = f"Hello, {name}."
        await self.repo.add_message(record.id, "assistant", greeting)  # the agent sees its own question
        logger.info("session %s: %s identified in vehicle %s", str(record.id)[:8], name, str(vehicle_id)[:8])
        return SessionStarted(session_id=record.id, driver=record.driver, applied=applied, greeting=greeting)

    async def record_arrival(self, vehicle_id: str, destination: str) -> None:
        """Episodic memory: the identified driver remembers where they drove."""
        record = self._active.get(vehicle_id)
        if record is None:
            return
        day = datetime.now(UTC).strftime("%d %b %Y")
        await self.repo.add_memory(record.driver.id, "episodic", f"Drove to {destination} on {day}.")

    async def leave(self, vehicle_id: UUID | str) -> None:
        record = self._active.pop(str(vehicle_id), None)
        if record is not None:
            await self.repo.end_session(record.id)
