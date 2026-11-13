"use client";

import { useEffect, useRef } from "react";
import { AVENUES, CITY_BOUNDS, FIRST_STREET, STREETS, destinationPoint } from "@/lib/city";
import { drive, pose, useDriveHud } from "@/lib/drive";
import { useGarageStore } from "@/stores/garageStore";
import { useVehicleStore } from "@/stores/vehicleStore";

const SIZE = 168;
const RANGE = 140; // metres shown from the car to the edge

/**
 * Navigation map, centred on the car with the direction of travel up: roads,
 * the planned route and the destination. Redrawn every frame on a canvas.
 */
export function Minimap() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const outside = useDriveHud((s) => s.outside);
  const destination = useVehicleStore((s) => s.state?.navigation.destination ?? null);
  const view = useGarageStore((s) => s.view);
  const visible = view === "cockpit" && (outside || Boolean(destination));

  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const g = canvas.current?.getContext("2d");
      if (!g) return;
      const dpr = window.devicePixelRatio || 1;
      const px = SIZE * dpr;
      if (g.canvas.width !== px) g.canvas.width = g.canvas.height = px;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, SIZE, SIZE);
      const scale = SIZE / 2 / RANGE;
      g.save();
      g.beginPath();
      g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = "rgba(10,12,16,0.82)";
      g.fillRect(0, 0, SIZE, SIZE);
      // Car-centred, heading up. Screen x is mirrored (world +x is the car's left).
      g.translate(SIZE / 2, SIZE / 2);
      g.rotate(pose.heading);
      g.scale(-scale, -scale);
      g.translate(-pose.x, -pose.z);
      g.lineCap = "round";
      g.strokeStyle = "#3a3f47";
      g.lineWidth = 9;
      g.beginPath();
      for (const x of AVENUES) {
        g.moveTo(x, FIRST_STREET);
        g.lineTo(x, CITY_BOUNDS.maxZ);
      }
      for (const z of STREETS) {
        g.moveTo(CITY_BOUNDS.minX, z);
        g.lineTo(CITY_BOUNDS.maxX, z);
      }
      g.moveTo(0, 0);
      g.lineTo(0, FIRST_STREET);
      g.stroke();
      const accent = useVehicleStore.getState().state?.ambient_lighting.color ?? "#5AA9FF";
      if (drive.route) {
        g.strokeStyle = accent;
        g.lineWidth = 4;
        g.beginPath();
        drive.route.forEach((p, i) => (i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z)));
        g.stroke();
      }
      const target = useVehicleStore.getState().state?.navigation.destination;
      if (target) {
        const p = destinationPoint(target);
        g.fillStyle = accent;
        g.beginPath();
        g.arc(p.x, p.z, 6, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      // The car, always in the middle pointing up.
      g.fillStyle = "#EEF0F2";
      g.beginPath();
      g.moveTo(SIZE / 2, SIZE / 2 - 8);
      g.lineTo(SIZE / 2 + 6, SIZE / 2 + 6);
      g.lineTo(SIZE / 2, SIZE / 2 + 3);
      g.lineTo(SIZE / 2 - 6, SIZE / 2 + 6);
      g.closePath();
      g.fill();
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  if (!visible) return null;
  return (
    <div
      className="pointer-events-none fixed top-[9.5rem] left-4 z-10 sm:left-10"
      aria-label={destination ? `Navigation to ${destination}` : "Map"}
    >
      <canvas ref={canvas} style={{ width: SIZE, height: SIZE }} className="rounded-full border border-halogen/10 shadow-lg" />
      {destination && <p className="mt-1 w-[168px] truncate text-center text-xs text-brushed">→ {destination}</p>}
    </div>
  );
}
