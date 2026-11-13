"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { type Group, MathUtils, type Mesh, type MeshBasicMaterial } from "three";
import type { CarRig } from "@/components/vehicle/carRig";
import { useVehicleStore } from "@/stores/vehicleStore";

const WHEEL_RADIUS = 0.34; // m
const DASH_SPACING = 6; // m between lane-marking dashes
const DASH_COUNT = 10;
const ROAD_LENGTH = DASH_SPACING * DASH_COUNT;
/** Visual speed: the simulator runs trips in accelerated time, the road does not. */
const VISUAL_SCALE = 0.25;

function spin(rig: CarRig, metresPerSecond: number, delta: number) {
  const angle = (metresPerSecond / WHEEL_RADIUS) * delta;
  for (const wheel of rig.wheels) wheel.rotation.x += angle;
}

function scroll(road: Group, metres: number) {
  for (const dash of road.children) {
    dash.position.z -= metres;
    if (dash.position.z < -ROAD_LENGTH / 2) dash.position.z += ROAD_LENGTH;
  }
}

/**
 * While a trip is active the wheels turn and lane markings stream under the car
 * (visible from the garage and through the windscreen). Everything follows the
 * speed the simulator reports.
 */
export function DriveMotion({ rig, instant }: { rig: CarRig; instant: boolean }) {
  const road = useRef<Group>(null);
  const speed = useRef(0);
  const dashes = useMemo(() => Array.from({ length: DASH_COUNT }, (_, i) => -ROAD_LENGTH / 2 + i * DASH_SPACING), []);

  useFrame((_, delta) => {
    const trip = useVehicleStore.getState().state?.trip;
    const target = trip?.active ? (trip.speed_kmh / 3.6) * VISUAL_SCALE : 0;
    speed.current = instant ? target : MathUtils.damp(speed.current, target, 2, delta);
    if (speed.current < 0.01) speed.current = 0;
    spin(rig, speed.current, delta);
    const group = road.current;
    if (!group) return;
    scroll(group, speed.current * delta);
    const opacity = Math.min(1, speed.current / 4) * 0.7;
    group.visible = opacity > 0.01;
    for (const dash of group.children) ((dash as Mesh).material as MeshBasicMaterial).opacity = opacity;
  });

  return (
    <group ref={road} visible={false}>
      {dashes.flatMap((z) =>
        [-1.6, 1.6].map((x) => (
          <mesh key={`${x}:${z}`} position={[x, 0.004, z]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[0.12, 2.4]} />
            <meshBasicMaterial color="#EEF0F2" transparent opacity={0} depthWrite={false} />
          </mesh>
        )),
      )}
    </group>
  );
}
