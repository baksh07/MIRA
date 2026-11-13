"""MCP server exposing the simulated vehicle as tools (FastMCP).

The agent uses these tools in-process through an MCP client; the same server
is also mounted over HTTP at /mcp so any MCP client can drive a session's car.
Every tool takes the session's `vehicle_id`; the agent fills it in itself, so
the language model never sees or chooses it.
"""

from typing import Annotated, Literal

from fastmcp import FastMCP
from pydantic import Field

from mira_backend.models.vehicle import (
    ClearDestination,
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
)
from mira_backend.services.vehicle_simulator import vehicles

mcp = FastMCP(
    "MIRA Vehicle",
    instructions="Simulated vehicle controls. Every change is validated by the vehicle simulator, which returns the confirmed state.",
)

VehicleId = Annotated[str, Field(description="Session vehicle id (UUID)")]


async def _apply(vehicle_id: str, command: VehicleCommand) -> dict:
    result = await vehicles.get(vehicle_id).apply(command)
    return {"ok": result.ok, "message": result.message, "state": result.state.model_dump(mode="json")}


@mcp.tool
async def get_vehicle_status(vehicle_id: VehicleId) -> dict:
    """Read the current vehicle state: climate, seat heating, lighting, driving mode, music, navigation, fuel and range, windows, doors."""
    return vehicles.get(vehicle_id).state.model_dump(mode="json")


@mcp.tool
async def set_cabin_temperature(
    vehicle_id: VehicleId, celsius: Annotated[float, Field(ge=16, le=30, description="Target °C, 16 to 30")]
) -> dict:
    """Set the cabin temperature in degrees Celsius."""
    return await _apply(vehicle_id, SetTemperature(celsius=celsius))


@mcp.tool
async def set_fan_speed(vehicle_id: VehicleId, level: Annotated[int, Field(ge=0, le=7)]) -> dict:
    """Set the climate fan speed from 0 (off) to 7 (maximum)."""
    return await _apply(vehicle_id, SetFanSpeed(level=level))


@mcp.tool
async def set_seat_heating(vehicle_id: VehicleId, level: Annotated[int, Field(ge=0, le=3)]) -> dict:
    """Set driver seat heating: 0 off, 1 low, 2 medium, 3 high."""
    return await _apply(vehicle_id, SetSeatHeating(level=level))


@mcp.tool
async def set_ambient_lighting(
    vehicle_id: VehicleId,
    color: Annotated[str | None, Field(pattern=r"^#[0-9A-Fa-f]{6}$", description="Colour as #RRGGBB")] = None,
    brightness: Annotated[int | None, Field(ge=0, le=100)] = None,
) -> dict:
    """Change the interior ambient lighting colour and/or brightness (percent)."""
    return await _apply(vehicle_id, SetAmbientLighting(color=color, brightness=brightness))


@mcp.tool
async def set_driving_mode(vehicle_id: VehicleId, mode: DrivingMode) -> dict:
    """Switch driving mode: eco, comfort, sport or sport_plus. Affects the estimated range."""
    return await _apply(vehicle_id, SetDrivingMode(mode=mode))


@mcp.tool
async def control_music(
    vehicle_id: VehicleId,
    action: Literal["play", "pause", "next", "previous"] | None = None,
    volume: Annotated[int | None, Field(ge=0, le=100)] = None,
) -> dict:
    """Play, pause or skip music, and/or set the volume (0 to 100)."""
    return await _apply(vehicle_id, ControlMusic(action=action, volume=volume))


@mcp.tool
async def set_navigation_destination(
    vehicle_id: VehicleId, destination: Annotated[str, Field(min_length=2, max_length=120)]
) -> dict:
    """Start navigation to a destination (simulated route with distance and ETA)."""
    return await _apply(vehicle_id, SetDestination(destination=destination))


@mcp.tool
async def cancel_navigation(vehicle_id: VehicleId) -> dict:
    """Cancel the active navigation route."""
    return await _apply(vehicle_id, ClearDestination())


@mcp.tool
async def set_window(
    vehicle_id: VehicleId,
    window: Literal["front_left", "front_right", "both"],
    percent_open: Annotated[int, Field(ge=0, le=100, description="0 closed, 100 fully open")],
) -> dict:
    """Open or close a front window."""
    return await _apply(vehicle_id, SetWindow(window=window, percent_open=percent_open))


@mcp.tool
async def set_door(vehicle_id: VehicleId, door: Literal["left", "right"], open: bool) -> dict:
    """Open or close a door (the car is parked)."""
    return await _apply(vehicle_id, SetDoor(door=door, open=open))
