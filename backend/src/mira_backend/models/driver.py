from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

MemoryCategory = Literal["profile", "preference", "episodic"]
PreferenceKey = Literal[
    "temperature_c", "fan_speed", "seat_heating", "ambient_color", "ambient_brightness", "driving_mode", "music_volume"
]


class Driver(BaseModel):
    id: UUID
    slug: str
    display_name: str
    gender: Literal["male", "female"]
    avatar: str


class Memory(BaseModel):
    id: UUID
    category: MemoryCategory
    content: str
    created_at: datetime


class SessionRecord(BaseModel):
    id: UUID
    vehicle_id: UUID
    driver: Driver


class StartSession(BaseModel):
    vehicle_id: UUID
    driver_id: UUID


class SessionStarted(BaseModel):
    session_id: UUID
    driver: Driver
    applied: list[str] = Field(description="Confirmed changes made to the car from the driver's preferences")
    greeting: str


class DriverProfile(BaseModel):
    """What a driver may see and manage about themselves."""

    driver: Driver
    preferences: dict[str, float | int | str]
    memories: list[Memory]
