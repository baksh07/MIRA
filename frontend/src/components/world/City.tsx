"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { CanvasTexture, Color, type InstancedMesh, Object3D, RepeatWrapping, SRGBColorSpace } from "three";
import { AVENUES, BLOCK, CITY_BOUNDS, FIRST_STREET, ROAD_WIDTH, STREETS, seeded } from "@/lib/city";
import { GARAGE } from "@/lib/drive";

const ROAD_COLOR = "#24272d";
const GROUND_COLOR = "#15181c";
const PAVEMENT_COLOR = "#2c3036";

interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
}

const PALETTE = ["#3a3f47", "#454a52", "#2f343b", "#504a45", "#3d4450", "#4a4f57"];

/** Building footprints, filling every block (and a ring outside the grid) except around the garage. */
function layoutBuildings(): Box[] {
  const random = seeded(7);
  const boxes: Box[] = [];
  const xs = [AVENUES[0] - BLOCK, ...AVENUES];
  const zs = [FIRST_STREET - BLOCK, ...STREETS];
  for (const ax of xs) {
    for (const sz of zs) {
      const cx = ax + BLOCK / 2;
      const cz = sz + BLOCK / 2;
      const usable = BLOCK - ROAD_WIDTH - 8;
      const outer = cx < AVENUES[0] || cx > AVENUES.at(-1)! || cz > STREETS.at(-1)! || cz < FIRST_STREET;
      for (const [ox, oz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        if (random() < 0.12) continue; // the odd plaza
        const w = usable / 2 - 3 - random() * 6;
        const d = usable / 2 - 3 - random() * 6;
        const x = cx + (ox * usable) / 4;
        const z = cz + (oz * usable) / 4;
        if (Math.abs(x) < GARAGE.halfWidth + w / 2 + 6 && z - d / 2 < GARAGE.door + 8) continue; // keep the garage clear
        const tall = random() < 0.2;
        const h = (outer ? 18 : 10) + random() * (tall ? 70 : 28);
        boxes.push({
          x,
          z,
          w,
          d,
          h,
          color: PALETTE[Math.floor(random() * PALETTE.length)],
        });
      }
    }
  }
  return boxes;
}

/** Lit windows: a canvas texture tiled per floor, shared by all buildings. */
function windowTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, 128, 128);
  const random = seeded(11);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const lit = random();
      if (lit < 0.45) continue;
      g.fillStyle = lit > 0.9 ? "#9fd0ff" : lit > 0.7 ? "#ffe2a8" : "#ffc977";
      g.globalAlpha = 0.35 + random() * 0.65;
      g.fillRect(col * 16 + 4, row * 16 + 5, 8, 7);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(4, 9);
  return texture;
}

type Place = (dummy: Object3D, i: number) => string | void;

function fillInstances(target: InstancedMesh | null, place: Place, count: number) {
  if (!target) return;
  const dummy = new Object3D();
  const color = new Color();
  for (let i = 0; i < count; i++) {
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    const tint = place(dummy, i);
    dummy.updateMatrix();
    target.setMatrixAt(i, dummy.matrix);
    if (tint) target.setColorAt(i, color.set(tint));
  }
  target.instanceMatrix.needsUpdate = true;
  if (target.instanceColor) target.instanceColor.needsUpdate = true;
  target.computeBoundingSphere();
}

function useInstances(mesh: React.RefObject<InstancedMesh | null>, place: Place, count: number) {
  useLayoutEffect(() => fillInstances(mesh.current, place, count), [mesh, place, count]);
}

function Buildings() {
  const boxes = useMemo(() => layoutBuildings(), []);
  const texture = useMemo(() => windowTexture(), []);
  const mesh = useRef<InstancedMesh>(null);
  const place = useMemo(
    () => (dummy: Object3D, i: number) => {
      const b = boxes[i];
      dummy.position.set(b.x, b.h / 2 + 0.15, b.z);
      dummy.scale.set(b.w, b.h, b.d);
      return b.color;
    },
    [boxes],
  );
  useInstances(mesh, place, boxes.length);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, boxes.length]}>
      <boxGeometry />
      <meshStandardMaterial roughness={0.85} metalness={0.1} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={1.4} />
    </instancedMesh>
  );
}

interface Segment {
  x: number;
  z: number;
  along: "x" | "z";
  length: number;
}

/** Road strips: avenues, streets and the garage driveway. */
function roadSegments(): Segment[] {
  const zLength = CITY_BOUNDS.maxZ - FIRST_STREET + ROAD_WIDTH;
  const xLength = CITY_BOUNDS.maxX - CITY_BOUNDS.minX;
  return [
    ...AVENUES.map((x) => ({
      x,
      z: FIRST_STREET + (zLength - ROAD_WIDTH) / 2,
      along: "z" as const,
      length: zLength,
    })),
    ...STREETS.map((z) => ({
      x: (CITY_BOUNDS.minX + CITY_BOUNDS.maxX) / 2,
      z,
      along: "x" as const,
      length: xLength,
    })),
    {
      x: 0,
      z: (GARAGE.door + FIRST_STREET) / 2,
      along: "z",
      length: FIRST_STREET - GARAGE.door,
    },
  ];
}

function Roads() {
  const segments = useMemo(() => roadSegments(), []);
  const dashes = useMemo(() => {
    const points: Array<{ x: number; z: number; along: "x" | "z" }> = [];
    for (const s of segments.slice(0, -1)) {
      for (let t = -s.length / 2; t < s.length / 2; t += 9) {
        const p = s.along === "z" ? { x: s.x, z: s.z + t } : { x: s.x + t, z: s.z };
        const nearCrossing = (s.along === "z" ? STREETS : AVENUES).some(
          (c) => Math.abs((s.along === "z" ? p.z : p.x) - c) < ROAD_WIDTH / 2 + 1,
        );
        if (!nearCrossing) points.push({ ...p, along: s.along });
      }
    }
    return points;
  }, [segments]);
  const dashMesh = useRef<InstancedMesh>(null);
  const placeDash = useMemo(
    () => (dummy: Object3D, i: number) => {
      const d = dashes[i];
      dummy.position.set(d.x, 0.02, d.z);
      dummy.rotation.set(-Math.PI / 2, 0, d.along === "x" ? Math.PI / 2 : 0);
    },
    [dashes],
  );
  useInstances(dashMesh, placeDash, dashes.length);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, (CITY_BOUNDS.minZ + CITY_BOUNDS.maxZ) / 2]}>
        <planeGeometry args={[1200, 1200]} />
        <meshStandardMaterial color={GROUND_COLOR} roughness={1} />
      </mesh>
      {segments.map((s) => (
        <mesh key={`${s.x}:${s.z}`} rotation-x={-Math.PI / 2} position={[s.x, 0.01, s.z]}>
          <planeGeometry args={s.along === "z" ? [ROAD_WIDTH, s.length] : [s.length, ROAD_WIDTH]} />
          <meshStandardMaterial color={ROAD_COLOR} roughness={0.95} />
        </mesh>
      ))}
      {segments.slice(0, -1).map((s) => (
        <mesh key={`p${s.x}:${s.z}`} rotation-x={-Math.PI / 2} position={[s.x, 0.005, s.z]}>
          <planeGeometry args={s.along === "z" ? [ROAD_WIDTH + 6, s.length] : [s.length, ROAD_WIDTH + 6]} />
          <meshStandardMaterial color={PAVEMENT_COLOR} roughness={1} />
        </mesh>
      ))}
      <instancedMesh ref={dashMesh} args={[undefined, undefined, dashes.length]}>
        <planeGeometry args={[0.2, 3]} />
        <meshBasicMaterial color="#c9ccd1" />
      </instancedMesh>
    </group>
  );
}

/** Trees and street lights along the pavements. */
function Streetscape() {
  const spots = useMemo(() => {
    const random = seeded(23);
    const trees: Array<{ x: number; z: number; s: number }> = [];
    const lamps: typeof trees = [];
    const side = ROAD_WIDTH / 2 + 2;
    for (const x of AVENUES) {
      for (let z = FIRST_STREET + 10; z < CITY_BOUNDS.maxZ; z += 12) {
        if (STREETS.some((s) => Math.abs(z - s) < 10)) continue;
        for (const o of [-1, 1])
          (Math.round(z / 12) % 3 === 0 ? lamps : trees).push({
            x: x + o * side,
            z,
            s: 0.8 + random() * 0.5,
          });
      }
    }
    for (const z of STREETS) {
      for (let x = CITY_BOUNDS.minX + 6; x < CITY_BOUNDS.maxX; x += 12) {
        if (AVENUES.some((a) => Math.abs(x - a) < 10)) continue;
        for (const o of [-1, 1]) {
          const p = { x, z: z + o * side, s: 0.8 + random() * 0.5 };
          if (Math.abs(p.x) < GARAGE.halfWidth + 4 && p.z < GARAGE.door + 4) continue;
          (Math.round(x / 12) % 3 === 0 ? lamps : trees).push(p);
        }
      }
    }
    return { trees, lamps };
  }, []);
  const crowns = useRef<InstancedMesh>(null);
  const trunks = useRef<InstancedMesh>(null);
  const poles = useRef<InstancedMesh>(null);
  const bulbs = useRef<InstancedMesh>(null);
  const placeCrown = useMemo(
    () => (d: Object3D, i: number) => {
      const t = spots.trees[i];
      d.position.set(t.x, 3.2 * t.s, t.z);
      d.scale.setScalar(t.s);
      return i % 3 ? "#1f3a2a" : "#28452f";
    },
    [spots],
  );
  const placeTrunk = useMemo(
    () => (d: Object3D, i: number) => void d.position.set(spots.trees[i].x, 0.9, spots.trees[i].z),
    [spots],
  );
  const placePole = useMemo(
    () => (d: Object3D, i: number) => void d.position.set(spots.lamps[i].x, 2.75, spots.lamps[i].z),
    [spots],
  );
  const placeBulb = useMemo(
    () => (d: Object3D, i: number) => void d.position.set(spots.lamps[i].x, 5.6, spots.lamps[i].z),
    [spots],
  );
  useInstances(crowns, placeCrown, spots.trees.length);
  useInstances(trunks, placeTrunk, spots.trees.length);
  useInstances(poles, placePole, spots.lamps.length);
  useInstances(bulbs, placeBulb, spots.lamps.length);
  return (
    <group>
      <instancedMesh ref={crowns} args={[undefined, undefined, spots.trees.length]}>
        <icosahedronGeometry args={[1.8, 0]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={trunks} args={[undefined, undefined, spots.trees.length]}>
        <cylinderGeometry args={[0.15, 0.2, 1.8, 5]} />
        <meshStandardMaterial color="#3b2d22" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={poles} args={[undefined, undefined, spots.lamps.length]}>
        <cylinderGeometry args={[0.08, 0.1, 5.5, 6]} />
        <meshStandardMaterial color="#555a61" metalness={0.6} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={bulbs} args={[undefined, undefined, spots.lamps.length]}>
        <sphereGeometry args={[0.28, 8, 6]} />
        <meshBasicMaterial color="#ffd9a0" />
      </instancedMesh>
    </group>
  );
}

const TRAFFIC = 18;
const TRAFFIC_COLORS = ["#c8ccd2", "#1d2026", "#7a1d1d", "#2d4a7a", "#9a9ea6", "#e0e0dc"];

/** Other cars cruising the avenues and streets ("traffic looks moderate"). */
function Traffic() {
  const cars = useMemo(() => {
    const random = seeded(41);
    return Array.from({ length: TRAFFIC }, (_, i) => {
      const onAvenue = i % 2 === 0;
      const road = onAvenue ? AVENUES[i % AVENUES.length] : STREETS[i % STREETS.length];
      const direction = random() < 0.5 ? 1 : -1;
      const [min, max] = onAvenue ? [FIRST_STREET, CITY_BOUNDS.maxZ] : [CITY_BOUNDS.minX, CITY_BOUNDS.maxX];
      return {
        onAvenue,
        road,
        direction,
        min,
        max,
        t: min + random() * (max - min),
        speed: 7 + random() * 6,
        color: TRAFFIC_COLORS[i % TRAFFIC_COLORS.length],
      };
    });
  }, []);
  const bodies = useRef<InstancedMesh>(null);
  const placeBody = useMemo(() => (_: Object3D, i: number) => cars[i].color, [cars]);
  useInstances(bodies, placeBody, cars.length);
  const dummy = useMemo(() => new Object3D(), []);

  useFrame((_, delta) => advanceTraffic(bodies.current, cars, dummy, delta));

  return (
    <instancedMesh ref={bodies} args={[undefined, undefined, cars.length]} frustumCulled={false}>
      <boxGeometry args={[1.9, 1.3, 4.3]} />
      <meshStandardMaterial metalness={0.5} roughness={0.35} />
    </instancedMesh>
  );
}

interface TrafficCar {
  onAvenue: boolean;
  road: number;
  direction: number;
  min: number;
  max: number;
  t: number;
  speed: number;
}

function advanceTraffic(mesh: InstancedMesh | null, cars: TrafficCar[], dummy: Object3D, delta: number) {
  if (!mesh) return;
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    c.t += c.direction * c.speed * Math.min(delta, 0.1);
    if (c.t > c.max) c.t = c.min;
    if (c.t < c.min) c.t = c.max;
    const lane = c.direction * 3; // drive on the right
    if (c.onAvenue) dummy.position.set(c.road - lane, 0.75, c.t);
    else dummy.position.set(c.t, 0.75, c.road + lane);
    dummy.rotation.set(0, c.onAvenue ? (c.direction > 0 ? 0 : Math.PI) : c.direction > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/** The city outside the garage. Static geometry is instanced; only traffic animates. */
export function City() {
  return (
    <group>
      <Roads />
      <Buildings />
      <Streetscape />
      <Traffic />
      <hemisphereLight args={["#8fa6c8", "#1a1d22", 0.7]} />
      <directionalLight position={[60, 120, 40]} intensity={0.6} color="#c9d6ff" />
    </group>
  );
}
