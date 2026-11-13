"use client";

import { Html } from "@react-three/drei";
import { createPortal, useFrame } from "@react-three/fiber";
import { Fragment, useRef, useState } from "react";
import type { Vector3 } from "three";
import type { CarRig } from "@/components/vehicle/carRig";
import { DRIVER_SIDE, type DoorSide, useGarageStore } from "@/stores/garageStore";
import { useVehicleStore } from "@/stores/vehicleStore";

/**
 * How far (m) to the side of the car the camera must be before that side's
 * hotspots show. The car sits at the origin, unrotated, with its left side at +x.
 */
const SIDE_VISIBILITY = 0.6;
const HTML_WRAPPER_STYLE = { pointerEvents: "none" } as const;

interface HotspotProps {
  position: Vector3;
  /** Which side of the car the hotspot sits on; it hides while that side faces away. */
  side: DoorSide;
  label: string;
  /** Which side of the dot the label sits on. */
  labelSide?: "left" | "right";
  /** Shown only while this returns true (read each frame from the store). */
  isAvailable: () => boolean;
  onPress: () => void;
}

/**
 * A focusable button pinned to a point on the car. Visibility is applied to the
 * DOM node each frame rather than through React state, so the frame loop never
 * re-renders React.
 */
function Hotspot({ position, side, label, labelSide = "right", isAvailable, onPress }: HotspotProps) {
  const wrapper = useRef<HTMLDivElement>(null);

  useFrame(({ camera }) => {
    const el = wrapper.current;
    if (!el) return;
    const x = camera.position.x;
    const facing = side === "left" ? x > SIDE_VISIBILITY : x < -SIDE_VISIBILITY;
    const show = String(facing && isAvailable());
    if (el.dataset.show !== show) {
      el.dataset.show = show;
      el.style.visibility = show === "true" ? "visible" : "hidden";
      el.style.opacity = show === "true" ? "1" : "0";
    }
  });

  return (
    // drei's positioned wrapper must never take clicks, or a hidden hotspot blocks a
    // visible one beneath it (the `pointerEvents` prop only applies in transform mode).
    <Html position={position} center zIndexRange={[10, 0]} style={HTML_WRAPPER_STYLE}>
      <div
        ref={wrapper}
        data-show="false"
        style={{ visibility: "hidden", opacity: 0 }}
        className="pointer-events-auto transition-opacity duration-300"
      >
        <button
          type="button"
          onClick={onPress}
          // The hotspot sits inside the orbit controls' event source; don't let a press start a drag.
          onPointerDown={(event) => event.stopPropagation()}
          // Reaching for a hotspot stops the turntable, so the target holds still.
          onPointerEnter={() => useGarageStore.getState().markInteracted()}
          onFocus={() => useGarageStore.getState().markInteracted()}
          className={`group flex items-center gap-2 rounded-full outline-offset-4 ${labelSide === "left" ? "flex-row-reverse" : ""}`}
        >
          <span className="grid size-7 place-items-center rounded-full border border-ambient/70 bg-floor/60 backdrop-blur-sm transition-colors group-hover:bg-ambient/25">
            <span className="size-2 rounded-full bg-ambient shadow-[0_0_10px_2px_var(--color-ambient)]" />
          </span>
          <span className="rounded-full bg-floor/75 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-halogen backdrop-blur-sm">
            {label}
          </span>
        </button>
      </div>
    </Html>
  );
}

/** Door hotspots (riding on each door) and the get-in hotspot in the driver's doorway. */
export function CarHotspots({ rig }: { rig: CarRig }) {
  // Doors are vehicle signals: the hotspot asks the simulator, and the door moves
  // only once the confirmed state comes back.
  const doors = useVehicleStore((state) => state.state?.doors);
  const send = useVehicleStore((state) => state.send);
  const enterCockpit = useGarageStore((state) => state.enterCockpit);
  const [pending, setPending] = useState<DoorSide | null>(null);

  const isOpen = (side: DoorSide) => (side === "left" ? doors?.left_open : doors?.right_open) ?? false;
  const toggleDoor = async (side: DoorSide) => {
    useGarageStore.getState().markInteracted();
    setPending(side);
    try {
      await send({ type: "set_door", door: side, open: !isOpen(side) });
    } catch (error) {
      console.warn("Door command failed", error);
    } finally {
      setPending(null);
    }
  };

  const inGarage = () => useGarageStore.getState().view === "exterior" && useVehicleStore.getState().state !== null;
  const driverDoorOpen = () => inGarage() && (useVehicleStore.getState().state?.doors.left_open ?? false);

  return (
    <>
      {(["left", "right"] as const).map((side) => {
        const { pivot, handle } = rig.doors[side];
        // Rendered inside the hinge pivot, so the position is relative to it.
        return (
          <Fragment key={side}>
            {createPortal(
              <Hotspot
                side={side}
                position={handle.clone().sub(pivot.position)}
                label={pending === side ? "…" : isOpen(side) ? "Close door" : "Open door"}
                isAvailable={inGarage}
                onPress={() => toggleDoor(side)}
              />,
              pivot,
            )}
          </Fragment>
        );
      })}
      <Hotspot
        side={DRIVER_SIDE}
        position={rig.seat.getIn}
        label="Get in"
        labelSide="left"
        isAvailable={driverDoorOpen}
        onPress={enterCockpit}
      />
    </>
  );
}
