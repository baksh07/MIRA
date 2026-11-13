"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Box3, Color, MathUtils, type Object3D, type PointLight, Vector3 } from "three";
import { type CarRig, rigCar } from "@/components/vehicle/carRig";
import type { DoorSide } from "@/stores/garageStore";
import { useVehicleStore } from "@/stores/vehicleStore";
import { CarHotspots } from "./CarHotspots";
import { DriveMotion } from "./DriveMotion";

/**
 * Built by scripts/build-car-model.mjs from "BMW M2 g87 [Free]" by Black Snow
 * (CC BY 4.0), with manufacturer branding removed. Credited in the footer.
 */
export const CAR_MODEL_URL = "/models/coupe.glb";

export interface Car {
  scene: Object3D;
  rig: CarRig;
  /** Moves the model so its wheels sit on y = 0 and it is centred on the turntable. */
  offset: Vector3;
}

/**
 * Measures and rigs a loaded scene once. The loader caches the scene, so the
 * result is kept on it and every caller shares the same rig.
 */
function prepareCar(scene: Object3D): Car {
  const cached = scene.userData.car as Car | undefined;
  if (cached) return cached;
  // Measure before rigging: the bounds must not depend on door positions.
  scene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(scene);
  const center = bounds.getCenter(new Vector3());
  const car: Car = { scene, rig: rigCar(scene), offset: new Vector3(-center.x, -bounds.min.y, -center.z) };
  scene.userData.car = car;
  return car;
}

/** The loaded, rigged car. Shared by everything that needs its parts or poses. */
export function useCar(): Car {
  const { scene } = useGLTF(CAR_MODEL_URL);
  return useMemo(() => prepareCar(scene), [scene]);
}

/** Swings each door towards the open/closed state the vehicle simulator confirmed. */
function swingDoors(rig: CarRig, open: Record<DoorSide, boolean>, delta: number, instant: boolean) {
  for (const side of ["left", "right"] as const) {
    const { pivot, openAngle } = rig.doors[side];
    const target = open[side] ? openAngle : 0;
    pivot.rotation.y = instant ? target : MathUtils.damp(pivot.rotation.y, target, 4, delta);
  }
}

function DoorAnimator({ rig, instant }: { rig: CarRig; instant: boolean }) {
  useFrame((_, delta) => {
    const doors = useVehicleStore.getState().state?.doors;
    swingDoors(rig, { left: doors?.left_open ?? false, right: doors?.right_open ?? false }, delta, instant);
  });
  return null;
}

/** Interior ambient lighting: follows the confirmed colour and brightness of the car's state. */
function CabinLight() {
  const light = useRef<PointLight>(null);
  useFrame((_, delta) => {
    const ambient = useVehicleStore.getState().state?.ambient_lighting;
    if (!light.current || !ambient) return;
    light.current.color.lerp(scratchColor.set(ambient.color), Math.min(1, delta * 4));
    light.current.intensity = MathUtils.damp(light.current.intensity, (ambient.brightness / 100) * 2.5, 4, delta);
  });
  return <pointLight ref={light} position={[0, 0.95, -0.25]} distance={1.8} decay={2} intensity={0} />;
}

const scratchColor = new Color();

/** The car, parked on the turntable, with working doors and hotspots. */
export function CarModel({ reducedMotion }: { reducedMotion: boolean }) {
  const { scene, rig, offset } = useCar();
  return (
    <group position={offset}>
      <primitive object={scene} />
      <DoorAnimator rig={rig} instant={reducedMotion} />
      <CabinLight />
      <DriveMotion rig={rig} instant={reducedMotion} />
      <CarHotspots rig={rig} />
    </group>
  );
}

useGLTF.preload(CAR_MODEL_URL);
