import json
import uuid

import pytest
from fastapi.testclient import TestClient
from fastmcp import Client
from pydantic import ValidationError

from mira_backend.main import app
from mira_backend.models.vehicle import (
    ControlMusic,
    DrivingMode,
    SetAmbientLighting,
    SetDestination,
    SetDrivingMode,
    SetTemperature,
    SetWindow,
)
from mira_backend.services.vehicle_simulator import VehicleRegistry, VehicleSimulator
from mira_backend.vehicle_mcp.server import mcp


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def new_id() -> str:
    return str(uuid.uuid4())


# --- Simulator state transitions ---------------------------------------------


@pytest.mark.anyio
async def test_temperature_snaps_to_half_degrees_and_bumps_version() -> None:
    car = VehicleSimulator(new_id())
    result = await car.apply(SetTemperature(celsius=22.3))
    assert result.state.climate.temperature_c == 22.5
    assert result.state.version == 1


def test_invalid_commands_are_rejected_before_reaching_the_simulator() -> None:
    with pytest.raises(ValidationError):
        SetTemperature(celsius=35)
    with pytest.raises(ValidationError):
        SetAmbientLighting(color="blue")


@pytest.mark.anyio
async def test_empty_lighting_command_is_rejected_and_state_unchanged() -> None:
    car = VehicleSimulator(new_id())
    with pytest.raises(ValueError):
        await car.apply(SetAmbientLighting())
    assert car.state.version == 0


@pytest.mark.anyio
async def test_driving_mode_changes_estimated_range() -> None:
    car = VehicleSimulator(new_id())
    comfort = car.state.fuel.range_km
    eco = (await car.apply(SetDrivingMode(mode=DrivingMode.ECO))).state.fuel.range_km
    sport_plus = (await car.apply(SetDrivingMode(mode=DrivingMode.SPORT_PLUS))).state.fuel.range_km
    assert eco > comfort > sport_plus


@pytest.mark.anyio
async def test_music_skips_through_the_playlist_and_starts_playing() -> None:
    car = VehicleSimulator(new_id())
    first = car.state.music.track
    state = (await car.apply(ControlMusic(action="next"))).state
    assert state.music.track != first and state.music.playing
    state = (await car.apply(ControlMusic(action="previous", volume=10))).state
    assert state.music.track == first and state.music.volume == 10


@pytest.mark.anyio
async def test_navigation_route_is_deterministic() -> None:
    a, b = VehicleSimulator(new_id()), VehicleSimulator(new_id())
    ra = (await a.apply(SetDestination(destination="Munich Airport"))).state.navigation
    rb = (await b.apply(SetDestination(destination="munich airport "))).state.navigation
    assert ra.distance_km == rb.distance_km and ra.eta_minutes == rb.eta_minutes


@pytest.mark.anyio
async def test_both_windows() -> None:
    car = VehicleSimulator(new_id())
    state = (await car.apply(SetWindow(window="both", percent_open=40))).state
    assert state.windows.front_left == state.windows.front_right == 40


@pytest.mark.anyio
async def test_subscribers_receive_confirmed_state() -> None:
    car = VehicleSimulator(new_id())
    async with car.subscribe() as updates:
        await car.apply(SetTemperature(celsius=19))
        assert (await updates.get()).climate.temperature_c == 19


def test_sessions_get_isolated_vehicles_and_idle_ones_are_evicted() -> None:
    registry = VehicleRegistry(max_vehicles=2)
    a, b = registry.get("a"), registry.get("b")
    assert a is not b and registry.get("a") is a
    registry.get("c")
    assert len(registry) == 2


# --- HTTP and WebSocket API ----------------------------------------------------

client = TestClient(app)


def test_api_reads_and_changes_state() -> None:
    vid = new_id()
    assert client.get(f"/api/vehicles/{vid}").json()["climate"]["temperature_c"] == 21
    response = client.post(f"/api/vehicles/{vid}/commands", json={"type": "set_seat_heating", "level": 2})
    assert response.status_code == 200
    assert response.json()["state"]["seat"]["driver_heating"] == 2


@pytest.mark.parametrize(
    "body",
    [
        {"type": "set_temperature", "celsius": 99},
        {"type": "set_seat_heating", "level": 2, "extra": 1},
        {"type": "self_destruct"},
        {"type": "set_ambient_lighting"},
    ],
)
def test_api_rejects_invalid_commands(body: dict) -> None:
    assert client.post(f"/api/vehicles/{new_id()}/commands", json=body).status_code == 422


def test_api_rejects_malformed_vehicle_ids() -> None:
    assert client.get("/api/vehicles/not-a-uuid").status_code == 422


def test_websocket_streams_current_then_confirmed_state() -> None:
    vid = new_id()
    with client.websocket_connect(f"/ws/vehicles/{vid}") as ws:
        assert ws.receive_json()["version"] == 0
        client.post(f"/api/vehicles/{vid}/commands", json={"type": "set_driving_mode", "mode": "sport"})
        update = ws.receive_json()
        assert update["driving_mode"] == "sport" and update["version"] == 1


def test_sessions_do_not_share_state() -> None:
    a, b = new_id(), new_id()
    client.post(f"/api/vehicles/{a}/commands", json={"type": "set_temperature", "celsius": 28})
    assert client.get(f"/api/vehicles/{b}").json()["climate"]["temperature_c"] == 21


# --- MCP tools -----------------------------------------------------------------


@pytest.mark.anyio
async def test_mcp_lists_the_vehicle_tools() -> None:
    async with Client(mcp) as mcp_client:
        names = {tool.name for tool in await mcp_client.list_tools()}
    assert {"get_vehicle_status", "set_cabin_temperature", "set_ambient_lighting", "set_navigation_destination"} <= names


@pytest.mark.anyio
async def test_mcp_tool_changes_the_simulator_state() -> None:
    vid = new_id()
    async with Client(mcp) as mcp_client:
        result = await mcp_client.call_tool("set_ambient_lighting", {"vehicle_id": vid, "color": "#ff2200", "brightness": 55})
        payload = result.data if result.data is not None else json.loads(result.content[0].text)
    assert payload["ok"] and payload["state"]["ambient_lighting"] == {"color": "#FF2200", "brightness": 55}
    assert client.get(f"/api/vehicles/{vid}").json()["ambient_lighting"]["color"] == "#FF2200"


@pytest.mark.anyio
async def test_mcp_rejects_out_of_range_arguments() -> None:
    async with Client(mcp) as mcp_client:
        result = await mcp_client.call_tool(
            "set_seat_heating", {"vehicle_id": new_id(), "level": 9}, raise_on_error=False
        )
    assert result.is_error
