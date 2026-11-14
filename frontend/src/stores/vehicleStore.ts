import { create } from "zustand";
import { postJson, sessionId, WS_URL } from "@/lib/api";
import type { CommandResult, VehicleCommand, VehicleState } from "@/types/vehicle";

export type Connection = "connecting" | "live" | "offline";

interface VehicleStore {
  vehicleId: string | null;
  /** The last state the backend confirmed. Never set optimistically. */
  state: VehicleState | null;
  connection: Connection;
  connect: () => () => void;
  /** Sends a command; the store updates only from the confirmed result. */
  send: (command: VehicleCommand) => Promise<CommandResult>;
}

const RETRY_MS = [1000, 2000, 5000, 10000];

export const useVehicleStore = create<VehicleStore>()((set, get) => ({
  vehicleId: null,
  state: null,
  connection: "connecting",

  connect: () => {
    const vehicleId = get().vehicleId ?? sessionId();
    set({ vehicleId });
    let socket: WebSocket | null = null;
    let attempt = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const open = () => {
      socket = new WebSocket(`${WS_URL}/ws/vehicles/${vehicleId}`);
      socket.onopen = () => {
        attempt = 0;
      };
      socket.onmessage = (event) => {
        const state = JSON.parse(event.data) as VehicleState;
        // Ignore stale updates that arrive out of order.
        if ((get().state?.version ?? -1) <= state.version || state.version === 0) set({ state, connection: "live" });
      };
      socket.onclose = () => {
        if (stopped) return;
        set({ connection: "offline" });
        timer = setTimeout(open, RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)]);
      };
    };
    open();

    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  },

  send: async (command) => {
    const vehicleId = get().vehicleId ?? sessionId();
    const result = await postJson<CommandResult>(`/api/vehicles/${vehicleId}/commands`, command);
    if ((get().state?.version ?? -1) < result.state.version) set({ state: result.state, connection: "live" });
    return result;
  },
}));
