"""Drivers and sessions.

Personal data is always reached through the session bound to the caller's car
(`/api/sessions/{vehicle_id}/...`), never by driver id, so a client can only
see and manage the profile of the driver currently identified in its car.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Path

from mira_backend.models.driver import Driver, DriverProfile, SessionStarted, StartSession
from mira_backend.services.container import container

router = APIRouter(tags=["drivers"])

VehicleId = Annotated[UUID, Path(description="Session vehicle id")]


@router.get("/api/drivers", response_model=list[Driver])
async def list_drivers() -> list[Driver]:
    return await container().repo.list_drivers()


@router.post("/api/sessions", response_model=SessionStarted)
async def identify_driver(body: StartSession) -> SessionStarted:
    try:
        return await container().sessions.identify(body.vehicle_id, body.driver_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail="Unknown driver") from error


@router.get("/api/sessions/{vehicle_id}", response_model=Driver | None)
async def current_driver(vehicle_id: VehicleId) -> Driver | None:
    record = container().sessions.current(vehicle_id)
    return record.driver if record else None


@router.delete("/api/sessions/{vehicle_id}", status_code=204)
async def leave(vehicle_id: VehicleId) -> None:
    await container().sessions.leave(vehicle_id)


@router.get("/api/sessions/{vehicle_id}/profile", response_model=DriverProfile)
async def profile(vehicle_id: VehicleId) -> DriverProfile:
    record = container().sessions.current(vehicle_id)
    if record is None:
        raise HTTPException(status_code=404, detail="No driver identified in this car")
    repo = container().repo
    return DriverProfile(
        driver=record.driver,
        preferences=await repo.get_preferences(record.driver.id),
        memories=await repo.list_memories(record.driver.id),
    )


@router.delete("/api/sessions/{vehicle_id}/memories/{memory_id}", status_code=204)
async def forget(vehicle_id: VehicleId, memory_id: UUID) -> None:
    record = container().sessions.current(vehicle_id)
    if record is None:
        raise HTTPException(status_code=404, detail="No driver identified in this car")
    # Scoped by the session's driver: another driver's memory id simply is not found.
    if not await container().repo.delete_memory(record.driver.id, memory_id):
        raise HTTPException(status_code=404, detail="Memory not found")
