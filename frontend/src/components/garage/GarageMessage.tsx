import type { ReactNode } from "react";

/** A status line shown over the garage while the scene loads or if it fails. */
export function GarageMessage({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="pointer-events-none absolute inset-x-0 top-[38%] text-center text-sm tracking-wide text-brushed"
    >
      {children}
    </p>
  );
}
