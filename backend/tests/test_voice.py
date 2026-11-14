import json
import uuid

import pytest
from fastapi.testclient import TestClient
from pipecat.frames.frames import (
    InputAudioRawFrame,
    OutputAudioRawFrame,
    OutputTransportMessageFrame,
    TextFrame,
)
from starlette.websockets import WebSocketDisconnect

from mira_backend.main import app
from mira_backend.voice.pipeline import IN_RATE, MiraWireSerializer

client = TestClient(app)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_microphone_audio_becomes_16k_input_frames() -> None:
    frame = await MiraWireSerializer().deserialize(b"\x01\x00" * 160)
    assert isinstance(frame, InputAudioRawFrame) and frame.sample_rate == IN_RATE and frame.num_channels == 1
    assert await MiraWireSerializer().deserialize("text is ignored") is None


@pytest.mark.anyio
async def test_speech_goes_out_as_raw_pcm_and_events_as_json() -> None:
    serializer = MiraWireSerializer()
    assert await serializer.serialize(OutputAudioRawFrame(audio=b"\x02\x00", sample_rate=24000, num_channels=1)) == b"\x02\x00"
    message = await serializer.serialize(OutputTransportMessageFrame(message={"type": "status", "status": "idle"}))
    assert json.loads(message) == {"type": "status", "status": "idle"}
    assert await serializer.serialize(TextFrame("internal")) is None


def test_voice_status_reports_unconfigured_in_tests() -> None:
    assert client.get("/api/voice/status").json() == {"available": False}


def test_voice_socket_refuses_bad_ids_and_missing_configuration() -> None:
    for vid in ("not-a-uuid", str(uuid.uuid4())):
        with pytest.raises(WebSocketDisconnect), client.websocket_connect(f"/ws/voice/{vid}") as ws:
            ws.receive_text()


def test_proactive_messages_on_arrival_and_low_fuel() -> None:
    from mira_backend.models.vehicle import VehicleState
    from mira_backend.voice.pipeline import proactive_message

    driving = VehicleState()
    driving.trip.active = True
    arrived = driving.model_copy(deep=True)
    arrived.trip.active, arrived.trip.arrived_at = False, "Munich Airport"
    assert "arrived at Munich Airport" in proactive_message(driving, arrived)

    low = driving.model_copy(deep=True)
    low.fuel.level_percent = 14.9
    full = driving.model_copy(deep=True)
    full.fuel.level_percent = 15.2
    assert "fuel is down to 15 percent" in proactive_message(full, low)
    assert proactive_message(low, low) is None


def test_speak_requires_configuration_and_validates_text() -> None:
    assert client.post("/api/voice/speak", json={"text": "hello"}).status_code == 503
    assert client.post("/api/voice/speak", json={"text": ""}).status_code == 422


def test_wake_word_variants_and_request_extraction() -> None:
    from mira_backend.voice.wake import split_wake

    assert split_wake("Hey Mira, I'm cold") == (True, "I'm cold")
    assert split_wake("Meera take me to Munich.") == (True, "take me to Munich.")
    assert split_wake("Turn up the heat, Mira.") == (True, "Turn up the heat")
    assert split_wake("Mira?") == (True, "")
    assert split_wake("what a nice admiral") == (False, "what a nice admiral")
    assert split_wake("turn it up") == (False, "turn it up")


def test_briefing_mentions_driver_weather_and_traffic() -> None:
    from datetime import datetime

    from mira_backend.services.briefing import Weather, briefing_text, describe_code

    rush = datetime(2026, 11, 13, 8, 0)  # Friday morning
    text = briefing_text("Daniel", rush, Weather(14, describe_code(3)))
    assert text.startswith("Good morning, Daniel.")
    assert "14 degrees in Munich with overcast" in text and "heavy" in text
    night = briefing_text(None, datetime(2026, 11, 15, 23, 30), None)
    assert night.startswith("Good evening.") and "light" in night


def test_noise_is_not_speech_but_short_replies_are() -> None:
    from mira_backend.voice.wake import is_speech

    for noise in ["", "uh", "Hmm.", "the", "uh um"]:
        assert not is_speech(noise), noise
    for speech in ["Yes.", "stop", "Mira", "turn it down", "No, thanks"]:
        assert is_speech(speech), speech


@pytest.mark.anyio
async def test_new_speech_does_not_cancel_an_answer_in_progress(monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio

    from pipecat.frames.frames import InterimTranscriptionFrame, TranscriptionFrame, TTSSpeakFrame
    from pipecat.processors.frame_processor import FrameDirection

    from mira_backend.voice import pipeline

    started = asyncio.Event()

    class Reply:
        reply = "On our way, Daniel."
        actions: list = []
        memories: list = []

    async def slow_converse(_vehicle_id: object, _text: str, **_kw: object) -> Reply:
        started.set()
        await asyncio.sleep(0.3)
        return Reply()

    monkeypatch.setattr(pipeline, "converse", slow_converse)
    monkeypatch.setattr(pipeline, "gap_for", lambda _text: 0.01)
    brain = pipeline.MiraBrain(uuid.uuid4())
    pushed: list = []

    async def capture(frame: object, *_: object) -> None:
        pushed.append(frame)

    monkeypatch.setattr(brain, "push_frame", capture)
    monkeypatch.setattr(pipeline.FrameProcessor, "process_frame", lambda *_: asyncio.sleep(0))
    down = FrameDirection.DOWNSTREAM
    await brain.process_frame(TranscriptionFrame("Mira, how far is Munich?", "u", "t"), down)
    await asyncio.wait_for(started.wait(), 1)
    await brain.process_frame(InterimTranscriptionFrame("and also the music", "u", "t"), down)  # talking during thinking
    await asyncio.sleep(0.5)
    assert any(isinstance(f, TTSSpeakFrame) and f.text == "On our way, Daniel." for f in pushed)


def test_turn_gap_waits_when_the_driver_trails_off() -> None:
    from mira_backend.voice.wake import turn_gap

    assert turn_gap("Set it to 21 degrees, please.") < 0.5
    assert turn_gap("It depends. Like, when I'm heading to office,") > 1.5
    assert turn_gap("I prefer mostly eco and") > 1.5
    assert 0.5 < turn_gap("play some jazz") < 1.5


def test_working_phrase_is_personal_and_tool_specific() -> None:
    from mira_backend.voice.pipeline import working_phrase

    assert working_phrase(["set_cabin_temperature"], "Dan") == "Mm-hmm, adjusting the temperature for you, Dan. Just a moment."
    assert working_phrase(["get_vehicle_status"], None) == "Hmm, let me check the car."
    assert working_phrase(["unknown_tool"], "Dan") == "One moment."


def test_greeting_for_new_and_returning_drivers() -> None:
    from datetime import datetime

    from mira_backend.services.briefing import briefing_text, preferred_name

    now = datetime(2026, 11, 13, 15, 0)
    first = briefing_text("Daniel", now, None, first_drive=True)
    assert first.startswith("Hi Daniel, I'm MIRA.")
    assert "what should I call you?" in first
    back = briefing_text("Dan", now, None, returning=True)
    assert back.startswith("Good afternoon, Dan. Welcome back") and back.endswith("Just say MIRA whenever you need me.")
    assert preferred_name("Daniel", ["Enjoys jazz.", "Prefers to be called Danny."]) == "Danny"
    assert preferred_name("Daniel", []) == "Daniel"


def test_tts_uses_elevenlabs_when_configured_and_falls_back_to_deepgram() -> None:
    from pipecat.services.deepgram.tts import DeepgramTTSService
    from pipecat.services.elevenlabs.tts import ElevenLabsTTSService

    from mira_backend.core.config import Settings
    from mira_backend.voice.pipeline import make_tts

    assert isinstance(make_tts(Settings(elevenlabs_api_key="test", deepgram_api_key="dg")), ElevenLabsTTSService)
    assert isinstance(make_tts(Settings(elevenlabs_api_key="", deepgram_api_key="dg")), DeepgramTTSService)
    assert isinstance(make_tts(Settings(elevenlabs_api_key="test", tts_provider="deepgram", deepgram_api_key="dg")), DeepgramTTSService)
