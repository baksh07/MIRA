import { create } from "zustand";
import { postJson, sessionId } from "@/lib/api";

export interface ChatTurn {
  id: number;
  role: "user" | "assistant";
  text: string;
  /** Confirmed changes the assistant made in this turn. */
  actions?: string[];
  memories?: string[];
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
  setStatus: (status: AssistantStatus) => void;
  addTurn: (turn: Omit<ChatTurn, "id">) => void;
  /** Sends a typed message; the reply appears once the backend has answered. */
  ask: (text: string) => Promise<ChatResponse | null>;
}

let nextId = 1;

export const useAssistantStore = create<AssistantStore>()((set, get) => ({
  turns: [],
  status: "idle",
  error: null,
  voiceOn: false,

  setStatus: (status) => set({ status }),

  addTurn: (turn) => set((state) => ({ turns: [...state.turns.slice(-30), { ...turn, id: nextId++ }] })),

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
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "MIRA is unavailable";
      get().addTurn({ role: "assistant", text: `Sorry, I couldn't reach the car's assistant (${reason}).` });
      set({ status: "error", error: reason });
      return null;
    }
  },
}));
