"use client";

import { useState, useSyncExternalStore } from "react";
import { useAssistantStore } from "@/stores/assistantStore";
import { useDriverStore } from "@/stores/driverStore";
import { useGarageStore } from "@/stores/garageStore";
import { useVehicleStore } from "@/stores/vehicleStore";

const DISMISSED_KEY = "mira.guide.dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * A short guided tour for first-time visitors; each step ticks itself off from
 * real state. Full card on wide screens in the garage; a one-line "Next" hint
 * on small screens and while seated.
 */
export function DemoGuide() {
  // Read after hydration (the server has no localStorage).
  const stored = useSyncExternalStore(() => () => undefined, readDismissed, () => true);
  const [closed, setClosed] = useState(false);
  const view = useGarageStore((s) => s.view);
  const doorOpen = useVehicleStore((s) => s.state?.doors.left_open ?? false);
  const tripStarted = useVehicleStore((s) => Boolean(s.state?.trip.active || s.state?.trip.arrived_at));
  const driver = useDriverStore((s) => s.current);
  const talked = useAssistantStore((s) => s.turns.some((t) => t.role === "user"));
  const seated = view === "cockpit";

  const steps = [
    { label: "Open the driver's door (blue dot on the car)", done: doorOpen || seated || Boolean(driver) },
    { label: "Get in", done: seated || Boolean(driver) },
    { label: "Let MIRA recognise you", done: Boolean(driver) },
    { label: "Talk to MIRA: try “I'm cold” or press the mic", done: talked },
    { label: "Say “Take me to the airport, let's go”", done: tripStarted },
  ];
  const next = steps.find((s) => !s.done);

  if (stored || closed || view === "entering" || view === "exiting") return null;

  const dismiss = () => {
    setClosed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // private mode: the guide simply comes back next visit
    }
  };

  const hint = next ? (
    <p className={`pointer-events-none fixed inset-x-0 z-10 mx-auto w-fit max-w-[85vw] ${seated ? "top-[7.5rem]" : "top-[4.5rem] md:hidden"}`}>
      <span className="block rounded-full border border-halogen/10 bg-floor/60 px-4 py-1.5 text-xs backdrop-blur-md">
        <span className="text-ambient">Next:</span> {next.label}
      </span>
    </p>
  ) : null;

  if (seated) return hint;

  return (
    <>
      {hint}
      <aside
        aria-label="Guided demo"
        className="pointer-events-auto fixed right-4 bottom-6 z-10 hidden w-72 rounded-2xl border border-halogen/10 bg-floor/60 p-4 text-sm backdrop-blur-md sm:right-10 md:block"
      >
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-brushed uppercase">Try MIRA in 1 minute</p>
          <button type="button" onClick={dismiss} aria-label="Hide the guide" className="text-brushed hover:text-halogen">
            ✕
          </button>
        </div>
        <ol className="mt-2 space-y-1.5">
          {steps.map((step, i) => (
            <li
              key={step.label}
              className={`flex gap-2 ${step.done ? "text-brushed line-through decoration-brushed/50" : step === next ? "text-halogen" : "text-brushed"}`}
            >
              <span
                className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] ${step.done ? "bg-ambient text-floor" : "border border-halogen/20"}`}
              >
                {step.done ? "✓" : i + 1}
              </span>
              {step.label}
            </li>
          ))}
        </ol>
      </aside>
    </>
  );
}
