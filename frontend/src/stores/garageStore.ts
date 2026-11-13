import { create } from "zustand";

export type DoorSide = "left" | "right";

/**
 * Where the visitor is. `entering` and `exiting` are camera moves between the
 * garage view and the driver's seat.
 *
 * Door state is not kept here: doors are vehicle signals owned by the backend
 * simulator (see vehicleStore).
 */
export type GarageView = "exterior" | "entering" | "cockpit" | "exiting";

export interface GarageState {
  view: GarageView;
  /** The visitor has taken control (dragged, or reached for a hotspot); the turntable stops. */
  interacted: boolean;
  markInteracted: () => void;
  /** The opening camera shot is playing (controls are released while it runs). */
  intro: boolean;
  endIntro: () => void;
  /** Start the move into the driver's seat. */
  enterCockpit: () => void;
  /** Start the move back out to the garage view. */
  exitCockpit: () => void;
  /** Called by the camera rig when a move finishes. Returns the view it finished into. */
  finishTransition: () => GarageView;
}

/** The driver sits on the car's left (+x) side. */
export const DRIVER_SIDE: DoorSide = "left";

export const useGarageStore = create<GarageState>()((set, get) => ({
  view: "exterior",
  interacted: false,
  intro: true,

  endIntro: () => set({ intro: false }),

  markInteracted: () => set((state) => (state.interacted ? state : { interacted: true })),

  enterCockpit: () => set((state) => (state.view === "exterior" ? { view: "entering", interacted: true } : state)),

  exitCockpit: () => set((state) => (state.view === "cockpit" ? { view: "exiting" } : state)),

  finishTransition: () => {
    const { view } = get();
    if (view === "entering") set({ view: "cockpit" });
    if (view === "exiting") set({ view: "exterior" });
    return get().view;
  },
}));
