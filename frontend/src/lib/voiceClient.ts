/**
 * Browser side of MIRA's voice pipeline (see backend voice/pipeline.py):
 * microphone → 16 kHz PCM16 over a WebSocket; 24 kHz PCM16 speech and JSON
 * events back. Kept dependency-free on purpose.
 */

import { WS_URL } from "./api";

export type VoiceEvent =
  | { type: "status"; status: "idle" | "thinking" | "speaking" | "listening"; seconds?: number }
  | { type: "interim"; text: string }
  | { type: "standby"; text: string }
  | { type: "user"; text: string }
  | { type: "assistant"; text: string; actions: string[]; memories: string[] }
  | { type: "interrupt" }
  | { type: "error"; message: string };

const IN_RATE = 16000;
const OUT_RATE = 24000;

// Runs on the audio thread: downsample to 16 kHz mono and convert to PCM16.
const WORKLET = `
class MicCapture extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / ${IN_RATE}; this.buffer = []; this.acc = 0; }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      this.acc += 1;
      if (this.acc >= this.ratio) { this.acc -= this.ratio; this.buffer.push(input[i]); }
    }
    if (this.buffer.length >= 320) {
      const pcm = new Int16Array(this.buffer.length);
      let peak = 0;
      for (let i = 0; i < this.buffer.length; i++) {
        const s = Math.max(-1, Math.min(1, this.buffer[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        peak = Math.max(peak, Math.abs(s));
      }
      this.port.postMessage({ pcm: pcm.buffer, level: peak }, [pcm.buffer]);
      this.buffer = [];
    }
    return true;
  }
}
registerProcessor("mic-capture", MicCapture);
`;

export interface VoiceSession {
  stop: () => void;
}

export async function startVoice(
  vehicleId: string,
  onEvent: (event: VoiceEvent) => void,
  onLevel: (level: number) => void,
): Promise<VoiceSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const context = new AudioContext();
  await context.resume();
  const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
  await context.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  const source = context.createMediaStreamSource(stream);
  const capture = new AudioWorkletNode(context, "mic-capture");
  source.connect(capture);

  const socket = new WebSocket(`${WS_URL}/ws/voice/${vehicleId}`);
  socket.binaryType = "arraybuffer";

  // Gapless playback of streamed speech; cancellable for barge-in.
  let playhead = 0;
  // After a barge-in, drop speech still in flight until MIRA's next reply.
  let muted = false;
  const playing = new Set<AudioBufferSourceNode>();
  const stopPlayback = () => {
    for (const node of playing) node.stop();
    playing.clear();
    playhead = 0;
  };
  const play = (data: ArrayBuffer) => {
    const pcm = new Int16Array(data);
    const buffer = context.createBuffer(1, pcm.length, OUT_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    playhead = Math.max(playhead, context.currentTime + 0.03);
    node.start(playhead);
    playhead += buffer.duration;
    playing.add(node);
    node.onended = () => playing.delete(node);
  };

  capture.port.onmessage = (message: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
    onLevel(message.data.level);
    if (socket.readyState === WebSocket.OPEN) socket.send(message.data.pcm);
  };

  socket.onmessage = (message) => {
    if (message.data instanceof ArrayBuffer) {
      if (!muted) play(message.data);
      return;
    }
    const event = JSON.parse(message.data as string) as VoiceEvent;
    if (event.type === "interrupt") {
      muted = true;
      stopPlayback();
    }
    if (event.type === "assistant") muted = false;
    onEvent(event);
  };
  socket.onclose = (close) => {
    if (close.code !== 1000) onEvent({ type: "error", message: close.reason || "Voice connection closed" });
  };

  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    socket.onerror = () => reject(new Error("Could not connect to MIRA's voice service"));
  });

  return {
    stop: () => {
      stopPlayback();
      socket.close(1000);
      capture.disconnect();
      source.disconnect();
      for (const track of stream.getTracks()) track.stop();
      void context.close();
    },
  };
}
