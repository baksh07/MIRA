"""MIRA's voice pipeline (Pipecat).

    browser mic ─PCM16─▶ WebSocket ─▶ Deepgram STT ─▶ MiraBrain ─▶ Deepgram TTS ─▶ WebSocket ─PCM16─▶ speaker
                                                          │
                                                 converse() = the LangGraph agent

Pipecat owns audio and transport; the agent owns understanding and actions
(the same `converse` the text chat uses). The wire protocol is deliberately
small so the browser client stays tiny:

  client → server   binary: 16 kHz mono PCM16 microphone audio
  server → client   binary: 24 kHz mono PCM16 speech
                    text:   JSON events {type: status|interim|user|standby|assistant|interrupt|error, ...}

MIRA greets the driver with a short briefing (weather, traffic) when the
session opens, then answers when addressed by name ("MIRA, …") or within a
short follow-up window after she spoke. Anything else is reported as
`standby` (heard, not for her) and ignored.
"""

import asyncio
import json
import logging
import time
from uuid import UUID

from fastapi import HTTPException, WebSocket
from pipecat.frames.frames import (
    BotStartedSpeakingFrame,
    BotStoppedSpeakingFrame,
    Frame,
    InputAudioRawFrame,
    InterimTranscriptionFrame,
    OutputAudioRawFrame,
    OutputTransportMessageFrame,
    TranscriptionFrame,
    TTSSpeakFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.serializers.base_serializer import FrameSerializer
from pipecat.services.deepgram.stt import DeepgramSTTService, LiveOptions
from pipecat.services.deepgram.tts import DeepgramTTSService
from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketParams,
    FastAPIWebsocketTransport,
)

from mira_backend.api.assistant import converse
from mira_backend.core.config import get_settings
from mira_backend.models.vehicle import VehicleState
from mira_backend.services.briefing import briefing
from mira_backend.services.container import container
from mira_backend.services.vehicle_simulator import vehicles
from mira_backend.voice.wake import FOLLOW_UP_SECONDS, is_speech, split_wake

logger = logging.getLogger(__name__)

IN_RATE = 16_000
OUT_RATE = 24_000
# Deepgram may split one spoken request into several final segments; wait this
# long after the last one before answering.
TURN_GAP_SECONDS = 0.8


class MiraWireSerializer(FrameSerializer):
    """Raw PCM16 audio both ways, plus JSON events (see module docstring)."""

    async def serialize(self, frame: Frame) -> str | bytes | None:
        if isinstance(frame, OutputAudioRawFrame):
            return frame.audio
        if isinstance(frame, OutputTransportMessageFrame):
            return json.dumps(frame.message)
        return None

    async def deserialize(self, data: str | bytes) -> Frame | None:
        if isinstance(data, bytes) and data:
            return InputAudioRawFrame(audio=data, sample_rate=IN_RATE, num_channels=1)
        return None


def event(kind: str, **fields: object) -> OutputTransportMessageFrame:
    return OutputTransportMessageFrame(message={"type": kind, **fields})


class MiraBrain(FrameProcessor):
    """Turns finished utterances into agent turns and the replies into speech."""

    def __init__(self, vehicle_id: UUID) -> None:
        super().__init__()
        self._vehicle_id = vehicle_id
        self._parts: list[str] = []
        self._pending: asyncio.Task[None] | None = None
        self._bot_speaking = False
        self._awake_until = 0.0
        self._turns = asyncio.Lock()  # one agent turn at a time, in order

    def wake(self) -> None:
        """Open the follow-up window: the driver may answer without saying "MIRA"."""
        self._awake_until = time.monotonic() + FOLLOW_UP_SECONDS

    @property
    def awake(self) -> bool:
        return self._bot_speaking or time.monotonic() < self._awake_until

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame):
            if is_speech(frame.text):
                self._parts.append(frame.text.strip())
                self._schedule()
            return
        if isinstance(frame, InterimTranscriptionFrame):
            if is_speech(frame.text):
                await self.push_frame(event("interim", text=frame.text.strip()))
                if self._bot_speaking:
                    # Barge-in: the driver talks over MIRA. Cancel her speech in the
                    # pipeline (TTS stops generating) and tell the client to stop playback.
                    self._bot_speaking = False
                    asyncio.create_task(self.broadcast_interruption())
                    await self.push_frame(event("interrupt"))
                if self._pending:
                    self._pending.cancel()  # still talking: wait for the end of the utterance
            return
        if isinstance(frame, BotStartedSpeakingFrame):
            self._bot_speaking = True
            await self.push_frame(event("status", status="speaking"))
        elif isinstance(frame, BotStoppedSpeakingFrame):
            self._bot_speaking = False
            self.wake()
            await self.push_frame(event("status", status="listening", seconds=FOLLOW_UP_SECONDS))
        await self.push_frame(frame, direction)

    def _schedule(self) -> None:
        if self._pending:
            self._pending.cancel()
        self._pending = asyncio.create_task(self._respond_after_gap())

    async def _respond_after_gap(self) -> None:
        # Only this short wait is cancellable (the driver is still talking).
        try:
            await asyncio.sleep(TURN_GAP_SECONDS)
        except asyncio.CancelledError:
            return
        text = " ".join(self._parts).strip()
        self._parts.clear()
        self._pending = None
        if text:
            # The turn itself runs on its own task: new speech must never cancel
            # an answer that is already being worked on.
            asyncio.create_task(self._take_turn(text))

    async def _take_turn(self, text: str) -> None:
        async with self._turns:
            await self._respond(text)

    async def _respond(self, text: str) -> None:
        addressed, request = split_wake(text)
        if not addressed and not self.awake:
            await self.push_frame(event("standby", text=text))
            return
        await self.push_frame(event("user", text=text))
        if not request:
            session = container().sessions.current(self._vehicle_id)
            reply = f"Yes, {session.driver.display_name}?" if session else "Yes?"
            await self.push_frame(event("assistant", text=reply, actions=[], memories=[]))
            await self.push_frame(TTSSpeakFrame(reply))
            return
        self._awake_until = float("inf")  # stay engaged while thinking
        await self.push_frame(event("status", status="thinking"))
        try:
            result = await converse(self._vehicle_id, request[:500])
            await self.push_frame(
                event("assistant", text=result.reply, actions=[a["message"] for a in result.actions if a["ok"]], memories=result.memories)
            )
            await self.push_frame(TTSSpeakFrame(result.reply))
        except Exception as error:  # noqa: BLE001 - always answer, never leave the driver hanging
            self.wake()
            detail = error.detail if isinstance(error, HTTPException) else "Sorry, I lost my train of thought. Could you say that again?"
            logger.warning("voice turn failed: %s", type(error).__name__)
            await self.push_frame(event("assistant", text=str(detail), actions=[], memories=[]))
            await self.push_frame(TTSSpeakFrame(str(detail)))


LOW_FUEL_PERCENT = 15


def proactive_message(before: VehicleState, after: VehicleState) -> str | None:
    """Things MIRA says without being asked, from confirmed state changes."""
    if after.trip.arrived_at and not before.trip.arrived_at:
        return f"We've arrived at {after.trip.arrived_at}. Hope you enjoyed the drive."
    if after.fuel.level_percent < LOW_FUEL_PERCENT <= before.fuel.level_percent:
        return f"Heads up: fuel is down to {after.fuel.level_percent:.0f} percent, about {after.fuel.range_km} kilometres of range."
    if before.trip.active and not after.trip.active and not after.trip.arrived_at and after.fuel.level_percent <= 0:
        return "We've run out of fuel, so I've stopped the car."
    return None


async def watch_vehicle(vehicle_id: UUID, task: "PipelineTask") -> None:
    car = vehicles.get(str(vehicle_id))
    before = car.state
    async with car.subscribe() as updates:
        while True:
            after = await updates.get()
            message = proactive_message(before, after)
            before = after
            if message:
                await task.queue_frames([event("assistant", text=message, actions=[], memories=[]), TTSSpeakFrame(message)])


async def run_voice_session(websocket: WebSocket, vehicle_id: UUID) -> None:
    settings = get_settings()
    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_in_sample_rate=IN_RATE,
            audio_out_enabled=True,
            audio_out_sample_rate=OUT_RATE,
            add_wav_header=False,
            serializer=MiraWireSerializer(),
            session_timeout=15 * 60,
        ),
    )
    stt = DeepgramSTTService(
        api_key=settings.deepgram_api_key,
        sample_rate=IN_RATE,
        live_options=LiveOptions(
            model=settings.deepgram_stt_model, language="en-US", smart_format=True,
            punctuate=True, interim_results=True, endpointing=500,
            keyterm=["MIRA"],  # boost her name so the wake word is heard reliably
        ),
    )
    tts = DeepgramTTSService(api_key=settings.deepgram_api_key, voice=settings.deepgram_tts_voice, sample_rate=OUT_RATE)
    brain = MiraBrain(vehicle_id)
    pipeline = Pipeline([transport.input(), stt, brain, tts, transport.output()])
    task = PipelineTask(
        pipeline,
        params=PipelineParams(audio_in_sample_rate=IN_RATE, audio_out_sample_rate=OUT_RATE),
        idle_timeout_secs=10 * 60,
    )

    @transport.event_handler("on_client_connected")
    async def on_connected(_transport: object, _client: object) -> None:
        services = container()
        session = services.sessions.current(vehicle_id)
        text = await briefing(session.driver.display_name if session else None)
        if session and session.onboarding and not await services.repo.list_memories(session.driver.id, limit=1):
            # Still getting to know a new driver: lead with the first onboarding question.
            text = text.replace("Just say MIRA whenever you need me.", "Since this is our first drive, what should I call you?")
        if session:
            await services.repo.add_message(session.id, "assistant", text)
        brain.wake()
        await task.queue_frames([event("assistant", text=text, actions=[], memories=[]), TTSSpeakFrame(text)])

    @transport.event_handler("on_client_disconnected")
    async def on_disconnected(_transport: object, _client: object) -> None:
        await task.cancel()

    logger.info("voice session started for vehicle %s", str(vehicle_id)[:8])
    watcher = asyncio.create_task(watch_vehicle(vehicle_id, task))
    try:
        await PipelineRunner(handle_sigint=False).run(task)
    finally:
        watcher.cancel()
    logger.info("voice session ended for vehicle %s", str(vehicle_id)[:8])
