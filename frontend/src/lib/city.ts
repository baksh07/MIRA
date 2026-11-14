/**
 * The stylised city around MIRA's garage: a road grid, landmark destinations
 * and routes along the roads. Pure data (no three.js) so it is easy to test.
 *
 * World axes: x to the right, z forward (the car starts facing +z), metres.
 * The garage sits at the origin; its door opens onto the avenue x = 0, which
 * meets the first cross street at z = FIRST_STREET.
 */

export interface Point {
  x: number;
  z: number;
}

export const ROAD_WIDTH = 12;
export const BLOCK = 80; // distance between road centres
export const FIRST_STREET = 26;
export const GRID = 5; // roads in each direction
export const AVENUES = Array.from({ length: GRID }, (_, i) => (i - (GRID - 1) / 2) * BLOCK); // x of north-south roads
export const STREETS = Array.from({ length: GRID }, (_, i) => FIRST_STREET + i * BLOCK); // z of east-west roads
export const GARAGE_EXIT: Point = { x: 0, z: 18 }; // where "let's roll" stops, just outside the door
export const CITY_BOUNDS = {
  minX: AVENUES[0] - BLOCK / 2,
  maxX: AVENUES[GRID - 1] + BLOCK / 2,
  minZ: -BLOCK / 2,
  maxZ: STREETS[GRID - 1] + BLOCK / 2,
};

/** Seeded random numbers so the city looks the same on every visit. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (const char of text.toLowerCase().trim()) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Every intersection except the garage's own corner. */
const DESTINATION_NODES: Point[] = STREETS.flatMap((z) => AVENUES.map((x) => ({ x, z }))).filter(
  (p) => !(p.x === 0 && p.z === FIRST_STREET),
);

/** The intersection standing in for a named destination (stable per name). */
export function destinationPoint(name: string): Point {
  return DESTINATION_NODES[hash(name) % DESTINATION_NODES.length];
}

const nearest = (values: number[], v: number) => values.reduce((best, c) => (Math.abs(c - v) < Math.abs(best - v) ? c : best));

/** Snap a position onto the nearest road (avenue or street), whichever is closer. */
export function snapToRoad(p: Point): Point {
  const avenue = nearest(AVENUES, p.x);
  const street = nearest(STREETS, p.z);
  if (p.z < FIRST_STREET) return { x: 0, z: Math.max(p.z, 0) }; // the garage driveway
  return Math.abs(p.x - avenue) <= Math.abs(p.z - street) ? { x: avenue, z: p.z } : { x: p.x, z: street };
}

/**
 * A route along the roads from `from` to `to` (an intersection): onto the
 * nearest road, to an intersection, then along streets and avenues.
 */
export function planRoute(from: Point, to: Point): Point[] {
  const route: Point[] = [from];
  const push = (p: Point) => {
    const last = route[route.length - 1];
    if (Math.hypot(p.x - last.x, p.z - last.z) > 0.5) route.push(p);
  };
  const onRoad = snapToRoad(from);
  push(onRoad);
  const onAvenue =
    AVENUES.some((x) => Math.abs(x - onRoad.x) < 0.5) && !STREETS.some((z) => Math.abs(z - onRoad.z) < 0.5 && onRoad.x !== 0);
  // Manhattan route: along the current road to the destination's street (or avenue), then turn.
  push(onAvenue ? { x: onRoad.x, z: to.z } : { x: to.x, z: onRoad.z });
  push(to);
  return route;
}

export function routeLength(route: Point[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) total += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
  return total;
}

/** The point `distance` metres along the route (clamped to its ends). */
export function pointAlong(route: Point[], distance: number): Point {
  let left = Math.max(0, distance);
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= length) {
      const t = length === 0 ? 0 : left / length;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    left -= length;
  }
  return route[route.length - 1];
}

/** Heading (radians, 0 = +z, positive turns towards +x) from a to b. */
export function headingTo(a: Point, b: Point): number {
  return Math.atan2(b.x - a.x, b.z - a.z);
}
