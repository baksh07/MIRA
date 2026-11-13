import { API_URL } from "./api";

let current: HTMLAudioElement | null = null;

/** Speaks text in MIRA's voice (Deepgram Aura via the backend). Interrupts anything already playing. */
export async function speak(text: string): Promise<void> {
  stopSpeaking();
  const response = await fetch(`${API_URL}/api/voice/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, 400) }),
  });
  if (!response.ok) return;
  const url = URL.createObjectURL(await response.blob());
  const audio = new Audio(url);
  current = audio;
  audio.onended = () => URL.revokeObjectURL(url);
  await audio.play().catch(() => URL.revokeObjectURL(url)); // autoplay can be refused; text is still shown
}

export function stopSpeaking(): void {
  current?.pause();
  current = null;
}
