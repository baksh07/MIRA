import { create } from "zustand";
import { API_URL, postJson, sessionId } from "@/lib/api";
import type { HabitOffer } from "@/lib/habits";
import { speak, stopSpeaking } from "@/lib/speech";

export interface ChatTurn {
  id: number;
  role: "user" | "assistant";
  text: string;
  /** Confirmed changes the assistant made in this turn. */
  actions?: string[];
  memories?: string[];
  /** A habit MIRA offers to remember; cleared once answered. */
  offer?: HabitOffer;
}

export type AssistantStatus = "idle" | "listening" | "thinking" | "speaking" | "error";

interface ChatResponse {
  reply: string;
  actions: Array<{ tool: string; ok: boolean; message: string }>;
  memories: string[];
  model: string | null;
}

interface AssistantStore {
  turns: ChatTurn[];
  status: AssistantStatus;
  error: string | null;
  /** A voice session is open (MIRA then speaks proactive notices herself). */
  voiceOn: boolean;
  /** Read typed replies and notices aloud (when no voice session is open). */
  speakReplies: boolean;
  toggleSpeakReplies: () => void;
  /** Says something in MIRA's voice if spoken replies are on. */
  say: (text: string) => void;
  setStatus: (status: AssistantStatus) => void;
  addTurn: (turn: Omit<ChatTurn, "id">) => void;
  /** Saves an offered habit as the driver's preference (confirmed by the backend). */
  acceptOffer: (turnId: number) => Promise<void>;
  dismissOffer: (turnId: number) => void;
  /** Sends a typed message; the reply appears once the backend has answered. */
  ask: (text: string) => Promise<ChatResponse | null>;
}

let nextId = 1;

export const useAssistantStore = create<AssistantStore>()((set, get) => ({
  turns: [],
  status: "idle",
  error: null,
  voiceOn: false,
  speakReplies: true,

  toggleSpeakReplies: () => {
    if (get().speakReplies) stopSpeaking();
    set({ speakReplies: !get().speakReplies });
  },

  say: (text) => {
    if (get().speakReplies && !get().voiceOn) void speak(text).catch(() => undefined);
  },

  setStatus: (status) => set({ status }),

  addTurn: (turn) => set((state) => ({ turns: [...state.turns.slice(-30), { ...turn, id: nextId++ }] })),

  acceptOffer: async (turnId) => {
    const turn = get().turns.find((t) => t.id === turnId);
    if (!turn?.offer) return;
    const { key, value } = turn.offer;
    get().dismissOffer(turnId);
    try {
      const response = await fetch(`${API_URL}/api/sessions/${sessionId()}/preferences/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!response.ok) throw new Error(String(response.status));
      get().addTurn({ role: "assistant", text: "Done. I'll set it up that way next time.", memories: [`Preference ${key} = ${value}`] });
      get().say("Done. I'll set it up that way next time.");
    } catch {
      get().addTurn({ role: "assistant", text: "Sorry, I couldn't save that preference." });
    }
  },

  dismissOffer: (turnId) =>
    set((state) => ({ turns: state.turns.map((t) => (t.id === turnId ? { ...t, offer: undefined } : t)) })),

  ask: async (text) => {
    const message = text.trim();
    if (!message || get().status === "thinking") return null;
    get().addTurn({ role: "user", text: message });
    set({ status: "thinking", error: null });
    try {
      const result = await postJson<ChatResponse>("/api/assistant/chat", { vehicle_id: sessionId(), message });
      get().addTurn({
        role: "assistant",
        text: result.reply,
        actions: result.actions.filter((a) => a.ok).map((a) => a.message),
        memories: result.memories,
      });
      set({ status: "idle" });
      get().say(result.reply);
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "MIRA is unavailable";
      get().addTurn({ role: "assistant", text: `Sorry, I couldn't reach the car's assistant (${reason}).` });
      set({ status: "error", error: reason });
      return null;
    }
  },
}));
