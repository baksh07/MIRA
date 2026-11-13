"""Talk to MIRA (text). The voice pipeline uses the same `converse` function."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from mira_backend.agent.graph import ONBOARDING_TOPICS, run_turn
from mira_backend.agent.llm import chat_models
from mira_backend.core.config import get_settings
from mira_backend.core.limits import chat_limit, client_ip
from mira_backend.models.driver import SessionRecord
from mira_backend.services.briefing import preferred_name
from mira_backend.services.container import container
from mira_backend.services.vehicle_simulator import vehicles

logger = logging.getLogger(__name__)
router = APIRouter(tags=["assistant"])

# Conversation of cars with no identified driver (not persisted).
_anonymous_history: dict[str, list[dict[str, str]]] = {}


class ChatRequest(BaseModel):
    vehicle_id: UUID
    message: str = Field(min_length=1, max_length=500)


class ChatResponse(BaseModel):
    reply: str
    actions: list[dict[str, Any]]
    memories: list[str]
    model: str | None


_background: set[asyncio.Task[None]] = set()


def _persist(add_message: Callable[[UUID, str, str], Awaitable[None]], session_id: UUID, user: str, reply: str) -> None:
    async def write() -> None:
        try:
            await add_message(session_id, "user", user)
            await add_message(session_id, "assistant", reply)
        except Exception:  # noqa: BLE001 - history is best-effort; never break the conversation
            logger.warning("could not save conversation history", exc_info=True)

    task = asyncio.create_task(write())
    _background.add(task)
    task.add_done_callback(_background.discard)


def advance_session(session: SessionRecord, vehicle_id: UUID, memories: list[str], stop_onboarding: bool) -> None:
    """After a turn: learn the driver's preferred name and move the first-drive questions on.

    Each question is asked once: whether the driver answered it or went off on
    something else, the next turn moves to the next one. Driving off, or asking
    to stop, ends the questions for this drive.
    """
    for memory in memories:
        name = preferred_name(session.driver.display_name, [memory])
        if name != session.driver.display_name:
            session.call_me = name
    if not session.onboarding:
        return
    session.onboarding_step += 1
    car = vehicles.get(str(vehicle_id)).state
    if stop_onboarding or session.onboarding_step >= len(ONBOARDING_TOPICS) or car.trip.active or not car.in_garage:
        session.onboarding = False


async def converse(
    vehicle_id: UUID, message: str, on_tools: Callable[[list[str]], Awaitable[None]] | None = None
) -> ChatResponse:
    models = chat_models(get_settings())
    if not models:
        raise HTTPException(status_code=503, detail="MIRA's language model is not configured")
    services = container()
    session = services.sessions.current(vehicle_id)
    if session:
        history = await services.repo.recent_messages(session.id, limit=8)
    else:
        history = _anonymous_history.setdefault(str(vehicle_id), [])[-8:]

    try:
        result = await run_turn(
            models=models, repo=services.repo, vehicle_id=str(vehicle_id),
            driver=session.driver if session else None, history=history, message=message,
            onboarding_step=session.onboarding_step if session and session.onboarding else None,
            call_me=session.call_me if session else None, on_tools=on_tools,
        )
    except RuntimeError as error:
        logger.error("assistant turn failed: %s", error)
        raise HTTPException(status_code=503, detail="MIRA can't reach her language models right now") from error

    if session:
        advance_session(session, vehicle_id, result.memories, result.stop_onboarding)
        # Saved off the reply path so the driver hears MIRA sooner; written in order.
        _persist(services.repo.add_message, session.id, message, result.reply)
    else:
        bucket = _anonymous_history.setdefault(str(vehicle_id), [])
        bucket += [{"role": "user", "content": message}, {"role": "assistant", "content": result.reply}]
        del bucket[:-16]
    logger.info("assistant [%s] actions=%d memories=%d", result.model, len(result.actions), len(result.memories))
    return ChatResponse(reply=result.reply, actions=result.actions, memories=result.memories, model=result.model)


@router.post("/api/assistant/chat", response_model=ChatResponse)
async def chat(body: ChatRequest, request: Request) -> ChatResponse:
    chat_limit.check(client_ip(request))
    return await converse(body.vehicle_id, body.message.strip())
