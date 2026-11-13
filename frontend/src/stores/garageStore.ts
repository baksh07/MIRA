import { create } from "zustand";

export type DoorSide = "left" | "right";

/**
 * Where the visitor is. `entering` and `exiting` are camera moves between the
 * garage view and the driver's seat.
 */
export type GarageView = "exterior" | "entering" | "cockpit" | "exiting";

export interface GarageState {
  view: GarageView;
  /**
   * Visual door state for exploring the model. This is presentation only: when
   * the vehicle simulator lands (Phase 6) it becomes the authority for door
   * state and this store will mirror confirmed updates instead.
   */
  doors: Record<DoorSide, boolean>;
  /** The visitor has taken control (dragged, or reached for a hotspot); the turntable stops. */
  interacted: boolean;
  markInteracted: () => void;
  toggleDoor: (side: DoorSide) => void;
  /** Start the move into the driver's seat (opens the driver's door if needed). */
  enterCockpit: () => void;
  /** Start the move back out to the garage view. */
  exitCockpit: () => void;
  /** Called by the camera rig when a move finishes. */
  finishTransition: () => void;
}

/** The driver sits on the car's left (+x) side. */
export const DRIVER_SIDE: DoorSide = "left";

export const useGarageStore = create<GarageState>()((set) => ({
  view: "exterior",
  doors: { left: false, right: false },
  interacted: false,

  markInteracted: () => set((state) => (state.interacted ? state : { interacted: true })),

  toggleDoor: (side) =>
    set((state) =>
      state.view === "exterior" ? { interacted: true, doors: { ...state.doors, [side]: !state.doors[side] } } : state,
    ),

  enterCockpit: () =>
    set((state) =>
      state.view === "exterior" ? { view: "entering", doors: { ...state.doors, [DRIVER_SIDE]: true } } : state,
    ),

  exitCockpit: () => set((state) => (state.view === "cockpit" ? { view: "exiting" } : state)),

  finishTransition: () =>
    set((state) => {
      // Once seated, the driver's door swings shut behind you.
      if (state.view === "entering") return { view: "cockpit", doors: { ...state.doors, [DRIVER_SIDE]: false } };
      if (state.view === "exiting") return { view: "exterior" };
      return state;
    }),
}));