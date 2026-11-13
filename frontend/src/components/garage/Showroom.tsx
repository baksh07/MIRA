"use client";

import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { SpotLight } from "three";
import { insideGarage, pose } from "@/lib/drive";

export interface ShowroomColors {
  wall: string;
  floor: string;
}

/**
 * Studio lighting around the car: softbox reflections for the paint and a
 * little ambient light. The floor, walls and fog live in the world
 * (`components/world`), which moves around the car as it drives.
 */
export function Showroom() {
  return (
    <>

      {/* Softboxes baked into the reflections; they are never seen directly. */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[-6, 2, 2]} rotation-y={Math.PI / 2} scale={[10, 2, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[6, 2, -2]} rotation-y={-Math.PI / 2} scale={[10, 2, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[0, 1.5, -8]} scale={[12, 1, 1]} />
      </Environment>
      <ambientLight intensity={0.15} />

    </>
  );
}

/** Ground contact shadow, rendered once: the car and floor never move. */
export function CarShadow() {
  return <ContactShadows position={[0, 0.005, 0]} scale={9} blur={2.4} far={1.6} opacity={0.8} frames={1} />;
}

const SPOT_INTENSITY = 90;
const SWITCH_ON_DELAY = 0.2;
const SWITCH_ON_DURATION = 1.4;
/** Fluorescent-style switch-on: catch, dip, then full output (fraction of duration, level). */
const SWITCH_ON_CURVE: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.35, 0.55],
  [0.45, 0.2],
  [1, 1],
];

function switchOnLevel(elapsed: number): number {
  const t = (elapsed - SWITCH_ON_DELAY) / SWITCH_ON_DURATION;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  for (let i = 1; i < SWITCH_ON_CURVE.length; i++) {
    const [t1, v1] = SWITCH_ON_CURVE[i];
    if (t <= t1) {
      const [t0, v0] = SWITCH_ON_CURVE[i - 1];
      return v0 + ((t - t0) / (t1 - t0)) * (v1 - v0);
    }
  }
  return 1;
}

/** The overhead spotlight over the turntable. It switches on once the car has arrived. */
export function Spotlight({ animate }: { animate: boolean }) {
  const light = useRef<SpotLight>(null);
  const startedAt = useRef<number | null>(null);
  const level = useRef(1);

  useFrame((state) => {
    if (!light.current) return;
    // The spotlight hangs in the garage: it fades out once the car has left.
    const here = insideGarage(pose) ? 1 : 0;
    level.current += (here - level.current) * 0.05;
    if (!animate) {
      light.current.intensity = SPOT_INTENSITY * level.current;
      return;
    }
    startedAt.current ??= state.clock.elapsedTime;
    light.current.intensity = SPOT_INTENSITY * level.current * switchOnLevel(state.clock.elapsedTime - startedAt.current);
  });

  return <spotLight ref={light} position={[0, 7, 0]} angle={0.55} penumbra={1} intensity={0} decay={2} />;
}
