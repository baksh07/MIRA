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
