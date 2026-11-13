"""Voice: one WebSocket per conversation, handled by the Pipecat pipeline."""

from uuid import UUID

from fastapi import APIRouter, WebSocket

from mira_backend.core.config import get_settings

router = APIRouter(tags=["voice"])


@router.get("/api/voice/status")
async def voice_status() -> dict[str, bool]:
    return {"available": bool(get_settings().deepgram_api_key)}


@router.websocket("/ws/voice/{vehicle_id}")
async def voice(websocket: WebSocket, vehicle_id: str) -> None:
    try:
        vid = UUID(vehicle_id)
    except ValueError:
        await websocket.close(code=1008)
        return
    if not get_settings().deepgram_api_key:
        await websocket.close(code=1011, reason="Voice is not configured")
        return
    await websocket.accept()
    # Imported lazily: Pipecat is heavy and only needed for voice sessions.
    from mira_backend.voice.pipeline import run_voice_session

    await run_voice_session(websocket, vid)
