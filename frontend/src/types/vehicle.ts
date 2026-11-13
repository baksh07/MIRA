/**
 * Vehicle state as served by the backend simulator (mirrors
 * backend/src/mira_backend/models/vehicle.py). The backend is the authority:
 * the frontend only renders this and sends commands.
 */

export type DrivingMode = "eco" | "comfort" | "sport" | "sport_plus";

export interface VehicleState {
  climate: { temperature_c: number; fan_speed: number };
  seat: { driver_heating: number };
  ambient_lighting: { color: string; brightness: number };
  driving_mode: DrivingMode;
  music: { playing: boolean; track: string; artist: string; volume: number };
  navigation: { destination: string | null; distance_km: number | null; eta_minutes: number | null };
  fuel: { level_percent: number; range_km: number };
  windows: { front_left: number; front_right: number };
  doors: { left_open: boolean; right_open: boolean };
  trip: { active: boolean; speed_kmh: number; remaining_km: number | null; total_km: number | null; arrived_at: string | null };
  scene: string | null;
  paint_color: string;
  in_garage: boolean;
  version: number;
}

export type VehicleCommand =
  | { type: "set_temperature"; celsius: number }
  | { type: "set_fan_speed"; level: number }
  | { type: "set_seat_heating"; level: number }
  | { type: "set_ambient_lighting"; color?: string; brightness?: number }
  | { type: "set_driving_mode"; mode: DrivingMode }
  | { type: "control_music"; action?: "play" | "pause" | "next" | "previous"; volume?: number }
  | { type: "set_destination"; destination: string }
  | { type: "clear_destination" }
  | { type: "set_window"; window: "front_left" | "front_right" | "both"; percent_open: number }
  | { type: "set_door"; door: "left" | "right"; open: boolean }
  | { type: "set_paint"; color: string }
  | { type: "start_trip" }
  | { type: "stop_trip" }
  | { type: "leave_garage" }
  | { type: "refuel" }
  | { type: "apply_scene"; scene: SceneName };

export type SceneName = "relax" | "focus" | "sport" | "night" | "cozy";

export interface CommandResult {
  ok: boolean;
  message: string;
  state: VehicleState;
}
