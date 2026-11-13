import { describe, expect, it } from "vitest";
import type { VehicleState } from "@/types/vehicle";
import { detectHabit } from "./habits";

const base: VehicleState = {
  climate: { temperature_c: 21, fan_speed: 3 },
  seat: { driver_heating: 0 },
  ambient_lighting: { color: "#5AA9FF", brightness: 70 },
  driving_mode: "comfort",
  music: { playing: false, track: "t", artist: "a", volume: 40 },
  navigation: { destination: null, distance_km: null, eta_minutes: null },
  fuel: { level_percent: 60, range_km: 384 },
  windows: { front_left: 0, front_right: 0 },
  doors: { left_open: false, right_open: false },
  trip: { active: false, speed_kmh: 0, remaining_km: null, total_km: null, arrived_at: null },
  scene: null,
  version: 0,
};
const withTemp = (t: number): VehicleState => ({ ...base, climate: { ...base.climate, temperature_c: t } });

describe("detectHabit", () => {
  it("offers to remember a value chosen twice that differs from the preference", () => {
    const counts = new Map<string, number>();
    expect(detectHabit(counts, base, withTemp(24), { temperature_c: 22 })).toBeNull();
    expect(detectHabit(counts, withTemp(24), withTemp(21), { temperature_c: 22 })).toBeNull();
    const offer = detectHabit(counts, withTemp(21), withTemp(24), { temperature_c: 22 });
    expect(offer).toMatchObject({ key: "temperature_c", value: 24 });
  });

  it("does not offer what is already the preference, nor twice", () => {
    const counts = new Map<string, number>();
    detectHabit(counts, base, withTemp(22), { temperature_c: 22 });
    expect(detectHabit(counts, withTemp(21), withTemp(22), { temperature_c: 22 })).toBeNull();
    detectHabit(counts, base, withTemp(25), {});
    expect(detectHabit(counts, withTemp(21), withTemp(25), {})).not.toBeNull();
    expect(detectHabit(counts, withTemp(21), withTemp(25), {})).toBeNull();
  });

  it("ignores changes made by a scene", () => {
    const counts = new Map<string, number>();
    const scene = { ...withTemp(20), scene: "focus" };
    expect(detectHabit(counts, base, scene, {})).toBeNull();
    expect(counts.size).toBe(0);
  });
});
