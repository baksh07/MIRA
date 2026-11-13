"use client";

import type { ReactNode } from "react";
import { useGarageStore } from "@/stores/garageStore";

/**
 * Fades its content out (and out of the tab order) while the visitor is in or
 * entering the car. Content takes pointer events only while shown, so place it
 * inside a `pointer-events-none` container over the 3D scene.
 */
export function ExteriorOnly({ children, className = "" }: { children: ReactNode; className?: string }) {
  const outside = useGarageStore((state) => state.view === "exterior");
  return (
    <div
      inert={!outside}
      className={`transition-opacity duration-500 ${outside ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}
