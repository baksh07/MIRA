import { Box3, Group, type Material, type Mesh, type MeshStandardMaterial, type Object3D, Vector3 } from "three";
import type { DoorSide } from "@/stores/garageStore";

export interface DoorRig {
  /** Pivot on the door's front edge; rotate it about Y to swing the door. */
  pivot: Group;
  /** Rotation (radians) of a fully open door. */
  openAngle: number;
  /** Hotspot position by the door handle, in the car's local space. */
  handle: Vector3;
}

export interface SeatPose {
  /** Driver's eye point. */
  eye: Vector3;
  /** A point straight ahead through the windscreen. */
  lookAt: Vector3;
  /** Just outside the open driver's door, where the camera pauses on the way in and out. */
  approach: Vector3;
  /** Hotspot position in the open doorway. */
  getIn: Vector3;
}

export interface CarRig {
  doors: Record<DoorSide, DoorRig>;
  seat: SeatPose;
  /** Rims and tyres; each is centred on its hub, so it spins about its local x axis. */
  wheels: Object3D[];
  /** The body paint (a flat colour with clear-coat), recoloured live from the vehicle state. */
  paint: MeshStandardMaterial | null;
}

const DOOR_OPEN_ANGLE = 1.1; // ~63°
/** Door parts in the model: outer shell, inner trim panel and window glass. */
const doorParts = (code: "L" | "R") => new RegExp(`_door(panel|glass)?_${code}_\\d+$`);
const STEERING_WHEEL = /_dash_steer_a_\d+$/;
// GLTFLoader strips "." from node names, so the copies read e.g. "rimslaw_enkei_tsr_x_R21001_131".
const WHEEL_PARTS = /^(rimslaw_enkei_tsr_x_R21|m2g87undg_tire_01_R20)/;

function find(scene: Object3D, pattern: RegExp): Object3D[] {
  const found: Object3D[] = [];
  scene.traverse((object) => {
    if (pattern.test(object.name)) found.push(object);
  });
  return found;
}

/** Bounds of `objects` expressed in `scene`'s local space. */
function localBounds(scene: Object3D, objects: Object3D[]): Box3 {
  const box = new Box3();
  for (const object of objects) box.expandByObject(object);
  return box.applyMatrix4(scene.matrixWorld.clone().invert());
}

function rigDoor(scene: Object3D, side: DoorSide): DoorRig {
  const parts = find(scene, doorParts(side === "left" ? "L" : "R"));
  if (parts.length === 0) throw new Error(`Car model has no ${side} door parts`);

  const box = localBounds(scene, parts);
  // Left is +x. Each door hinges on its front (+z) edge and swings outward.
  const outward = side === "left" ? 1 : -1;
  const outerX = side === "left" ? box.max.x : box.min.x;

  const pivot = new Group();
  pivot.name = `door_pivot_${side}`;
  pivot.position.set(outerX - outward * 0.08, 0, box.max.z - 0.03);
  scene.add(pivot);
  pivot.updateMatrixWorld();
  for (const part of parts) pivot.attach(part); // keeps each part where it is in the world

  return {
    pivot,
    openAngle: -outward * DOOR_OPEN_ANGLE,
    handle: new Vector3(outerX + outward * 0.05, box.min.y + (box.max.y - box.min.y) * 0.72, box.min.z + 0.28),
  };
}

function seatPose(scene: Object3D, driverDoor: DoorRig): SeatPose {
  const [wheel] = find(scene, STEERING_WHEEL);
  if (!wheel) throw new Error("Car model has no steering wheel");
  const w = wheel.getWorldPosition(new Vector3()).applyMatrix4(scene.matrixWorld.clone().invert());
  return {
    eye: new Vector3(w.x, w.y + 0.24, w.z - 0.6),
    lookAt: new Vector3(w.x, w.y + 0.05, w.z + 2),
    approach: new Vector3(w.x + 1.7, w.y + 0.35, w.z - 0.7),
    // Seat height in the doorway, below the door hotspot so the two never overlap.
    getIn: new Vector3(driverDoor.handle.x - 0.25, w.y - 0.12, w.z - 0.5),
  };
}

/**
 * Prepares the loaded car for interaction: hinge pivots for both doors and the
 * driver's seat camera pose. The glTF scene is cached by the loader, so the
 * result is stored on it and the rig is built once per scene.
 */
export function rigCar(scene: Object3D): CarRig {
  const existing = scene.userData.rig as CarRig | undefined;
  if (existing) return existing;

  scene.updateMatrixWorld(true);
  const doors = { left: rigDoor(scene, "left"), right: rigDoor(scene, "right") };
  let paint: MeshStandardMaterial | null = null;
  scene.traverse((object) => {
    const material = (object as Mesh).material as Material | undefined;
    if (!paint && material && "color" in material && material.name.endsWith("_Paint")) paint = material as MeshStandardMaterial;
  });
  const rig: CarRig = { doors, seat: seatPose(scene, doors.left), wheels: find(scene, WHEEL_PARTS), paint };
  scene.userData.rig = rig;
  return rig;
}
