"use client";

import { useEffect } from "react";
import { useDriverStore } from "@/stores/driverStore";
import { useGarageStore } from "@/stores/garageStore";
import { DriverAvatar } from "./DriverAvatar";
import { DriverPanel } from "./DriverPanel";

/** Header chip showing the identified driver; opens driver recognition. */
export function DriverStatus() {
  const current = useDriverStore((state) => state.current);
  const openPanel = useDriverStore((state) => state.openPanel);
  const view = useGarageStore((state) => state.view);

  // Sitting in the car without a driver: start recognition, as the car would.
  useEffect(() => {
    if (view === "cockpit" && !useDriverStore.getState().current) useDriverStore.getState().openPanel();
  }, [view]);

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="pointer-events-auto flex items-center gap-2 rounded-full py-1 pr-1 pl-3 text-sm text-brushed transition-colors hover:text-halogen"
      >
        {current ? (
          <>
            <span className="text-halogen">{current.display_name}</span>
            <DriverAvatar gender={current.gender} className="size-7 rounded-full bg-floor/70 p-0.5 text-ambient" />
          </>
        ) : (
          <>
            <span aria-hidden="true" className="size-2 rounded-full border border-brushed" />
            Select driver
          </>
        )}
      </button>
      <DriverPanel />
    </>
  );
}
