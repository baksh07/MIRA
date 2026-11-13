import json
import uuid

import pytest
from fastapi.testclient import TestClient
from pipecat.frames.frames import InputAudioRawFrame, OutputAudioRawFrame, OutputTransportMessageFrame, TextFrame
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
