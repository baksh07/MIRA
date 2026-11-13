"use client";

import { useFrame } from "@react-three/fiber";
import type { CarRig } from "@/components/vehicle/carRig";
import { pose } from "@/lib/drive";

const WHEEL_RADIUS = 0.34; // m

function spin(rig: CarRig, metresPerSecond: number, delta: number) {
  const angle = (metresPerSecond / WHEEL_RADIUS) * delta;
  for (const wheel of rig.wheels) wheel.rotation.x += angle;
}

/** The wheels turn with the car's speed through the city (autopilot or W A S D). */
export function DriveMotion({ rig }: { rig: CarRig; instant?: boolean }) {
  useFrame((_, delta) => spin(rig, pose.speed, Math.min(delta, 0.1)));
  return null;
}
