"use client";

import { MeshReflectorMaterial } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { Color, Fog, type Group, type Mesh, type MeshBasicMaterial, type Scene } from "three";
import { destinationPoint } from "@/lib/city";
import { GARAGE, drive, keys, pose, publishHud, stepDrive } from "@/lib/drive";
import { useVehicleStore } from "@/stores/vehicleStore";
import { City } from "./City";

const KEYMAP: Record<string, keyof typeof keys> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

function setKey(code: string, down: boolean) {
  const key = KEYMAP[code];
  if (key) keys[key] = down;
  return Boolean(key);
}

function releaseKeys() {
  for (const key of Object.keys(keys) as Array<keyof typeof keys>) keys[key] = false;
}

/** W A S D / arrow keys drive the car (ignored while typing in the chat). */
function useDrivingKeys() {
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (setKey(event.code, true)) event.preventDefault();
    };
    const up = (event: KeyboardEvent) => void setKey(event.code, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", releaseKeys);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", releaseKeys);
      releaseKeys();
    };
  }, []);
}

const actions = {
  stopTrip: () =>
    void useVehicleStore
      .getState()
      .send({ type: "stop_trip" })
      .catch(() => undefined),
  leaveGarage: () =>
    void useVehicleStore
      .getState()
      .send({ type: "leave_garage" })
      .catch(() => undefined),
};

/**
 * Everything outside the car. The car stays at the origin (so the cockpit
 * camera, hotspots and doors are unaffected) and the world is moved around
 * it: rotated by the car's heading and offset by its position.
 */
export function WorldFrame({ children }: { children: ReactNode }) {
  const turn = useRef<Group>(null);
  const shift = useRef<Group>(null);
  useDrivingKeys();

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    stepDrive(dt, useVehicleStore.getState().state, actions);
    publishHud(dt);
    if (turn.current) turn.current.rotation.y = -pose.heading;
    if (shift.current) shift.current.position.set(-pose.x, 0, -pose.z);
  });

  return (
    <group ref={turn}>
      <group ref={shift}>
        {children}
        <City />
        <RouteGuide />
      </group>
    </group>
  );
}

const WALL = "#2a2e34";
const OUTER_WALL = "#3b3f46";

function Wall({
  position,
  size,
  color = WALL,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color?: string;
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

/** The roll-up door: slats that rise into the ceiling as the simulator opens the garage. */
function GarageDoor() {
  const door = useRef<Group>(null);
  const slats = useMemo(() => Array.from({ length: 12 }, (_, i) => 0.25 + i * 0.5), []);
  useFrame(() => {
    if (door.current) door.current.position.y = drive.door * (GARAGE.height - 0.3);
  });
  return (
    <group ref={door} position={[0, 0, GARAGE.door]}>
      {slats.map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[GARAGE.doorHalfWidth * 2, 0.46, 0.12]} />
          <meshStandardMaterial color="#5a6069" metalness={0.6} roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}

/** MIRA's garage: the showroom floor, walls, ceiling light strips and the door onto the avenue. */
export function GarageRoom({ floor, lowPower }: { floor: string; lowPower: boolean }) {
  const { halfWidth: w, back, door, doorHalfWidth: dw, height: h } = GARAGE;
  const depth = door - back;
  const mid = (door + back) / 2;
  const side = w - dw;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, mid]}>
        <planeGeometry args={[w * 2, depth]} />
        <MeshReflectorMaterial
          color={floor}
          key={lowPower ? "low" : "high"}
          resolution={lowPower ? 256 : 1024}
          blur={lowPower ? [200, 60] : [400, 120]}
          mixBlur={1}
          mixStrength={12}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          roughness={0.9}
          metalness={0.5}
        />
      </mesh>
      <Wall position={[-w, h / 2, mid]} size={[0.3, h, depth]} />
      <Wall position={[w, h / 2, mid]} size={[0.3, h, depth]} />
      <Wall position={[0, h / 2, back]} size={[w * 2, h, 0.3]} />
      <Wall position={[0, h + 0.15, mid]} size={[w * 2 + 0.3, 0.3, depth + 0.3]} color={OUTER_WALL} />
      <Wall position={[-(dw + side / 2), h / 2, door]} size={[side, h, 0.3]} color={OUTER_WALL} />
      <Wall position={[dw + side / 2, h / 2, door]} size={[side, h, 0.3]} color={OUTER_WALL} />
      {[-6, 0, 6].map((x) => (
        <mesh key={x} position={[x, h - 0.05, mid]}>
          <boxGeometry args={[0.25, 0.05, depth * 0.7]} />
          <meshBasicMaterial color="#e8ecf2" />
        </mesh>
      ))}
      <GarageDoor />
    </group>
  );
}

/** The planned route as a glowing ribbon on the road, and a beacon over the destination. */
function RouteGuide() {
  const ribbons = useRef<Array<Mesh | null>>([]);
  const beacon = useRef<Mesh>(null);
  const shown = useRef<unknown>(null);
  const color = useMemo(() => new Color(), []);

  useFrame((state) => {
    const car = useVehicleStore.getState().state;
    const route = drive.route;
    if (route !== shown.current) {
      shown.current = route;
      ribbons.current.forEach((mesh, i) => {
        if (!mesh) return;
        const a = route?.[i];
        const b = route?.[i + 1];
        mesh.visible = Boolean(a && b);
        if (!a || !b) return;
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        mesh.position.set((a.x + b.x) / 2, 0.03, (a.z + b.z) / 2);
        mesh.rotation.set(-Math.PI / 2, 0, Math.atan2(b.x - a.x, b.z - a.z));
        mesh.scale.set(1, length + 2, 1);
      });
    }
    if (car) color.set(car.ambient_lighting.color);
    for (const mesh of ribbons.current) if (mesh) (mesh.material as MeshBasicMaterial).color.copy(color);
    const destination = car?.navigation.destination;
    if (beacon.current) {
      beacon.current.visible = Boolean(destination);
      if (destination) {
        const p = destinationPoint(destination);
        beacon.current.position.set(p.x, 30, p.z);
        const material = beacon.current.material as MeshBasicMaterial;
        material.color.copy(color);
        material.opacity = 0.25 + Math.sin(state.clock.elapsedTime * 2) * 0.08;
      }
    }
  });

  return (
    <group>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} ref={(m) => void (ribbons.current[i] = m)} visible={false}>
          <planeGeometry args={[1.4, 1]} />
          <meshBasicMaterial transparent opacity={0.55} depthWrite={false} />
        </mesh>
      ))}
      <mesh ref={beacon} visible={false}>
        <cylinderGeometry args={[1.6, 1.6, 60, 16, 1, true]} />
        <meshBasicMaterial transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </group>
  );
}

const OUTSIDE_SKY = new Color("#1b2333");

/**
 * Fog and sky: the closed garage fades into its own walls; once the door opens
 * and the car rolls out, the view opens up to the city at dusk.
 */
export function Atmosphere({ wall }: { wall: string }) {
  const scene = useThree((s) => s.scene);
  const inside = useMemo(() => new Color(wall), [wall]);
  const tint = useMemo(() => new Color(), []);
  const fog = useMemo(() => new Fog(wall, 9, 24), [wall]);

  useEffect(() => attachAtmosphere(scene, fog, tint), [scene, fog, tint]);
  useFrame(() => updateAtmosphere(fog, tint, inside));
  return null;
}

function attachAtmosphere(scene: Scene, fog: Fog, tint: Color) {
  scene.fog = fog;
  scene.background = tint;
  return () => {
    scene.fog = null;
    scene.background = null;
  };
}

function updateAtmosphere(fog: Fog, tint: Color, inside: Color) {
  const out = Math.min(1, Math.max(0, (pose.z - GARAGE.door + 6) / 14, Math.abs(pose.x) > GARAGE.halfWidth ? 1 : 0));
  const open = Math.max(out, drive.door * 0.6);
  tint.copy(inside).lerp(OUTSIDE_SKY, open);
  fog.color.copy(tint);
  fog.near = 9 + open * 50;
  fog.far = 24 + open * 330;
}
