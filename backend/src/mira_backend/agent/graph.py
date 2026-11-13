"""MIRA's agent: a LangGraph loop of model ⇄ tools, built per turn around the
caller's car and driver.

    load context ─▶ agent ─┬─(tool calls)─▶ tools ─▶ agent …
                           └─(answer)─────▶ END

Context is kept compact on purpose (Groq's free tier limits tokens per
minute): a one-line car summary, the driver's preferences and recent memories.
"""

import asyncio
import logging
import re
from dataclasses import dataclass, field
from collections.abc import Awaitable, Callable
from typing import Annotated, Any, TypedDict

from fastmcp import Client
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from mira_backend.agent.llm import ModelChain
from mira_backend.agent.tools import ActionLog, finish_onboarding_tool, memory_tools, vehicle_tools
from mira_backend.models.driver import Driver, Memory
from mira_backend.models.vehicle import VehicleState
from mira_backend.services.driver_repository import DriverRepository
from mira_backend.services.vehicle_simulator import vehicles
from mira_backend.vehicle_mcp.server import mcp

logger = logging.getLogger(__name__)

MAX_STEPS = 4  # model calls per turn

SYSTEM = """You are MIRA, the voice assistant of a (simulated) sports coupe, and you know this driver.
Speak like a warm, attentive co-driver: one to three short spoken sentences, no lists, no markdown, metric units.
Make every reply personal: use the driver's name now and then, refer to what you know about them (their usual settings, past trips), and say why you did something. Never answer with a bare status like "Temperature set to 24 °C".

Comfort complaints ("it's getting cold", "too warm", "I'm tired"), when the driver didn't name an exact setting:
1. Call get_vehicle_status to check the cabin first.
2. Compare with their saved preferences and memories.
3. Propose one concrete, personal change and ask before doing it, e.g. "It's 19 degrees in here, Dan, and you usually like 22. Shall I warm it to 22 and put your seat heating on 1?" Do not change anything yet.
4. When they agree, make the change, then confirm warmly. If the new value differs from their saved preference, ask once whether it's just for now or should become their usual; on "usual"/"always", call save_preference.
Exact requests ("set 21 degrees", "seat heating on 2") are done immediately, no confirmation; they are one-off changes and never saved as a preference unless the driver says it's how they usually or always want it. If they say "for now"/"as of now", do not ask about making it their usual.

Rules:
- To change anything in the car, call a tool. Only say something changed after the tool confirms it. If a tool fails, say so briefly.
- The driver's explicit request always wins over a remembered preference.
- Save memory only for lasting facts or preferences the driver states ("call me Dan", "I always like 21 degrees"); never for one-off requests or small talk.
- For colours, convert names to hex (warm white #FFD9A8, red #FF2D2D, blue #2D7DFF, purple #8A4DFF, green #2DFF8A, orange #FF8A2D, pink #FF5A8A).
- Memories starting "Drove to" are past trips: use them for "take me back to where I went last time".
- "Take me to X" sets the destination; start driving (start_drive, which also leaves the garage) when the driver says to go/drive/let's go/let's roll, or asks to drive somewhere now ("drive me to X", "I'm late, just drive to X") — then set the destination and start_drive in the same turn, never ask them to say "let's go" again. "Let's roll"/"let's go" with no destination → leave_garage, then ask where to (they can also drive themselves with W A S D). Strong moods (exhausted, stressed, party) → offer a matching apply_cabin_scene.
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
        f"{'in the garage' if state.in_garage else 'on the road'}; "
        f"fuel {state.fuel.level_percent:g}% range {state.fuel.range_km} km; windows L{state.windows.front_left}% R{state.windows.front_right}%"
    )


# The getting-to-know-you questions of a driver's first drive, asked one per turn.
# Progress is tracked by the session (not left to the model), so a question is
# never asked twice, even after a detour like "just drive me to Munich".
ONBOARDING_TOPICS = [
    "what to call them",
    "a comfortable cabin temperature",
    "seat heating (off or level 1 to 3)",
    "driving style (eco, comfort or sport)",
    "music they enjoy",
    "a favourite ambient light colour",
]
# What to do with each answer: exactly one tool, so earlier answers are never re-applied.
ONBOARDING_ACTIONS = [
    'call remember, e.g. "Prefers to be called Dan."',
    "call set_cabin_temperature with the value that fits now",
    "call set_seat_heating",
    "call set_driving_mode",
    'call remember with their taste, e.g. "Likes podcasts on long drives and jazz on short ones." (do not touch the music player)',
    "call set_ambient_lighting",
]


def onboarding_prompt(step: int) -> str:
    done = ", ".join(ONBOARDING_TOPICS[:step])
    nxt = (
        f"Then ask ONE short, friendly question about: {ONBOARDING_TOPICS[step + 1]}."
        if step + 1 < len(ONBOARDING_TOPICS)
        else "That was the last question: thank them, say the car is now set up their way and that they can change anything any time or see it under Memories."
    )
    return f"""First drive with this driver: you are getting to know them.{f" Already covered (never ask or change again): {done}." if done else ""}
Your last question was about {ONBOARDING_TOPICS[step]}. If this message answers it, {ONBOARDING_ACTIONS[step]}, and nothing else (a car setting chosen as the answer becomes their usual automatically, so never ask "should this be your usual?"; if they say it's only for now, it stays a one-off: say so and ask what they usually like). Acknowledge warmly in a few words. {nxt}
If they ask for something else instead, help with that first and skip this question. If they want to stop the questions, are in a hurry or want to drive, call finish_getting_to_know and do not ask any more."""


def system_prompt(
    car: VehicleState,
    driver: Driver | None,
    prefs: dict[str, Any],
    memories: list[Memory],
    onboarding_step: int | None = None,
    call_me: str | None = None,
) -> str:
    parts = [SYSTEM, f"Car now: {describe_car(car)}."]
    if driver and onboarding_step is not None and onboarding_step < len(ONBOARDING_TOPICS):
        parts.append(onboarding_prompt(onboarding_step))
    if driver:
        named = f", who likes to be called {call_me}" if call_me and call_me != driver.display_name else ""
        parts.append(f"Driver: {driver.display_name} ({driver.gender}){named}.")
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


# Car settings a driver chooses during onboarding become their usual automatically,
# but only the setting the current question is about, and never when the driver
# says it's just for now ("set it to 20 as of now").
ONBOARDING_SETTINGS = {
    "set_cabin_temperature": ("temperature_c", lambda s: s.climate.temperature_c),
    "set_seat_heating": ("seat_heating", lambda s: s.seat.driver_heating),
    "set_driving_mode": ("driving_mode", lambda s: s.driving_mode.value),
    "set_ambient_lighting": ("ambient_color", lambda s: s.ambient_lighting.color),
}
# The tool that answers each onboarding question (None: nothing to save as a car setting).
ONBOARDING_TOOLS = [None, "set_cabin_temperature", "set_seat_heating", "set_driving_mode", None, "set_ambient_lighting"]

TEMPORARY = re.compile(
    r"\b(for now|as of now|right now|just now|for the moment|at the moment|for today|today|this time|temporar\w*|for a while|for this (drive|trip))\b",
    re.I,
)


def is_temporary(message: str) -> bool:
    """The driver wants a change only for now, not as their usual."""
    return bool(TEMPORARY.search(message))


async def keep_onboarding_settings(
    repo: DriverRepository, driver: Driver, state: VehicleState, log: ActionLog, step: int, message: str
) -> None:
    if step >= len(ONBOARDING_TOOLS) or ONBOARDING_TOOLS[step] is None or is_temporary(message):
        return
    saved = {m.split(" = ")[0].removeprefix("Preference ") for m in log.memories}
    for action in log.actions:
        if action["tool"] != ONBOARDING_TOOLS[step] or not action["ok"]:
            continue
        key, read = ONBOARDING_SETTINGS[action["tool"]]
        if key in saved:
            continue
        await repo.set_preference(driver.id, key, read(state), "agent")  # type: ignore[arg-type]
        log.memories.append(f"Preference {key} = {read(state)}")
        saved.add(key)


@dataclass
class TurnResult:
    reply: str
    actions: list[dict[str, Any]] = field(default_factory=list)
    memories: list[str] = field(default_factory=list)
    model: str | None = None
    stop_onboarding: bool = False


async def run_turn(
    *,
    models: list[tuple[str, BaseChatModel]],
    repo: DriverRepository,
    vehicle_id: str,
    driver: Driver | None,
    history: list[dict[str, str]],
    message: str,
    onboarding_step: int | None = None,
    call_me: str | None = None,
    on_tools: Callable[[list[str]], Awaitable[None]] | None = None,
) -> TurnResult:
    """One agent turn. `on_tools` is told which tools are about to run (voice uses it to say "one moment")."""
    log = ActionLog()
    car = vehicles.get(vehicle_id)
    if driver:  # both reads at once: every round trip to the database adds latency
        prefs, memories = await asyncio.gather(repo.get_preferences(driver.id), repo.list_memories(driver.id, limit=8))
    else:
        prefs, memories = {}, []

    async with Client(mcp) as mcp_client:
        tools = await vehicle_tools(mcp_client, vehicle_id, log)
        if driver:
            tools += memory_tools(repo, driver, log)
        if driver and onboarding_step is not None:
            tools.append(finish_onboarding_tool(log))
        chain = ModelChain(models, tools)

        async def agent(state: TurnState) -> dict[str, Any]:
            response = await chain.ainvoke(state["messages"])
            if on_tools and isinstance(response, AIMessage) and response.tool_calls:
                await on_tools([call["name"] for call in response.tool_calls])
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

        messages: list[AnyMessage] = [SystemMessage(system_prompt(car.state, driver, prefs, memories, onboarding_step, call_me))]
        for item in history[-8:]:
            messages.append(HumanMessage(item["content"]) if item["role"] == "user" else AIMessage(item["content"]))
        messages.append(HumanMessage(message))

        final = await app.ainvoke({"messages": messages, "steps": 0})

        if onboarding_step is not None and driver:
            await keep_onboarding_settings(repo, driver, car.state, log, onboarding_step, message)
        last = final["messages"][-1]
        reply = last.content if isinstance(last, AIMessage) and isinstance(last.content, str) else ""
        if not reply.strip() and log.actions:
            # The model acted but said nothing: ask it once (without tools) to speak to the driver.
            try:
                done = list(final["messages"])
                if isinstance(done[-1], AIMessage) and done[-1].tool_calls:
                    done.pop()  # step limit reached mid-request: providers reject unanswered tool calls
                closing = await chain.ainvoke([*done, HumanMessage("(Now tell the driver, warmly and personally, what you did.)")])
                reply = getattr(closing, "content", "") if isinstance(getattr(closing, "content", None), str) else ""
            except Exception:  # noqa: BLE001 - the factual fallback below still answers
                logger.warning("closing reply failed", exc_info=True)
    if not reply.strip():
        # The model stopped after tools without speaking: report what really happened.
        done = [a["message"] for a in log.actions if a["ok"]]
        reply = ". ".join(done) + "." if done else "Sorry, I couldn't do that."
    return TurnResult(
        reply=reply.strip(), actions=log.actions, memories=log.memories, model=chain.used, stop_onboarding=log.stop_onboarding
    )
