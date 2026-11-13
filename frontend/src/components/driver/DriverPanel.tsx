"use client";

import { useEffect, useState } from "react";
import { SCAN_MS, useDriverStore } from "@/stores/driverStore";
import type { Driver } from "@/types/driver";
import { DriverAvatar } from "./DriverAvatar";

const SCAN_STEPS = ["Detecting face…", "Mapping features…", "Matching driver profile…"];

/** Landmark points on the 120×120 portrait, revealed during the scan. */
const LANDMARKS: Array<[number, number]> = [
  [53, 55], [67, 55], [60, 61], [55, 67], [65, 67], [45, 50], [75, 50], [60, 34], [44, 64], [76, 64], [60, 76],
];

/** A confidence that looks like a real matcher's output but is stable per driver. */
function confidence(driver: Driver): string {
  const seed = [...driver.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return (96 + (seed % 33) / 10).toFixed(1);
}

function ScanStep() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, SCAN_STEPS.length - 1)), SCAN_MS / SCAN_STEPS.length);
    return () => clearInterval(id);
  }, []);
  return <span>{SCAN_STEPS[step]}</span>;
}

function Viewfinder({ driver, scanning }: { driver: Driver; scanning: boolean }) {
  return (
    <div className="relative mx-auto aspect-square w-52 overflow-hidden rounded-2xl bg-floor/80">
      {/* corner brackets */}
      {["left-2 top-2 border-l-2 border-t-2", "right-2 top-2 border-r-2 border-t-2", "bottom-2 left-2 border-b-2 border-l-2", "right-2 bottom-2 border-r-2 border-b-2"].map((c) => (
        <span key={c} className={`absolute size-6 border-ambient ${c}`} />
      ))}
      <DriverAvatar gender={driver.gender} className="absolute inset-6 text-halogen/80" />
      <svg viewBox="0 0 120 120" className="absolute inset-6" aria-hidden="true">
        {LANDMARKS.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="1.8"
            className="animate-landmark fill-ambient"
            style={{ animationDelay: `${(i * SCAN_MS) / LANDMARKS.length / 1.6}ms` }}
          />
        ))}
      </svg>
      {scanning && <span className="animate-scanline absolute inset-x-0 h-12 bg-[linear-gradient(to_bottom,transparent,color-mix(in_oklab,var(--color-ambient)_45%,transparent),transparent)]" />}
    </div>
  );
}

export function DriverPanel() {
  const { panelOpen, drivers, status, candidate, current, applied, greeting, error } = useDriverStore();
  const { closePanel, identify, loadDrivers } = useDriverStore.getState();

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && status !== "scanning" && closePanel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, status, closePanel]);

  if (!panelOpen) return null;

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-floor/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="driver-panel-title">
      <div className="w-full max-w-md rounded-3xl border border-halogen/10 bg-wall/95 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="driver-panel-title" className="text-xl font-bold [font-stretch:115%]">
              {status === "scanning" ? "Recognizing face" : status === "identified" ? "Driver identified" : "Who's driving?"}
            </h2>
            <p className="mt-1 text-xs text-brushed">Simulated recognition. No camera is used and no image leaves your device.</p>
          </div>
          {status !== "scanning" && (
            <button type="button" onClick={closePanel} className="rounded-full px-2 text-brushed hover:text-halogen" aria-label="Close">
              ✕
            </button>
          )}
        </div>

        {(status === "scanning" || status === "identified") && candidate ? (
          <div className="mt-6 text-center">
            <Viewfinder driver={candidate} scanning={status === "scanning"} />
            <p className="mt-4 text-sm font-medium" role="status" aria-live="polite">
              {status === "scanning" ? (
                <ScanStep />
              ) : (
                <>
                  <span className="text-ambient">✓</span> {current?.display_name} · {current?.gender === "male" ? "Male" : "Female"} ·{" "}
                  {confidence(candidate)}% match
                </>
              )}
            </p>
            {status === "identified" && (
              <>
                {greeting && <p className="mt-3 text-base">{greeting}</p>}
                {applied.length > 0 && (
                  <ul className="mt-3 space-y-1 text-left text-sm text-brushed">
                    {applied.map((line) => (
                      <li key={line} className="flex gap-2">
                        <span className="text-ambient">•</span>
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-5 flex justify-center gap-3">
                  <button type="button" onClick={closePanel} className="rounded-full bg-halogen px-5 py-2 text-sm font-semibold text-floor">
                    Let&apos;s go
                  </button>
                  <button type="button" onClick={() => useDriverStore.setState({ status: "idle" })} className="rounded-full border border-halogen/20 px-5 py-2 text-sm">
                    Switch driver
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="mt-6">
            {error && (
              <p className="mb-4 rounded-xl bg-floor/70 p-3 text-sm text-brushed">
                {error}.{" "}
                <button type="button" className="underline" onClick={() => void loadDrivers()}>
                  Try again
                </button>
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {drivers.map((driver) => (
                <button
                  key={driver.id}
                  type="button"
                  onClick={() => void identify(driver)}
                  className="group rounded-2xl border border-halogen/10 bg-floor/50 p-4 text-left transition-colors hover:border-ambient"
                >
                  <DriverAvatar gender={driver.gender} className="mx-auto size-24 text-halogen/70 transition-colors group-hover:text-ambient" />
                  <p className="mt-3 font-semibold">{driver.display_name}</p>
                  <p className="text-xs text-brushed">{driver.gender === "male" ? "Male" : "Female"} · demo driver</p>
                </button>
              ))}
              {drivers.length === 0 && !error && <p className="col-span-2 text-center text-sm text-brushed">Loading drivers…</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
