"""The vehicle simulator: the single authority over simulated vehicle state.

Each browser session gets its own simulated car (a demo is shared by many
visitors, and one visitor's changes must not leak into another's). All changes
go through `VehicleSimulator.apply`, which validates, applies, logs and then
notifies subscribers (the WebSocket that keeps the cockpit in sync).
"""

import asyncio
import hashlib
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from mira_backend.models.vehicle import (
    ClearDestination,
    CommandResult,
    ControlMusic,
    DrivingMode,
    SetAmbientLighting,
    SetDestination,
    SetDoor,
    SetDrivingMode,
    SetFanSpeed,
    SetSeatHeating,
    SetTemperature,
    SetWindow,
    VehicleCommand,
    VehicleState,
)

logger = logging.getLogger(__name__)

PLAYLIST: list[tuple[str, str]] = [
    ("Midnight Drive", "MIRA Radio"),
    ("Neon Coastline", "The Night Shift"),
    ("Autobahn Dreams", "Kraftwerk Tribute Band"),
    ("Slow Lane", "Velvet Engines"),
    ("Open Road", "Sunset Assembly"),
]

KM_PER_FUEL_PERCENT = 6.4
RANGE_FACTOR = {
    DrivingMode.ECO: 1.12,
    DrivingMode.COMFORT: 1.0,
    DrivingMode.SPORT: 0.9,
    DrivingMode.SPORT_PLUS: 0.8,
}


def _derive(state: VehicleState) -> VehicleState:
    """Recompute derived signals (estimated range)."""
    state.fuel.range_km = round(state.fuel.level_percent * KM_PER_FUEL_PERCENT * RANGE_FACTOR[state.driving_mode])
    return state


def _simulated_route(destination: str) -> tuple[float, int]:
    """A stable pretend route: the same destination always gives the same distance."""
    seed = int(hashlib.sha256(destination.strip().lower().encode()).hexdigest(), 16)
    distance = 3 + (seed % 4700) / 100  # 3 to 50 km
    return round(distance, 1), max(5, round(distance * 1.6))


class VehicleSimulator:
    def __init__(self, vehicle_id: str) -> None:
        self.vehicle_id = vehicle_id
        self._state = _derive(VehicleState())
        self._lock = asyncio.Lock()
        self._subscribers: set[asyncio.Queue[VehicleState]] = set()
        self.last_used = time.monotonic()

    @property
    def state(self) -> VehicleState:
        return self._state.model_copy(deep=True)

    async def apply(self, command: VehicleCommand) -> CommandResult:
        """Validate and apply one command. Returns the confirmed state."""
        async with self._lock:
            self.last_used = time.monotonic()
            draft = self._state.model_copy(deep=True)
            message = self._execute(draft, command)
            draft.version = self._state.version + 1
            # Re-validate the whole state so no command can leave it inconsistent.
            self._state = _derive(VehicleState.model_validate(draft.model_dump()))
            logger.info("vehicle %s: %s -> %s", self.vehicle_id[:8], command.type, message)
            snapshot = self.state
        for queue in list(self._subscribers):
            queue.put_nowait(snapshot)
        return CommandResult(ok=True, message=message, state=snapshot)

    @staticmethod
    def _execute(state: VehicleState, command: VehicleCommand) -> str:
        match command:
            case SetTemperature(celsius=celsius):
                state.climate.temperature_c = round(celsius * 2) / 2
                return f"Cabin temperature set to {state.climate.temperature_c:g} °C"
            case SetFanSpeed(level=level):
                state.climate.fan_speed = level
                return f"Fan speed set to {level}"
            case SetSeatHeating(level=level):
                state.seat.driver_heating = level
                return "Seat heating off" if level == 0 else f"Seat heating set to level {level}"
            case SetAmbientLighting(color=color, brightness=brightness):
                if color is None and brightness is None:
                    raise ValueError("Give a colour, a brightness, or both")
                if color is not None:
                    state.ambient_lighting.color = color.upper()
                if brightness is not None:
                    state.ambient_lighting.brightness = brightness
                return f"Ambient lighting {state.ambient_lighting.color} at {state.ambient_lighting.brightness}%"
            case SetDrivingMode(mode=mode):
                state.driving_mode = mode
                return f"Driving mode set to {mode.value.replace('_', ' ')}"
            case ControlMusic(action=action, volume=volume):
                if action is None and volume is None:
                    raise ValueError("Give an action, a volume, or both")
                if action in ("next", "previous"):
                    titles = [title for title, _ in PLAYLIST]
                    index = titles.index(state.music.track) if state.music.track in titles else 0
                    index = (index + (1 if action == "next" else -1)) % len(PLAYLIST)
                    state.music.track, state.music.artist = PLAYLIST[index]
                    state.music.playing = True
                elif action is not None:
                    state.music.playing = action == "play"
                if volume is not None:
                    state.music.volume = volume
                status = "Playing" if state.music.playing else "Paused"
                return f"{status} “{state.music.track}” at volume {state.music.volume}"
            case SetDestination(destination=destination):
                distance, eta = _simulated_route(destination)
                state.navigation.destination = destination.strip()
                state.navigation.distance_km = distance
                state.navigation.eta_minutes = eta
                return f"Navigating to {destination.strip()}: {distance:g} km, about {eta} min"
            case ClearDestination():
                state.navigation.destination = None
                state.navigation.distance_km = None
                state.navigation.eta_minutes = None
                return "Navigation cancelled"
            case SetWindow(window=window, percent_open=percent):
                targets = ["front_left", "front_right"] if window == "both" else [window]
                for target in targets:
                    setattr(state.windows, target, percent)
                return f"{window.replace('_', ' ').capitalize()} window {'closed' if percent == 0 else f'{percent}% open'}"
            case SetDoor(door=door, open=is_open):
                setattr(state.doors, f"{door}_open", is_open)
                return f"{door.capitalize()} door {'opened' if is_open else 'closed'}"
        raise ValueError(f"Unsupported command {command!r}")

    @asynccontextmanager
    async def subscribe(self) -> AsyncIterator[asyncio.Queue[VehicleState]]:
        queue: asyncio.Queue[VehicleState] = asyncio.Queue(maxsize=100)
        self._subscribers.add(queue)
        try:
            yield queue
        finally:
            self._subscribers.discard(queue)


class VehicleRegistry:
    """Holds one simulator per session, evicting idle ones."""

    def __init__(self, max_vehicles: int = 500, idle_seconds: float = 3 * 3600) -> None:
        self._vehicles: dict[str, VehicleSimulator] = {}
        self._max = max_vehicles
        self._idle = idle_seconds

    def get(self, vehicle_id: str) -> VehicleSimulator:
        vehicle = self._vehicles.get(vehicle_id)
        if vehicle is None:
            self._evict()
            vehicle = self._vehicles[vehicle_id] = VehicleSimulator(vehicle_id)
        vehicle.last_used = time.monotonic()
        return vehicle

    def _evict(self) -> None:
        now = time.monotonic()
        for key in [k for k, v in self._vehicles.items() if now - v.last_used > self._idle]:
            del self._vehicles[key]
        while len(self._vehicles) >= self._max:
            oldest = min(self._vehicles, key=lambda k: self._vehicles[k].last_used)
            del self._vehicles[oldest]

    def __len__(self) -> int:
        return len(self._vehicles)


vehicles = VehicleRegistry()
