import { create } from "zustand";
import { sessionId } from "@/lib/api";
import { type VoiceEvent, type VoiceSession, startVoice } from "@/lib/voiceClient";
import { useAssistantStore } from "@/stores/assistantStore";
import { useDriverStore } from "@/stores/driverStore";

/**
 * The always-on voice session with MIRA. It opens when the driver gets in
 * ("Let's go" after recognition) and stays connected; the mic button only
 * mutes. MIRA greets the driver, then answers when called by name or right
 * after she has spoken. Transcripts land in the same chat as typed messages.
 */
interface VoiceStore {
  state: "off" | "connecting" | "on";
  muted: boolean;
  caption: string;
  level: number;
  start: () => Promise<void>;
  stop: () => void;
  toggleMute: () => void;
}

let session: VoiceSession | null = null;
let followUp: ReturnType<typeof setTimeout> | null = null;
let captionTimer: ReturnType<typeof setTimeout> | null = null;

type VoiceStatus = "standby" | "listening" | "thinking" | "speaking";

/** After MIRA speaks she listens for a few seconds; then she waits for her name again. */
function setVoiceStatus(status: VoiceStatus, seconds?: number) {
  if (followUp) clearTimeout(followUp);
  followUp = null;
  useAssistantStore.getState().setStatus(status);
  if (status === "listening" && seconds) {
    followUp = setTimeout(() => useAssistantStore.getState().setStatus("standby"), seconds * 1000);
  }
}

export const useVoiceStore = create<VoiceStore>((set, get) => {
  const showCaption = (caption: string, clearAfterMs?: number) => {
    if (captionTimer) clearTimeout(captionTimer);
    set({ caption });
    if (clearAfterMs) captionTimer = setTimeout(() => set({ caption: "" }), clearAfterMs);
  };

  const onEvent = (event: VoiceEvent) => {
    const chat = useAssistantStore.getState();
    switch (event.type) {
      case "status":
        setVoiceStatus(event.status === "idle" ? "standby" : event.status, event.seconds);
        break;
      case "interim":
        showCaption(event.text);
        break;
      case "standby":
        // Heard, but not addressed to MIRA: say so instead of silently ignoring it.
        showCaption(`“${event.text}” — say “MIRA” first so I know you mean me`, 3500);
        break;
      case "progress":
        showCaption(event.text, 4000);
        break;
      case "user":
        showCaption("");
        chat.addTurn({ role: "user", text: event.text });
        break;
      case "assistant":
        chat.addTurn({ role: "assistant", text: event.text, actions: event.actions, memories: event.memories });
        break;
      case "error":
        chat.addTurn({ role: "assistant", text: `Voice problem: ${event.message}` });
        get().stop();
        break;
    }
  };

  return {
    state: "off",
    muted: false,
    caption: "",
    level: 0,

    start: async () => {
      get().stop(); // a new driver gets a new session (and greeting)
      set({ state: "connecting", muted: false });
      try {
        session = await startVoice(sessionId(), onEvent, (l) => set((s) => ({ level: s.level * 0.6 + l * 0.4 })));
        set({ state: "on" });
        useAssistantStore.setState({ voiceOn: true });
        setVoiceStatus("thinking");
      } catch (error) {
        set({ state: "off" });
        const reason =
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Microphone access was blocked. Allow it in the address bar, or type instead."
            : error instanceof Error
              ? error.message
              : "Voice is unavailable";
        const chat = useAssistantStore.getState();
        const greeting = useDriverStore.getState().greeting;
        if (greeting) {
          chat.addTurn({ role: "assistant", text: greeting });
          chat.say(greeting); // still greet the driver, by text-to-speech
        }
        chat.addTurn({ role: "assistant", text: reason });
      }
    },

    stop: () => {
      session?.stop();
      session = null;
      if (followUp) clearTimeout(followUp);
      set({ state: "off", muted: false, caption: "", level: 0 });
      useAssistantStore.setState({ voiceOn: false });
      useAssistantStore.getState().setStatus("idle");
    },

    toggleMute: () => {
      const muted = !get().muted;
      session?.setMuted(muted);
      set({ muted, level: 0 });
    },
  };
});
