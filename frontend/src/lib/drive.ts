import { create } from "zustand";
import type { VehicleState } from "@/types/vehicle";
import {
  AVENUES,
  CITY_BOUNDS,
  FIRST_STREET,
  GARAGE_EXIT,
  type Point,
  STREETS,
  destinationPoint,
  headingTo,
  planRoute,
  pointAlong,
  routeLength,
} from "./city";

/**
 * Where the car is in the city and how it moves. The pose is visual only:
 * the vehicle simulator stays the authority for trips, speed shown by the
 * cluster on autopilot, doors and the garage. On autopilot the car follows the
 * simulator's trip progress along a road route; with W A S D the driver steers
 * it themselves (pressing a key first asks the simulator to stop the trip or
 * leave the garage).
 *
 * Mutated every frame, so it lives outside React; the HUD reads a throttled copy.
 */
export type DriveMode = "parked" | "rollout" | "autopilot" | "manual";

export const pose = { x: 0, z: 0, heading: 0, speed: 0 };
export const keys = { forward: false, back: false, left: false, right: false };

export const GARAGE = {
  halfWidth: 14,
  back: -14,
  door: 12,
  doorHalfWidth: 5,
  height: 6,
};

interface DriveInternals {
  mode: DriveMode;
  route: Point[] | null;
  routeLength: number;
  along: number;
  door: number; // 0 closed … 1 open
  requested: { stop: boolean; leave: boolean };
}

export const drive: DriveInternals = {
  mode: "parked",
  route: null,
  routeLength: 0,
  along: 0,
  door: 0,
  requested: { stop: false, leave: false },
};

/** Throttled copy for React (HUD, minimap toggles). */
export const useDriveHud = create<{
  mode: DriveMode;
  speedKmh: number;
  outside: boolean;
  reversing: boolean;
}>(() => ({
  mode: "parked",
  speedKmh: 0,
  outside: false,
  reversing: false,
}));

export interface DriveActions {
  stopTrip: () => void;
  leaveGarage: () => void;
}

const MAX_SPEED = 25; // m/s, manual
const MAX_REVERSE = 6;
const ACCEL = 7;
const BRAKE = 14;
const DRAG = 2.5;
const STEER = 1.3; // rad/s at speed

const damp = (from: number, to: number, lambda: number, dt: number) => from + (to - from) * (1 - Math.exp(-lambda * dt));

function dampAngle(from: number, to: number, lambda: number, dt: number): number {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + diff * (1 - Math.exp(-lambda * dt));
}

export function insideGarage(p: Point): boolean {
  return Math.abs(p.x) < GARAGE.halfWidth && p.z > GARAGE.back && p.z < GARAGE.door;
}

/** Where the car may be: inside the garage (through the door only when it's open) or on a road. */
export function drivable(p: Point, doorOpen: boolean): boolean {
  const margin = 1.6;
  if (insideGarage(p)) {
    const inRoom = Math.abs(p.x) < GARAGE.halfWidth - margin && p.z > GARAGE.back + margin;
    return inRoom && (p.z < GARAGE.door - margin || (doorOpen && Math.abs(p.x) < GARAGE.doorHalfWidth - margin));
  }
  if (p.x < CITY_BOUNDS.minX || p.x > CITY_BOUNDS.maxX || p.z > CITY_BOUNDS.maxZ) return false;
  const half = 7 - margin / 2;
  if (p.z < FIRST_STREET) return Math.abs(p.x) < (doorOpen ? half : 0) && p.z >= GARAGE.door - margin; // driveway
  return AVENUES.some((x) => Math.abs(p.x - x) < half) || STREETS.some((z) => Math.abs(p.z - z) < half);
}

function anyKey(): boolean {
  return keys.forward || keys.back || keys.left || keys.right;
}

function manualStep(dt: number) {
  const throttle = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
  if (throttle > 0) pose.speed += (pose.speed < 0 ? BRAKE : ACCEL) * dt;
  else if (throttle < 0) pose.speed -= (pose.speed > 0 ? BRAKE : ACCEL) * dt;
  else pose.speed = damp(pose.speed, 0, DRAG / 4, dt);
  pose.speed = Math.max(-MAX_REVERSE, Math.min(MAX_SPEED, pose.speed));
  if (Math.abs(pose.speed) < 0.05 && throttle === 0) pose.speed = 0;
  const steer = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  pose.heading += steer * STEER * Math.min(1, Math.abs(pose.speed) / 6) * Math.sign(pose.speed) * dt;
  const next = {
    x: pose.x + Math.sin(pose.heading) * pose.speed * dt,
    z: pose.z + Math.cos(pose.heading) * pose.speed * dt,
  };
  if (drivable(next, drive.door > 0.85)) {
    pose.x = next.x;
    pose.z = next.z;
  } else {
    pose.speed *= -0.2; // bump
  }
}

function followRoute(target: number, dt: number) {
  const route = drive.route;
  if (!route) return;
  const before = drive.along;
  drive.along = damp(drive.along, Math.min(target, drive.routeLength), 1.5, dt);
  const here = pointAlong(route, drive.along);
  const ahead = pointAlong(route, drive.along + 6);
  pose.x = here.x;
  pose.z = here.z;
  if (Math.hypot(ahead.x - here.x, ahead.z - here.z) > 0.5) pose.heading = dampAngle(pose.heading, headingTo(here, ahead), 3, dt);
  pose.speed = dt > 0 ? (drive.along - before) / dt : 0;
}

/** Advance the car one frame. */
export function stepDrive(dt: number, car: VehicleState | null, actions: DriveActions) {
  if (!car) return;
  const trip = car.trip;
  // The garage door follows the simulator; it opens before the car rolls.
  drive.door = Math.min(1, Math.max(0, drive.door + (car.in_garage ? -1 : 1) * dt * 0.6));
  const doorOpen = drive.door > 0.85;

  if (anyKey()) {
    if (trip.active && !drive.requested.stop) {
      drive.requested.stop = true;
      actions.stopTrip();
    }
    if (car.in_garage && !drive.requested.leave) {
      drive.requested.leave = true;
      actions.leaveGarage();
    }
    if (!trip.active) drive.mode = "manual";
  }
  if (!trip.active) drive.requested.stop = false;
  if (!car.in_garage) drive.requested.leave = false;

  if (trip.active && drive.mode !== "manual") {
    if (drive.mode !== "autopilot" || !drive.route) {
      const destination = car.navigation.destination ?? trip.arrived_at;
      if (destination) {
        drive.route = planRoute({ x: pose.x, z: pose.z }, destinationPoint(destination));
        drive.routeLength = routeLength(drive.route);
        drive.along = 0;
        drive.mode = "autopilot";
      }
    }
    const total = trip.total_km ?? 0;
    const progress = total > 0 ? 1 - (trip.remaining_km ?? total) / total : 0;
    followRoute(doorOpen ? progress * drive.routeLength : 0, dt);
  } else if (drive.mode === "autopilot") {
    // Trip over: arrived (finish the last metres) or stopped (hold position).
    if (trip.arrived_at) followRoute(drive.routeLength, dt);
    if (!trip.arrived_at || drive.routeLength - drive.along < 0.3) {
      drive.mode = "parked";
      drive.route = null;
      pose.speed = 0;
    }
  } else if (drive.mode === "manual") {
    manualStep(dt);
  } else if (!car.in_garage && insideGarage(pose) && doorOpen) {
    drive.mode = "rollout";
  }

  if (drive.mode === "rollout") {
    const remaining = GARAGE_EXIT.z - pose.z;
    pose.speed = Math.min(5, Math.max(0, remaining * 0.8));
    pose.z += pose.speed * dt;
    pose.heading = dampAngle(pose.heading, 0, 3, dt);
    if (remaining < 0.05) {
      drive.mode = "parked";
      pose.speed = 0;
    }
  }
}

let hudClock = 0;
/** Publish the throttled HUD copy (4 times a second). */
export function publishHud(dt: number) {
  hudClock += dt;
  if (hudClock < 0.25) return;
  hudClock = 0;
  const next = {
    mode: drive.mode,
    speedKmh: Math.round(Math.abs(pose.speed) * 3.6),
    outside: !insideGarage(pose),
    reversing: pose.speed < -0.1,
  };
  const current = useDriveHud.getState();
  if ((Object.keys(next) as Array<keyof typeof next>).some((k) => current[k] !== next[k])) useDriveHud.setState(next);
}
