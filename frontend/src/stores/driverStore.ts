import { create } from "zustand";
import { API_URL, postJson, sessionId } from "@/lib/api";
import { useAssistantStore } from "@/stores/assistantStore";
import type { Driver, SessionStarted } from "@/types/driver";

/** How long the (simulated) face scan runs before the result is shown. */
export const SCAN_MS = 2600;

export type RecognitionStatus = "idle" | "scanning" | "identified" | "failed";

interface DriverStore {
  drivers: Driver[];
  current: Driver | null;
  status: RecognitionStatus;
  /** Driver being scanned or just identified. */
  candidate: Driver | null;
  /** What the car changed to match the identified driver (confirmed by the backend). */
  applied: string[];
  greeting: string | null;
  error: string | null;
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  loadDrivers: () => Promise<void>;
  identify: (driver: Driver) => Promise<void>;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const useDriverStore = create<DriverStore>()((set, get) => ({
  drivers: [],
  current: null,
  status: "idle",
  candidate: null,
  applied: [],
  greeting: null,
  error: null,
  panelOpen: false,

  openPanel: () => {
    set({ panelOpen: true, status: get().current ? "identified" : "idle", error: null });
    if (get().drivers.length === 0) void get().loadDrivers();
  },
  closePanel: () => set({ panelOpen: false, status: get().current ? "identified" : "idle" }),

  loadDrivers: async () => {
    try {
      const response = await fetch(`${API_URL}/api/drivers`);
      if (!response.ok) throw new Error(`Could not load drivers (${response.status})`);
      set({ drivers: (await response.json()) as Driver[], error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Could not load drivers" });
    }
  },

  /**
   * Simulated recognition: the scan animation runs while the backend binds the
   * driver to this car and applies their preferences. The result is only shown
   * once both have finished, so nothing claims success early.
   */
  identify: async (driver) => {
    set({ status: "scanning", candidate: driver, error: null, applied: [], greeting: null });
    try {
      const [result] = await Promise.all([
        postJson<SessionStarted>("/api/sessions", { vehicle_id: sessionId(), driver_id: driver.id }),
        wait(SCAN_MS),
      ]);
      set({ status: "identified", current: result.driver, applied: result.applied, greeting: result.greeting });
      useAssistantStore.getState().say(result.greeting);
    } catch (error) {
      set({ status: "failed", error: error instanceof Error ? error.message : "Recognition failed" });
    }
  },
}));
