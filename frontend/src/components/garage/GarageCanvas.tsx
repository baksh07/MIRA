"use client";

import { OrbitControls, useProgress } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useState, useSyncExternalStore } from "react";
import type { PerspectiveCamera } from "three";
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

/**
 * Keeps the car whole and clear of the page copy: shifted right on wide screens
 * (copy sits bottom-left), lifted up and zoomed out on narrow ones (copy sits
 * underneath, and a portrait view is too narrow for a car seen from the side).
 */
function CarFraming() {
  const getState = useThree((state) => state.get);
  const size = useThree((state) => state.size);

  useLayoutEffect(() => {
    const camera = getState().camera as PerspectiveCamera;
    const { width, height } = size;
    camera.zoom = Math.min(1, Math.max(0.45, width / height / 1.75));
    if (width >= 1024) camera.setViewOffset(width, height, -width * 0.22, height * 0.06, width, height);
    else camera.setViewOffset(width, height, 0, height * 0.2, width, height);
    camera.updateProjectionMatrix();
    return () => camera.clearViewOffset();
  }, [getState, size]);

  return null;
}

function LoadingOverlay() {
  const { progress, errors } = useProgress();
  if (errors.length > 0) {
    return <GarageMessage>The car could not be loaded. Try reloading the page.</GarageMessage>;
  }
  if (progress >= 100) return null;
  return <GarageMessage>Bringing the car in… {Math.round(progress)}%</GarageMessage>;
}

/** The 3D garage: the car on its turntable, with orbit controls. Browser-only. */
export default function GarageCanvas() {
  const reducedMotion = usePrefersReducedMotion();
  const [colors] = useState(readShowroomColors);

  return (
    <>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [5.8, 1.6, 6.9], fov: 32, near: 0.1, far: 60 }}
        aria-label="3D view of the car in the garage. Drag to orbit, scroll or pinch to zoom."
        role="img"
      >
        <CarFraming />
        <Showroom colors={colors} />
        <Suspense fallback={null}>
          <CarModel />
          <CarShadow />
          <Spotlight animate={!reducedMotion} />
        </Suspense>
        <OrbitControls
          makeDefault
          target={[0, 0.6, 0]}
          enablePan={false}
          minDistance={4.5}
          maxDistance={11}
          minPolarAngle={Math.PI * 0.2}
          maxPolarAngle={Math.PI * 0.47}
          autoRotate={!reducedMotion}
          autoRotateSpeed={0.35}
        />
      </Canvas>
      <LoadingOverlay />
    </>
  );
}
