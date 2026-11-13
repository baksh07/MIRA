"use client";

import { useProgress } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { useGarageStore } from "@/stores/garageStore";
import { CameraRig, GARAGE_CAMERA_POSITION, GarageControls } from "./CameraRig";
import { CarModel } from "./CarModel";
import { GarageMessage } from "./GarageMessage";
import { CarShadow, Showroom, type ShowroomColors, Spotlight } from "./Showroom";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED_MOTION);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

/** Reads the showroom colours from the design tokens in globals.css. */
function readShowroomColors(): ShowroomColors {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return { wall: token("--color-wall", "#1b1e23"), floor: token("--color-floor", "#121418") };
}

function LoadingOverlay() {
  const { progress, errors } = useProgress();
  if (errors.length > 0) {
    return <GarageMessage>The car could not be loaded. Try reloading the page.</GarageMessage>;
  }
  if (progress >= 100) return null;
  return <GarageMessage>Bringing the car in… {Math.round(progress)}%</GarageMessage>;
}

/** Shown while seated: how to look around and the way back out (also Escape). */
function CockpitOverlay() {
  const view = useGarageStore((state) => state.view);
  const exitCockpit = useGarageStore((state) => state.exitCockpit);

  useEffect(() => {
    if (view !== "cockpit") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") exitCockpit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, exitCockpit]);

  if (view !== "cockpit") return null;
  return (
    <div className="absolute inset-x-0 bottom-24 flex flex-col items-center gap-3 px-6 text-center">
      <p className="text-sm text-brushed">Drag to look around the cabin.</p>
      <button
        type="button"
        onClick={exitCockpit}
        className="rounded-full border border-halogen/30 bg-floor/70 px-5 py-2 text-sm font-medium text-halogen backdrop-blur-sm transition-colors hover:border-ambient hover:text-ambient"
      >
        Leave the car <span className="text-brushed">(Esc)</span>
      </button>
    </div>
  );
}

/** The 3D garage: the car on its turntable, with doors, hotspots and the cockpit. Browser-only. */
export default function GarageCanvas() {
  const reducedMotion = usePrefersReducedMotion();
  const [colors] = useState(readShowroomColors);

  return (
    <>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: GARAGE_CAMERA_POSITION, fov: 32, near: 0.05, far: 60 }}
        aria-label="3D view of the car in the garage. Drag to orbit, scroll or pinch to zoom."
        role="img"
      >
        <Showroom colors={colors} />
        <Suspense fallback={null}>
          <CarModel reducedMotion={reducedMotion} />
          <CameraRig instant={reducedMotion} />
          <CarShadow />
          <Spotlight animate={!reducedMotion} />
        </Suspense>
        <GarageControls instant={reducedMotion} />
      </Canvas>
      <LoadingOverlay />
      <CockpitOverlay />
    </>
  );
}
