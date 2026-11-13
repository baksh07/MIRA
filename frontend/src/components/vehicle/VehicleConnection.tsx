"use client";

import { useEffect } from "react";
import { useVehicleStore } from "@/stores/vehicleStore";

/**
 * Keeps this tab connected to its simulated car and lets the car's confirmed
 * ambient-lighting colour drive the page accent (the `ambient` design token).
 */
export function VehicleConnection() {
  const color = useVehicleStore((state) => state.state?.ambient_lighting.color);

  useEffect(() => useVehicleStore.getState().connect(), []);

  useEffect(() => {
    if (color) document.documentElement.style.setProperty("--color-ambient", color);
  }, [color]);

  return null;
}
