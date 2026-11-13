"use client";

import { type ReactNode, useEffect, useState } from "react";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { useGarageStore } from "@/stores/garageStore";
import { CenterDisplay } from "./CenterDisplay";
import { InstrumentCluster } from "./InstrumentCluster";

/** Everything shown while seated: cluster, centre display and MIRA. */
export function CockpitHud({ voice }: { voice?: ReactNode }) {
  const view = useGarageStore((state) => state.view);
  const exitCockpit = useGarageStore((state) => state.exitCockpit);
  const [controlsOpen, setControlsOpen] = useState(false);

  useEffect(() => {
    if (view !== "cockpit") return;
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (event.key === "Escape" && !typing) exitCockpit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, exitCockpit]);

  if (view !== "cockpit") return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col px-4 pt-20 pb-4 sm:px-8 sm:pb-6">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={exitCockpit}
          className="glass pointer-events-auto rounded-full px-4 py-2 text-sm transition-colors hover:text-ambient"
        >
          ← Leave the car <span className="text-brushed">(Esc)</span>
        </button>
        <button
          type="button"
          onClick={() => setControlsOpen((open) => !open)}
          aria-expanded={controlsOpen}
          className="glass pointer-events-auto rounded-full px-4 py-2 text-sm lg:hidden"
        >
          {controlsOpen ? "Hide controls" : "Car controls"}
        </button>
      </div>

      <div className={`pointer-events-auto mt-3 max-h-[60vh] self-end overflow-y-auto lg:block ${controlsOpen ? "block" : "hidden"}`}>
        <CenterDisplay />
      </div>

      <div className="mt-auto flex flex-col items-stretch gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="pointer-events-auto">
          <AssistantPanel voice={voice} />
        </div>
        <div className="pointer-events-auto hidden self-center sm:block lg:self-end">
          <InstrumentCluster />
        </div>
        <p className="hidden text-xs text-brushed lg:block">Drag to look around the cabin.</p>
      </div>
    </div>
  );
}
