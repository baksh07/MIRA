"use client";

import { OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { MathUtils, type PerspectiveCamera, Vector3 } from "three";
import { type GarageView, useGarageStore } from "@/stores/garageStore";
import { useCar } from "./CarModel";

export const GARAGE_CAMERA_POSITION: [number, number, number] = [5.8, 1.6, 6.9];
const GARAGE_TARGET = new Vector3(0, 0.6, 0);
/** Leaving the car returns to the opening garage view. */
const EXIT_POSITION = new Vector3(...GARAGE_CAMERA_POSITION);
const GARAGE_FOV = 32;
/** Seated field of view: at least 58° vertical, widened on narrow screens to keep ~70° across, capped at 90°. */
const COCKPIT_MIN_FOV = 58;
const COCKPIT_HORIZONTAL_FOV = 70;
const COCKPIT_MAX_FOV = 90;

function cockpitFov(aspect: number): number {
  const vertical = MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(COCKPIT_HORIZONTAL_FOV / 2)) / aspect));
  return MathUtils.clamp(vertical, COCKPIT_MIN_FOV, COCKPIT_MAX_FOV);
}
/** In the seat the orbit target sits just ahead of the eye, so dragging turns the head. */
const HEAD_RADIUS = 0.05;
const MOVE_SPEED = 4.2;
const ARRIVED = 0.03;

/** The part of the orbit controls the rig drives (registered with `makeDefault`). */
interface OrbitTarget {
  target: Vector3;
}

interface Waypoint {
  position: Vector3;
  target: Vector3;
}

function dampVector(current: Vector3, goal: Vector3, lambda: number, delta: number) {
  current.set(
    MathUtils.damp(current.x, goal.x, lambda, delta),
    MathUtils.damp(current.y, goal.y, lambda, delta),
    MathUtils.damp(current.z, goal.z, lambda, delta),
  );
}

/** Camera framing in the garage: car clear of the page copy, whole on narrow screens. */
function garageFraming(width: number, height: number) {
  return {
    zoom: Math.min(1, Math.max(0.45, width / height / 1.75)),
    offsetX: width >= 1024 ? -width * 0.22 : 0,
    offsetY: width >= 1024 ? height * 0.06 : height * 0.2,
  };
}

/**
 * Moves the camera between the garage and the driver's seat and blends the
 * framing (view offset, zoom, field of view) between the two.
 */
export function CameraRig({ instant }: { instant: boolean }) {
  const { rig, offset } = useCar();
  const view = useGarageStore((state) => state.view);
  const finishTransition = useGarageStore((state) => state.finishTransition);
  const path = useRef<{ points: Waypoint[]; index: number } | null>(null);
  const framing = useRef(1); // 1 = garage framing, 0 = cockpit

  useEffect(() => {
    const eye = rig.seat.eye.clone().add(offset);
    const approach = rig.seat.approach.clone().add(offset);
    const ahead = rig.seat.lookAt.clone().add(offset).sub(eye).normalize().multiplyScalar(HEAD_RADIUS).add(eye);
    if (view === "entering") {
      path.current = { index: 0, points: [{ position: approach, target: eye }, { position: eye, target: ahead }] };
    } else if (view === "exiting") {
      path.current = { index: 0, points: [{ position: approach, target: eye }, { position: EXIT_POSITION, target: GARAGE_TARGET }] };
    }
  }, [view, rig, offset]);

  useFrame((state, delta) => {
    const camera = state.camera as PerspectiveCamera;
    const controls = state.controls as unknown as OrbitTarget | null;

    const move = path.current;
    if (move && controls) {
      if (instant) move.index = move.points.length - 1;
      const goal = move.points[move.index];
      if (instant) {
        camera.position.copy(goal.position);
        controls.target.copy(goal.target);
      } else {
        dampVector(camera.position, goal.position, MOVE_SPEED, delta);
        dampVector(controls.target, goal.target, MOVE_SPEED, delta);
      }
      if (camera.position.distanceTo(goal.position) < ARRIVED && controls.target.distanceTo(goal.target) < ARRIVED) {
        // Land exactly: in the seat the target is only HEAD_RADIUS ahead of the eye,
        // so even a few centimetres of leftover offset would skew the view.
        camera.position.copy(goal.position);
        controls.target.copy(goal.target);
        move.index++;
        if (move.index >= move.points.length) {
          path.current = null;
          finishTransition();
        }
      }
    }

    // Garage framing outside the car and on the first leg in; cockpit framing once at the door.
    const atDoor = move?.index ?? 0;
    const wantsGarage = view === "exterior" || (view === "entering" && atDoor === 0) || (view === "exiting" && atDoor >= 1);
    framing.current = instant ? Number(wantsGarage) : MathUtils.damp(framing.current, Number(wantsGarage), 3, delta);

    const { width, height } = state.size;
    const garage = garageFraming(width, height);
    const t = framing.current;
    camera.fov = MathUtils.lerp(cockpitFov(width / height), GARAGE_FOV, t);
    camera.zoom = MathUtils.lerp(1, garage.zoom, t);
    camera.setViewOffset(width, height, garage.offsetX * t, garage.offsetY * t, width, height);
    camera.updateProjectionMatrix();
  });

  return null;
}

function controlLimits(view: GarageView, turntable: boolean) {
  if (view === "exterior") {
    return {
      enabled: true,
      enableZoom: true,
      rotateSpeed: 1,
      minDistance: 4.5,
      maxDistance: 11,
      minPolarAngle: Math.PI * 0.2,
      maxPolarAngle: Math.PI * 0.47,
      minAzimuthAngle: -Infinity,
      maxAzimuthAngle: Infinity,
      autoRotate: turntable,
    };
  }
  if (view === "cockpit") {
    return {
      enabled: true,
      enableZoom: false,
      // The camera orbits a point just ahead of the eye; reversed so dragging feels like turning the head.
      rotateSpeed: -0.35,
      minDistance: HEAD_RADIUS,
      maxDistance: HEAD_RADIUS,
      minPolarAngle: Math.PI / 2 - 0.55,
      maxPolarAngle: Math.PI / 2 + 0.4,
      // Looking forward (+z) puts the camera behind the target at azimuth π; allow ±75°.
      minAzimuthAngle: Math.PI - 1.3,
      maxAzimuthAngle: -Math.PI + 1.3,
      autoRotate: false,
    };
  }
  // Moving: the rig owns the camera, so no limits may pull it back.
  return {
    enabled: false,
    enableZoom: false,
    rotateSpeed: 1,
    minDistance: 0,
    maxDistance: Infinity,
    minPolarAngle: 0,
    maxPolarAngle: Math.PI,
    minAzimuthAngle: -Infinity,
    maxAzimuthAngle: Infinity,
    autoRotate: false,
  };
}

/** Orbit controls whose limits follow where the visitor is. */
export function GarageControls({ instant }: { instant: boolean }) {
  const view = useGarageStore((state) => state.view);
  const interacted = useGarageStore((state) => state.interacted);
  const markInteracted = useGarageStore((state) => state.markInteracted);
  // The car turns slowly on its turntable until the visitor takes control.
  const turntable = !instant && !interacted;
  return (
    <OrbitControls
      makeDefault
      // A constant reference, so it is applied once and never resets the seated view.
      target={GARAGE_TARGET}
      enablePan={false}
      autoRotateSpeed={0.35}
      onStart={markInteracted}
      {...controlLimits(view, turntable)}
    />
  );
}
