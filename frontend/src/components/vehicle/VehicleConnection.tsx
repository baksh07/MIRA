"use client";

import { useEffect } from "react";
import { API_URL, sessionId } from "@/lib/api";
import { detectHabit } from "@/lib/habits";
import { useAssistantStore } from "@/stores/assistantStore";
import { useDriverStore } from "@/stores/driverStore";
import { useVehicleStore } from "@/stores/vehicleStore";
import type { VehicleState } from "@/types/vehicle";

const LOW_FUEL = 15;

/** Mirrors the backend's proactive notices for text mode (voice speaks them itself). */
function notice(before: VehicleState, after: VehicleState): string | null {
  if (after.trip.arrived_at && !before.trip.arrived_at) return `We've arrived at ${after.trip.arrived_at}. Hope you enjoyed the drive.`;
  if (after.fuel.level_percent < LOW_FUEL && before.fuel.level_percent >= LOW_FUEL)
    return `Heads up: fuel is down to ${Math.round(after.fuel.level_percent)}%, about ${after.fuel.range_km} km of range.`;
  return null;
}

/**
 * Keeps this tab connected to its simulated car and lets the car's confirmed
 * ambient-lighting colour drive the page accent (the `ambient` design token).
 */
export function VehicleConnection() {
  const color = useVehicleStore((state) => state.state?.ambient_lighting.color);

  useEffect(() => useVehicleStore.getState().connect(), []);

  // Habits: count what the identified driver keeps choosing (reset per driver).
  useEffect(() => {
    const counts = new Map<string, number>();
    let preferences: Record<string, string | number> = {};
    const unsubscribeDriver = useDriverStore.subscribe((next, prev) => {
      if (next.current?.id === prev.current?.id) return;
      counts.clear();
      preferences = {};
      if (next.current)
        void fetch(`${API_URL}/api/sessions/${sessionId()}/profile`)
          .then((r) => (r.ok ? r.json() : null))
          .then((profile) => {
            if (profile) preferences = profile.preferences;
          });
    });
    const unsubscribeVehicle = useVehicleStore.subscribe((next, prev) => {
      const driverReady = useDriverStore.getState().status === "identified" && !useDriverStore.getState().panelOpen;
      if (!next.state || !prev.state || !driverReady) return;
      const offer = detectHabit(counts, prev.state, next.state, preferences);
      if (offer) {
        useAssistantStore.getState().addTurn({ role: "assistant", text: offer.text, offer });
        useAssistantStore.getState().say(offer.text);
      }
    });
    return () => {
      unsubscribeDriver();
      unsubscribeVehicle();
    };
  }, []);

  useEffect(
    () =>
      useVehicleStore.subscribe((next, prev) => {
        if (!next.state || !prev.state || useAssistantStore.getState().voiceOn) return;
        const text = notice(prev.state, next.state);
        if (text) {
          useAssistantStore.getState().addTurn({ role: "assistant", text });
          useAssistantStore.getState().say(text);
        }
      }),
    [],
  );

  useEffect(() => {
    if (color) document.documentElement.style.setProperty("--color-ambient", color);
  }, [color]);

  return null;
}
