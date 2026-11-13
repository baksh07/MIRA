"""Simulated vehicle state.

The vehicle simulator owns this state; nothing else mutates it. Every change
goes through a validated command (see `VehicleCommand`) and the simulator
returns the confirmed new state.
"""

from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

HexColor = Annotated[str, Field(pattern=r"^#[0-9A-Fa-f]{6}$", description="Colour as #RRGGBB")]


class DrivingMode(StrEnum):
    ECO = "eco"
    COMFORT = "comfort"
    SPORT = "sport"
    SPORT_PLUS = "sport_plus"


class Climate(BaseModel):
    temperature_c: float = Field(21.0, ge=16, le=30, description="Cabin temperature, °C (0.5 steps)")
    fan_speed: int = Field(3, ge=0, le=7)


class Seat(BaseModel):
    driver_heating: int = Field(0, ge=0, le=3, description="0 = off, 3 = maximum")


class AmbientLighting(BaseModel):
    color: HexColor = "#5AA9FF"
    brightness: int = Field(70, ge=0, le=100)


class Music(BaseModel):
    playing: bool = False
    track: str = "Midnight Drive"
    artist: str = "MIRA Radio"
    volume: int = Field(40, ge=0, le=100)


class Navigation(BaseModel):
    destination: str | None = None
    distance_km: float | None = None
    eta_minutes: int | None = None


class Fuel(BaseModel):
    level_percent: float = Field(68, ge=0, le=100)
    range_km: int = Field(0, ge=0, description="Derived from fuel level and driving mode")


class Windows(BaseModel):
    front_left: int = Field(0, ge=0, le=100, description="Percent open")
    front_right: int = Field(0, ge=0, le=100)


class Doors(BaseModel):
    left_open: bool = False
    right_open: bool = False


class VehicleState(BaseModel):
    climate: Climate = Field(default_factory=Climate)
    seat: Seat = Field(default_factory=Seat)
    ambient_lighting: AmbientLighting = Field(default_factory=AmbientLighting)
    driving_mode: DrivingMode = DrivingMode.COMFORT
    music: Music = Field(default_factory=Music)
    navigation: Navigation = Field(default_factory=Navigation)
    fuel: Fuel = Field(default_factory=Fuel)
    windows: Windows = Field(default_factory=Windows)
    doors: Doors = Field(default_factory=Doors)
    version: int = Field(0, description="Increments on every confirmed change")


# --- Commands ---------------------------------------------------------------
# One model per operation. The discriminated union lets the API, the MCP tools
# and the agent all speak the same validated language.


class _Command(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SetTemperature(_Command):
    type: Literal["set_temperature"] = "set_temperature"
    celsius: float = Field(ge=16, le=30)


class SetFanSpeed(_Command):
    type: Literal["set_fan_speed"] = "set_fan_speed"
    level: int = Field(ge=0, le=7)


class SetSeatHeating(_Command):
    type: Literal["set_seat_heating"] = "set_seat_heating"
    level: int = Field(ge=0, le=3)


class SetAmbientLighting(_Command):
    type: Literal["set_ambient_lighting"] = "set_ambient_lighting"
    color: HexColor | None = None
    brightness: int | None = Field(None, ge=0, le=100)


class SetDrivingMode(_Command):
    type: Literal["set_driving_mode"] = "set_driving_mode"
    mode: DrivingMode


class ControlMusic(_Command):
    type: Literal["control_music"] = "control_music"
    action: Literal["play", "pause", "next", "previous"] | None = None
    volume: int | None = Field(None, ge=0, le=100)


class SetDestination(_Command):
    type: Literal["set_destination"] = "set_destination"
    destination: str = Field(min_length=2, max_length=120)


class ClearDestination(_Command):
    type: Literal["clear_destination"] = "clear_destination"


class SetWindow(_Command):
    type: Literal["set_window"] = "set_window"
    window: Literal["front_left", "front_right", "both"]
    percent_open: int = Field(ge=0, le=100)


class SetDoor(_Command):
    type: Literal["set_door"] = "set_door"
    door: Literal["left", "right"]
    open: bool


VehicleCommand = Annotated[
    SetTemperature
    | SetFanSpeed
    | SetSeatHeating
    | SetAmbientLighting
    | SetDrivingMode
    | ControlMusic
    | SetDestination
    | ClearDestination
    | SetWindow
    | SetDoor,
    Field(discriminator="type"),
]


class CommandResult(BaseModel):
    ok: bool
    message: str
    state: VehicleState
