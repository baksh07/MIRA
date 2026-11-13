"""Voice: one WebSocket per conversation, handled by the Pipecat pipeline."""

from uuid import UUID

import httpx
from fastapi import APIRouter, HTTPException, Request, Response, WebSocket
from pydantic import BaseModel, Field

from mira_backend.core.config import get_settings
from mira_backend.core.limits import client_ip, speak_limit, voice_sessions

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
    ip = client_ip(websocket)
    if not voice_sessions.acquire(ip):
        await websocket.close(code=1013, reason="Too many voice sessions open; close another tab")
        return
    try:
        await websocket.accept()
        # Imported lazily: Pipecat is heavy and only needed for voice sessions.
        from mira_backend.voice.pipeline import run_voice_session

        await run_voice_session(websocket, vid)
    finally:
        voice_sessions.release(ip)


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=400)


@router.post("/api/voice/speak", response_class=Response, responses={200: {"content": {"audio/mpeg": {}}}})
async def speak(body: SpeakRequest, request: Request) -> Response:
    """MIRA's voice for typed replies and greetings (Deepgram Aura, MP3)."""
    speak_limit.check(client_ip(request))
    settings = get_settings()
    if not settings.deepgram_api_key:
        raise HTTPException(status_code=503, detail="Voice is not configured")
    async with httpx.AsyncClient(timeout=20) as client:
        reply = await client.post(
            "https://api.deepgram.com/v1/speak",
            params={"model": settings.deepgram_tts_voice, "encoding": "mp3"},
            headers={"Authorization": f"Token {settings.deepgram_api_key}"},
            json={"text": body.text},
        )
    if reply.status_code != 200:
        raise HTTPException(status_code=502, detail="Speech service unavailable")
    return Response(content=reply.content, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
