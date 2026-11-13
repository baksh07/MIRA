"use client";

import { useDriveHud } from "@/lib/drive";
import { useVehicleStore } from "@/stores/vehicleStore";

const MODE_LABEL = { eco: "ECO", comfort: "COMFORT", sport: "SPORT", sport_plus: "SPORT+" } as const;

/**
 * MIRA's own instrument cluster. Values come from the confirmed vehicle state,
 * except speed and gear while the driver steers with the keyboard.
 */
export function InstrumentCluster() {
  const state = useVehicleStore((s) => s.state);
  const connection = useVehicleStore((s) => s.connection);
  const manual = useDriveHud((s) => s.mode === "manual");
  const manualSpeed = useDriveHud((s) => s.speedKmh);
  const reversing = useDriveHud((s) => s.reversing);
  if (!state) {
    return (
      <div className="border border-halogen/10 bg-floor/60 backdrop-blur-md backdrop-saturate-150 rounded-3xl px-6 py-4 text-sm text-brushed">
        {connection === "offline" ? "Car systems offline — reconnecting…" : "Starting car systems…"}
      </div>
    );
  }
  const fuel = Math.round(state.fuel.level_percent);
  return (
    <div className="border border-halogen/10 bg-floor/60 backdrop-blur-md backdrop-saturate-150 flex items-center gap-6 rounded-3xl px-6 py-4" aria-label="Instrument cluster">
      <div className="text-center">
        <p className="text-4xl font-black tabular-nums [font-stretch:115%]">{manual ? manualSpeed : Math.round(state.trip.speed_kmh)}</p>
        <p className="text-[10px] tracking-widest text-brushed">
          KM/H · {state.trip.active ? "AUTO" : manual ? (reversing ? "R" : manualSpeed > 0 ? "D" : "N") : "P"}
        </p>
      </div>
      <div className="h-12 w-px bg-halogen/10" />
      <div>
        <p className="text-xs font-bold tracking-[0.2em] text-ambient">{MODE_LABEL[state.driving_mode]}</p>
        <p className="mt-1 text-sm tabular-nums">
          {state.fuel.range_km} <span className="text-brushed">km range</span>
        </p>
        <div className="mt-1.5 h-1 w-28 overflow-hidden rounded-full bg-halogen/10" aria-label={`Fuel ${fuel}%`}>
          <div className="h-full rounded-full bg-ambient" style={{ width: `${fuel}%` }} />
        </div>
      </div>
      <div className="h-12 w-px bg-halogen/10" />
      <div className="text-sm">
        <p className="tabular-nums">
          {state.climate.temperature_c.toFixed(1)}°C <span className="text-brushed">· fan {state.climate.fan_speed}</span>
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-brushed">
          Seat
          {[1, 2, 3].map((level) => (
            <span key={level} className={`size-1.5 rounded-full ${state.seat.driver_heating >= level ? "bg-[#FF8A2D]" : "bg-halogen/15"}`} />
          ))}
        </p>
      </div>
      {state.navigation.destination && (
        <>
          <div className="h-12 w-px bg-halogen/10" />
          <div className="max-w-40 text-sm">
            <p className="truncate">{state.navigation.destination}</p>
            <p className="text-brushed tabular-nums">
              {state.navigation.distance_km} km · {state.navigation.eta_minutes} min
            </p>
            {state.trip.active && state.trip.total_km ? (
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-halogen/10">
                <div className="h-full rounded-full bg-ambient transition-[width] duration-500" style={{ width: `${100 - ((state.trip.remaining_km ?? 0) / state.trip.total_km) * 100}%` }} />
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
