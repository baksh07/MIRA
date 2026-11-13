import type { VehicleState } from "@/types/vehicle";

/** A setting MIRA may offer to remember as the driver's usual. */
export interface HabitOffer {
  key: "temperature_c" | "seat_heating" | "driving_mode" | "ambient_color";
  value: string | number;
  text: string;
}

const WATCHED: Array<{ key: HabitOffer["key"]; read: (s: VehicleState) => string | number; describe: (v: string | number) => string }> = [
  { key: "temperature_c", read: (s) => s.climate.temperature_c, describe: (v) => `${v} °C` },
  { key: "seat_heating", read: (s) => s.seat.driver_heating, describe: (v) => (v === 0 ? "seat heating off" : `seat heating on ${v}`) },
  { key: "driving_mode", read: (s) => s.driving_mode, describe: (v) => `${String(v).replace("_", " ")} mode` },
  { key: "ambient_color", read: (s) => s.ambient_lighting.color, describe: () => "this ambient colour" },
];

/** How many times the driver has chosen the same value before MIRA offers to remember it. */
export const HABIT_THRESHOLD = 2;

/**
 * Counts confirmed changes per setting/value. Returns an offer when a value
 * has been chosen often enough and differs from the stored preference.
 * Scene changes are ignored (they are a mood, not a habit).
 */
export function detectHabit(
  counts: Map<string, number>,
  before: VehicleState,
  after: VehicleState,
  preferences: Record<string, string | number>,
): HabitOffer | null {
  if (after.scene !== before.scene && after.scene) return null;
  for (const { key, read, describe } of WATCHED) {
    const value = read(after);
    if (value === read(before)) continue;
    const id = `${key}=${value}`;
    const count = (counts.get(id) ?? 0) + 1;
    counts.set(id, count);
    if (count === HABIT_THRESHOLD && String(preferences[key]) !== String(value)) {
      return { key, value, text: `You keep choosing ${describe(value)}. Shall I make that your usual?` };
    }
  }
  return null;
}
