"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import { useVehicleStore } from "@/stores/vehicleStore";
import type { DrivingMode, VehicleCommand } from "@/types/vehicle";

const SWATCHES = ["#5AA9FF", "#8A4DFF", "#FF5A8A", "#FF8A2D", "#2DFF8A", "#FFD9A8"];
const MODES: DrivingMode[] = ["eco", "comfort", "sport", "sport_plus"];

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="glass rounded-2xl p-4">
      <h3 className="text-[10px] font-semibold tracking-[0.2em] text-brushed uppercase">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Pill({ onClick, active, children, label }: { onClick: () => void; active?: boolean; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs transition-colors ${active ? "bg-ambient text-floor" : "bg-halogen/8 hover:bg-halogen/15"}`}
    >
      {children}
    </button>
  );
}

/**
 * The centre screen. Controls send commands; what is shown is always the
 * state the simulator confirmed (nothing changes optimistically).
 */
export function CenterDisplay() {
  const state = useVehicleStore((s) => s.state);
  const sendCommand = useVehicleStore((s) => s.send);
  const [destination, setDestination] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!state) return null;
  const send = (command: VehicleCommand) =>
    sendCommand(command).then(
      () => setError(null),
      (e: unknown) => setError(e instanceof Error ? e.message : "Command failed"),
    );
  const navigate = (event: FormEvent) => {
    event.preventDefault();
    if (destination.trim().length >= 2) void send({ type: "set_destination", destination: destination.trim() }).then(() => setDestination(""));
  };

  return (
    <div className="flex w-72 flex-col gap-3" aria-label="Centre display">
      <Card title="Climate">
        <div className="flex items-center justify-between">
          <Pill label="Cooler" onClick={() => send({ type: "set_temperature", celsius: Math.max(16, state.climate.temperature_c - 0.5) })}>−</Pill>
          <span className="text-2xl font-bold tabular-nums">{state.climate.temperature_c.toFixed(1)}°</span>
          <Pill label="Warmer" onClick={() => send({ type: "set_temperature", celsius: Math.min(30, state.climate.temperature_c + 0.5) })}>+</Pill>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-brushed">
          Seat
          {[0, 1, 2, 3].map((level) => (
            <Pill key={level} active={state.seat.driver_heating === level} onClick={() => send({ type: "set_seat_heating", level })}>
              {level === 0 ? "Off" : level}
            </Pill>
          ))}
        </div>
      </Card>

      <Card title="Drive mode">
        <div className="flex flex-wrap gap-1.5">
          {MODES.map((mode) => (
            <Pill key={mode} active={state.driving_mode === mode} onClick={() => send({ type: "set_driving_mode", mode })}>
              {mode === "sport_plus" ? "Sport+" : mode[0].toUpperCase() + mode.slice(1)}
            </Pill>
          ))}
        </div>
      </Card>

      <Card title="Ambient light">
        <div className="flex items-center gap-2">
          {SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Ambient colour ${color}`}
              onClick={() => send({ type: "set_ambient_lighting", color })}
              className={`size-6 rounded-full ring-offset-2 ring-offset-wall ${state.ambient_lighting.color === color ? "ring-2 ring-halogen" : ""}`}
              style={{ background: color }}
            />
          ))}
        </div>
        <input
          type="range" min={0} max={100} step={5} aria-label="Ambient brightness"
          defaultValue={state.ambient_lighting.brightness}
          key={state.ambient_lighting.brightness}
          onPointerUp={(e) => send({ type: "set_ambient_lighting", brightness: Number(e.currentTarget.value) })}
          onKeyUp={(e) => send({ type: "set_ambient_lighting", brightness: Number(e.currentTarget.value) })}
          className="mt-3 w-full accent-[var(--color-ambient)]"
        />
      </Card>

      <Card title="Now playing">
        <p className="truncate text-sm font-medium">{state.music.track}</p>
        <p className="truncate text-xs text-brushed">{state.music.artist}</p>
        <div className="mt-2 flex items-center gap-1.5">
          <Pill label="Previous" onClick={() => send({ type: "control_music", action: "previous" })}>⏮</Pill>
          <Pill label={state.music.playing ? "Pause" : "Play"} active={state.music.playing} onClick={() => send({ type: "control_music", action: state.music.playing ? "pause" : "play" })}>
            {state.music.playing ? "❚❚" : "▶"}
          </Pill>
          <Pill label="Next" onClick={() => send({ type: "control_music", action: "next" })}>⏭</Pill>
          <span className="ml-auto text-xs text-brushed tabular-nums">vol {state.music.volume}</span>
        </div>
      </Card>

      <Card title="Navigation">
        {state.navigation.destination ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">
              {state.navigation.destination} · {state.navigation.eta_minutes} min
            </span>
            <Pill onClick={() => send({ type: "clear_destination" })}>End</Pill>
          </div>
        ) : (
          <form onSubmit={navigate} className="flex gap-2">
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Where to?"
              aria-label="Destination"
              maxLength={120}
              className="min-w-0 flex-1 rounded-full bg-halogen/8 px-3 py-1.5 text-xs outline-none placeholder:text-brushed focus:bg-halogen/12"
            />
            <button type="submit" className="rounded-full bg-halogen/8 px-3 py-1.5 text-xs hover:bg-halogen/15">
              Go
            </button>
          </form>
        )}
      </Card>
      {error && <p className="text-xs text-[#FF8A8A]" role="alert">{error}</p>}
    </div>
  );
}
