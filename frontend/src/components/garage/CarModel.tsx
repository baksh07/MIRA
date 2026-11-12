"use client";

import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import { Box3, Vector3 } from "three";

/**
 * Built by scripts/build-car-model.mjs from "BMW M2 g87 [Free]" by Black Snow
 * (CC BY 4.0), with manufacturer branding removed. Credited in the footer.
 */
export const CAR_MODEL_URL = "/models/coupe.glb";

/** The car, parked with its wheels on the floor (y = 0) and centred on the turntable. */
export function CarModel() {
  const { scene } = useGLTF(CAR_MODEL_URL);

  const offset = useMemo(() => {
    scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(scene);
    const center = bounds.getCenter(new Vector3());
    return new Vector3(-center.x, -bounds.min.y, -center.z);
  }, [scene]);

  return (
    <group position={offset}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload(CAR_MODEL_URL);
