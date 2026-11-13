"""Vehicle API: read the authoritative state, send validated commands, and
stream confirmed state changes to the cockpit over a WebSocket."""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Body, HTTPException, Path, WebSocket, WebSocketDisconnect

from mira_backend.models.vehicle import CommandResult, VehicleCommand, VehicleState
from mira_backend.services.vehicle_simulator import vehicles

router = APIRouter(tags=["vehicle"])

# Session-scoped vehicle ids are client-generated UUIDs.
VehicleId = Annotated[str, Path(pattern=r"^[0-9a-fA-F-]{36}$", description="Session vehicle id (UUID)")]


@router.get("/api/vehicles/{vehicle_id}", response_model=VehicleState)
async def get_vehicle(vehicle_id: VehicleId) -> VehicleState:
    return vehicles.get(vehicle_id).state


@router.post("/api/vehicles/{vehicle_id}/commands", response_model=CommandResult)
async def send_command(vehicle_id: VehicleId, command: Annotated[VehicleCommand, Body()]) -> CommandResult:
    try:
        return await vehicles.get(vehicle_id).apply(command)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.websocket("/ws/vehicles/{vehicle_id}")
async def vehicle_updates(websocket: WebSocket, vehicle_id: str) -> None:
    if len(vehicle_id) != 36:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    vehicle = vehicles.get(vehicle_id)
    async with vehicle.subscribe() as updates:
        await websocket.send_json(vehicle.state.model_dump(mode="json"))
        receiver = asyncio.create_task(_drain(websocket))
        try:
            while not receiver.done():
                getter = asyncio.create_task(updates.get())
                done, _ = await asyncio.wait({getter, receiver}, return_when=asyncio.FIRST_COMPLETED)
                if getter in done:
                    await websocket.send_json(getter.result().model_dump(mode="json"))
                else:
                    getter.cancel()
        except WebSocketDisconnect:
            pass
        finally:
            receiver.cancel()


async def _drain(websocket: WebSocket) -> None:
    """Read (and ignore) client messages until the socket closes; keeps pings flowing."""
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        return
