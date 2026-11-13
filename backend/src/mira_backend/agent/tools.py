"""Tools the agent can use.

Vehicle tools are generated from the MCP server's own schemas and called
through an MCP client; `vehicle_id` is removed from what the model sees and
filled in here, so the model can only ever act on the caller's car.

Memory tools write to the current driver's profile only, after validation and
the memory policy (stable facts and lasting preferences, never small talk).
"""

import json
import logging
import re
from copy import deepcopy
from typing import Any
from uuid import UUID

from fastmcp import Client
from langchain_core.tools import BaseTool, StructuredTool

from mira_backend.models.driver import Driver
from mira_backend.services.driver_repository import DriverRepository
from mira_backend.services.preferences import PREFERENCE_KEYS, validate_preference
from mira_backend.vehicle_mcp.server import mcp

logger = logging.getLogger(__name__)

MAX_MEMORIES_PER_DRIVER = 50
# Things never worth keeping, whatever the model thinks.
SENSITIVE = re.compile(r"\b(password|passcode|pin|credit card|card number|iban|ssn|social security)\b", re.I)


class ActionLog:
    """What the tools actually did during one turn (shown to the user, used in tests)."""

    def __init__(self) -> None:
        self.actions: list[dict[str, Any]] = []
        self.memories: list[str] = []
        self.stop_onboarding = False


def _strip_vehicle_id(schema: dict[str, Any]) -> dict[str, Any]:
    schema = deepcopy(schema)
    schema.get("properties", {}).pop("vehicle_id", None)
    schema["required"] = [r for r in schema.get("required", []) if r != "vehicle_id"]
    return schema


def checked_summary(state: dict[str, Any]) -> str:
    """What the driver sees when MIRA reads the car (shown as a step in the chat)."""
    climate, seat = state.get("climate", {}), state.get("seat", {})
    if "temperature_c" not in climate:
        return "Checked the car"
    heat = seat.get("driver_heating", 0)
    return f"Checked the cabin: {climate['temperature_c']:g} °C, seat heating {'off' if not heat else heat}"


async def vehicle_tools(mcp_client: Client, vehicle_id: str, log: ActionLog) -> list[BaseTool]:
    tools: list[BaseTool] = []
    for spec in await mcp_client.list_tools():

        async def call(_name: str = spec.name, **kwargs: Any) -> str:
            args = {k: v for k, v in kwargs.items() if v is not None}
            result = await mcp_client.call_tool(_name, {**args, "vehicle_id": vehicle_id}, raise_on_error=False)
            text = result.content[0].text if result.content else ""
            if result.is_error:
                log.actions.append({"tool": _name, "ok": False, "message": text[:200]})
                return f"FAILED: {text[:300]}"
            payload = result.data if isinstance(result.data, dict) else json.loads(text or "{}")
            if _name == "get_vehicle_status":
                log.actions.append({"tool": _name, "ok": True, "message": checked_summary(payload)})
                return json.dumps(payload)
            log.actions.append({"tool": _name, "ok": True, "message": payload.get("message", "")})
            return payload.get("message", "done")

        tools.append(
            StructuredTool.from_function(
                coroutine=call, name=spec.name, description=spec.description or spec.name,
                args_schema=_strip_vehicle_id(spec.input_schema),
            )
        )
    return tools


def memory_tools(repo: DriverRepository, driver: Driver, log: ActionLog) -> list[BaseTool]:
    driver_id: UUID = driver.id

    async def remember(content: str, category: str = "profile") -> str:
        content = " ".join(content.split())
        if category not in ("profile", "preference", "episodic"):
            return "Not saved: category must be profile, preference or episodic."
        if not 3 <= len(content) <= 300:
            return "Not saved: keep memories between 3 and 300 characters."
        if SENSITIVE.search(content):
            return "Not saved: MIRA never stores sensitive personal data."
        if len(await repo.list_memories(driver_id, limit=MAX_MEMORIES_PER_DRIVER)) >= MAX_MEMORIES_PER_DRIVER:
            return "Not saved: memory is full for this driver."
        memory = await repo.add_memory(driver_id, category, content)  # type: ignore[arg-type]
        if memory is None:
            return "Already remembered."
        log.memories.append(content)
        return "Saved to the driver's memory."

    async def save_preference(key: str, value: str) -> str:
        try:
            parsed = validate_preference(key, value)
        except ValueError as error:
            return f"Not saved: {error}."
        await repo.set_preference(driver_id, key, parsed, "agent")  # type: ignore[arg-type]
        log.memories.append(f"Preference {key} = {parsed}")
        return f"Saved: {driver.display_name}'s preferred {key} is {parsed}."

    return [
        StructuredTool.from_function(
            coroutine=remember, name="remember",
            description=(
                "Save a lasting fact about the current driver (name they like to be called, units, habits, likes). "
                "Only for stable information the driver stated; never small talk, one-off requests or sensitive data."
            ),
            args_schema={
                "type": "object",
                "properties": {
                    "content": {"type": "string", "description": "Short third-person fact, e.g. 'Prefers to be called Dan.'"},
                    "category": {"type": "string", "enum": ["profile", "preference", "episodic"]},
                },
                "required": ["content"],
            },
        ),
        StructuredTool.from_function(
            coroutine=save_preference, name="save_preference",
            description=(
                "Store the driver's lasting vehicle preference, applied automatically next time they get in. "
                "Use only when they say it is how they usually or always want it (e.g. 'I always like 21 degrees')."
            ),
            args_schema={
                "type": "object",
                "properties": {
                    "key": {"type": "string", "enum": PREFERENCE_KEYS},
                    "value": {"type": "string", "description": "e.g. '21', 'sport', '#FF8800'"},
                },
                "required": ["key", "value"],
            },
        ),
    ]


def finish_onboarding_tool(log: ActionLog) -> BaseTool:
    """Lets the driver end the first-drive questions ("stop, I'm late")."""

    async def finish_getting_to_know() -> str:
        log.stop_onboarding = True
        return "No more getting-to-know-you questions this drive."

    return StructuredTool.from_function(
        coroutine=finish_getting_to_know, name="finish_getting_to_know",
        description="End the first-drive getting-to-know-you questions when the driver wants to stop, is in a hurry or wants to drive.",
        args_schema={"type": "object", "properties": {}},
    )
