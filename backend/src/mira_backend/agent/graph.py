"""MIRA's agent: a LangGraph loop of model ⇄ tools, built per turn around the
caller's car and driver.

    load context ─▶ agent ─┬─(tool calls)─▶ tools ─▶ agent …
                           └─(answer)─────▶ END

Context is kept compact on purpose (Groq's free tier limits tokens per
minute): a one-line car summary, the driver's preferences and recent memories.
"""

import logging
from dataclasses import dataclass, field
from typing import Annotated, Any, TypedDict

from fastmcp import Client
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from mira_backend.agent.llm import ModelChain
from mira_backend.agent.tools import ActionLog, memory_tools, vehicle_tools
from mira_backend.models.driver import Driver, Memory
from mira_backend.models.vehicle import VehicleState
from mira_backend.services.driver_repository import DriverRepository
from mira_backend.services.vehicle_simulator import vehicles
from mira_backend.vehicle_mcp.server import mcp

logger = logging.getLogger(__name__)

MAX_STEPS = 4  # model calls per turn

SYSTEM = """You are MIRA, the voice assistant of a (simulated) sports coupe.
Speak like a calm, warm co-driver: one or two short sentences, no lists, no markdown, metric units.

Rules:
- To change anything in the car, call a tool. Only say something changed after the tool confirms it. If a tool fails, say so briefly.
- The driver's explicit request always wins over a remembered preference.
- Use remembered preferences only when relevant (e.g. "make it comfortable" → their preferred temperature).
- Save memory only for lasting facts or preferences the driver states ("call me Dan", "I always like 21 degrees"); never for one-off requests or small talk.
- For colours, convert names to hex (warm white #FFD9A8, red #FF2D2D, blue #2D7DFF, purple #8A4DFF, green #2DFF8A, orange #FF8A2D, pink #FF5A8A).
- If asked something unrelated to driving or the car, answer briefly and kindly.
"""


def describe_car(state: VehicleState) -> str:
    nav = (
        f"navigating to {state.navigation.destination} ({state.navigation.distance_km} km, {state.navigation.eta_minutes} min)"
        if state.navigation.destination
        else "no route"
    )
    return (
        f"{state.climate.temperature_c:g}°C fan {state.climate.fan_speed}; seat heat {state.seat.driver_heating}; "
        f"ambient {state.ambient_lighting.color} {state.ambient_lighting.brightness}%; mode {state.driving_mode.value}; "
        f"music {'playing' if state.music.playing else 'paused'} '{state.music.track}' vol {state.music.volume}; {nav}; "
        f"fuel {state.fuel.level_percent:g}% range {state.fuel.range_km} km; windows L{state.windows.front_left}% R{state.windows.front_right}%"
    )


def system_prompt(car: VehicleState, driver: Driver | None, prefs: dict[str, Any], memories: list[Memory]) -> str:
    parts = [SYSTEM, f"Car now: {describe_car(car)}."]
    if driver:
        parts.append(f"Driver: {driver.display_name} ({driver.gender}).")
        if prefs:
            parts.append("Their saved preferences: " + ", ".join(f"{k}={v}" for k, v in prefs.items()) + ".")
        if memories:
            parts.append("What you remember about them: " + " ".join(m.content for m in memories[:8]))
    else:
        parts.append("No driver is identified, so nothing can be remembered; suggest selecting a driver if they ask you to remember something.")
    return "\n".join(parts)


class TurnState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    steps: int


@dataclass
class TurnResult:
    reply: str
    actions: list[dict[str, Any]] = field(default_factory=list)
    memories: list[str] = field(default_factory=list)
    model: str | None = None


async def run_turn(
    *,
    models: list[tuple[str, BaseChatModel]],
    repo: DriverRepository,
    vehicle_id: str,
    driver: Driver | None,
    history: list[dict[str, str]],
    message: str,
) -> TurnResult:
    log = ActionLog()
    car = vehicles.get(vehicle_id)
    prefs = await repo.get_preferences(driver.id) if driver else {}
    memories = await repo.list_memories(driver.id, limit=8) if driver else []

    async with Client(mcp) as mcp_client:
        tools = await vehicle_tools(mcp_client, vehicle_id, log)
        if driver:
            tools += memory_tools(repo, driver, log)
        chain = ModelChain(models, tools)

        async def agent(state: TurnState) -> dict[str, Any]:
            response = await chain.ainvoke(state["messages"])
            return {"messages": [response], "steps": state["steps"] + 1}

        def route(state: TurnState) -> str:
            last = state["messages"][-1]
            if isinstance(last, AIMessage) and last.tool_calls and state["steps"] < MAX_STEPS:
                return "tools"
            return END

        graph = StateGraph(TurnState)
        graph.add_node("agent", agent)
        graph.add_node("tools", ToolNode(tools, handle_tool_errors=True))
        graph.add_edge(START, "agent")
        graph.add_conditional_edges("agent", route, {"tools": "tools", END: END})
        graph.add_edge("tools", "agent")
        app = graph.compile()

        messages: list[AnyMessage] = [SystemMessage(system_prompt(car.state, driver, prefs, memories))]
        for item in history[-8:]:
            messages.append(HumanMessage(item["content"]) if item["role"] == "user" else AIMessage(item["content"]))
        messages.append(HumanMessage(message))

        final = await app.ainvoke({"messages": messages, "steps": 0})

    last = final["messages"][-1]
    reply = last.content if isinstance(last, AIMessage) and isinstance(last.content, str) else ""
    if not reply.strip():
        # The model stopped after tools without speaking: report what really happened.
        done = [a["message"] for a in log.actions if a["ok"]]
        reply = ". ".join(done) + "." if done else "Sorry, I couldn't do that."
    return TurnResult(reply=reply.strip(), actions=log.actions, memories=log.memories, model=chain.used)
