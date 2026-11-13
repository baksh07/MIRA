"use client";

import { useVehicleStore } from "@/stores/vehicleStore";

const WRAPS: Array<[string, string]> = [
  ["#D90012", "Red"],
  ["#1F4FD8", "Blue"],
  ["#E8E8E8", "White"],
  ["#111111", "Black"],
  ["#0B3D2E", "Racing green"],
  ["#F2C200", "Yellow"],
  ["#9AA0A6", "Silver"],
];

/** Showroom wrap colours. The car changes once the simulator confirms. */
export function WrapPicker() {
  const current = useVehicleStore((s) => s.state?.paint_color);
  const send = useVehicleStore((s) => s.send);
  if (!current) return null;
  return (
    <div className="mt-4 flex items-center gap-2" role="group" aria-label="Exterior wrap">
      <span className="mr-1 text-sm text-brushed">Wrap</span>
      {WRAPS.map(([color, name]) => (
        <button
          key={color}
          type="button"
          aria-label={`${name} wrap`}
          aria-pressed={current === color}
          title={name}
          onClick={() => void send({ type: "set_paint", color }).catch(() => undefined)}
          className={`size-6 rounded-full border border-halogen/20 ring-offset-2 ring-offset-floor transition-transform hover:scale-110 ${current === color ? "ring-2 ring-halogen" : ""}`}
          style={{ background: color }}
        />
      ))}
    </div>
  );
}
