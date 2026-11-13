"""Talk to MIRA (text). The voice pipeline uses the same `converse` function."""

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from mira_backend.agent.graph import run_turn
from mira_backend.agent.llm import chat_models
from mira_backend.core.config import get_settings
from mira_backend.services.container import container

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


async def converse(vehicle_id: UUID, message: str) -> ChatResponse:
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
        )
    except RuntimeError as error:
        logger.error("assistant turn failed: %s", error)
        raise HTTPException(status_code=503, detail="MIRA can't reach her language models right now") from error

    if session:
        await services.repo.add_message(session.id, "user", message)
        await services.repo.add_message(session.id, "assistant", result.reply)
    else:
        bucket = _anonymous_history.setdefault(str(vehicle_id), [])
        bucket += [{"role": "user", "content": message}, {"role": "assistant", "content": result.reply}]
        del bucket[:-16]
    logger.info("assistant [%s] actions=%d memories=%d", result.model, len(result.actions), len(result.memories))
    return ChatResponse(reply=result.reply, actions=result.actions, memories=result.memories, model=result.model)


@router.post("/api/assistant/chat", response_model=ChatResponse)
async def chat(body: ChatRequest) -> ChatResponse:
    return await converse(body.vehicle_id, body.message.strip())
