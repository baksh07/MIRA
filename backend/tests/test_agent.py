"""Agent tests with a scripted fake model: tool selection, memory policy and
isolation, explicit-instruction priority, and model fallback. No network."""

import uuid
from collections.abc import Sequence
from typing import Any

import pytest
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from mira_backend.agent.graph import run_turn
from mira_backend.services.driver_repository import InMemoryDriverRepository
from mira_backend.services.vehicle_simulator import vehicles


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


class ScriptedModel(BaseChatModel):
    """Replays a script of responses; records the prompts it saw."""

    script: list[Any]
    seen: list[list[BaseMessage]] = []

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def bind_tools(self, tools: Sequence[Any], **kwargs: Any) -> "ScriptedModel":
        return self

    def _generate(self, messages: list[BaseMessage], stop: Any = None, run_manager: Any = None, **kwargs: Any) -> ChatResult:
        self.seen.append(messages)
        step = self.script.pop(0)
        if isinstance(step, Exception):
            raise step
        return ChatResult(generations=[ChatGeneration(message=step)])


def call(name: str, **args: Any) -> AIMessage:
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": str(uuid.uuid4())}])


async def turn(script: list[Any], message: str, repo: InMemoryDriverRepository, driver=None, vid: str | None = None):
    model = ScriptedModel(script=script, seen=[])
    vid = vid or str(uuid.uuid4())
    result = await run_turn(
        models=[("fake", model)], repo=repo, vehicle_id=vid, driver=driver, history=[], message=message
    )
    return result, vid, model


@pytest.mark.anyio
async def test_agent_calls_vehicle_tools_and_reports_confirmed_changes() -> None:
    repo = InMemoryDriverRepository()
    result, vid, _ = await turn(
        [call("set_cabin_temperature", celsius=23), AIMessage(content="Done, 23 degrees.")], "warmer please", repo
    )
    assert vehicles.get(vid).state.climate.temperature_c == 23
    assert result.actions == [{"tool": "set_cabin_temperature", "ok": True, "message": "Cabin temperature set to 23 °C"}]
    assert result.reply == "Done, 23 degrees."


@pytest.mark.anyio
async def test_invalid_tool_arguments_fail_and_change_nothing() -> None:
    repo = InMemoryDriverRepository()
    result, vid, _ = await turn(
        [call("set_cabin_temperature", celsius=45), AIMessage(content="I can't go that high.")], "make it 45", repo
    )
    assert vehicles.get(vid).state.climate.temperature_c == 21
    assert result.actions and not result.actions[0]["ok"]


@pytest.mark.anyio
async def test_reply_falls_back_to_confirmed_actions_when_model_is_silent() -> None:
    repo = InMemoryDriverRepository()
    result, _, _ = await turn([call("set_seat_heating", level=2), AIMessage(content="")], "seat heat 2", repo)
    assert result.reply == "Seat heating set to level 2."


@pytest.mark.anyio
async def test_driver_memories_are_injected_into_the_prompt_and_isolated() -> None:
    repo = InMemoryDriverRepository()
    daniel, sophia = sorted(repo.drivers.values(), key=lambda d: d.slug)
    await repo.add_memory(daniel.id, "profile", "Prefers to be called Dan.")
    await repo.add_memory(sophia.id, "profile", "Allergic to cats.")

    _, _, model = await turn([AIMessage(content="Hi Dan!")], "hello", repo, driver=daniel)
    system = next(m for m in model.seen[0] if isinstance(m, SystemMessage)).content
    assert "called Dan" in system and "Daniel" in system
    assert "cats" not in system  # Sophia's memory never reaches Daniel's context


@pytest.mark.anyio
async def test_lasting_preference_is_saved_for_this_driver_only() -> None:
    repo = InMemoryDriverRepository()
    daniel, sophia = sorted(repo.drivers.values(), key=lambda d: d.slug)
    result, _, _ = await turn(
        [call("save_preference", key="temperature_c", value="20.2"), AIMessage(content="Noted.")],
        "I always like 20 degrees", repo, driver=daniel,
    )
    assert repo.preferences[daniel.id]["temperature_c"] == 20.0
    assert repo.preferences[sophia.id]["temperature_c"] == 19.5
    assert result.memories == ["Preference temperature_c = 20.0"]


@pytest.mark.anyio
async def test_memory_policy_rejects_invalid_and_sensitive_content() -> None:
    repo = InMemoryDriverRepository()
    daniel = next(d for d in repo.drivers.values() if d.slug == "daniel")
    await turn(
        [
            call("remember", content="My bank card PIN is 1234"),
            call("save_preference", key="temperature_c", value="99"),
            call("save_preference", key="password", value="x"),
            AIMessage(content="ok"),
        ],
        "remember stuff", repo, driver=daniel,
    )
    assert repo.memories[daniel.id] == []
    assert repo.preferences[daniel.id]["temperature_c"] == 22


@pytest.mark.anyio
async def test_without_a_driver_no_memory_tools_are_offered() -> None:
    repo = InMemoryDriverRepository()
    result, _, _ = await turn([call("remember", content="Likes jazz"), AIMessage(content="ok")], "remember jazz", repo)
    assert result.memories == []
    assert all(not m for m in repo.memories.values())


@pytest.mark.anyio
async def test_model_chain_falls_back_when_the_first_model_fails() -> None:
    repo = InMemoryDriverRepository()
    broken = ScriptedModel(script=[RuntimeError("429 rate limited")], seen=[])
    working = ScriptedModel(script=[AIMessage(content="Still here.")], seen=[])
    result = await run_turn(
        models=[("groq:a", broken), ("openai:b", working)], repo=repo, vehicle_id=str(uuid.uuid4()),
        driver=None, history=[], message="hi",
    )
    assert result.reply == "Still here." and result.model == "openai:b"
