"use client";

import { useCallback, useEffect, useState } from "react";
import { API_URL, sessionId } from "@/lib/api";
import { useAssistantStore } from "@/stores/assistantStore";
import type { DriverProfile } from "@/types/driver";

const PREF_LABEL: Record<string, string> = {
  temperature_c: "Temperature",
  seat_heating: "Seat heating",
  fan_speed: "Fan",
  ambient_color: "Ambient colour",
  ambient_brightness: "Ambient brightness",
  driving_mode: "Drive mode",
  music_volume: "Music volume",
};

/** What MIRA remembers about the identified driver. Every memory can be deleted. */
export function MemoryPanel() {
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Re-read after each turn: MIRA may have just remembered something.
  const turns = useAssistantStore((s) => s.turns.length);

  const load = useCallback(async () => {
    const response = await fetch(`${API_URL}/api/sessions/${sessionId()}/profile`);
    if (response.ok) {
      setProfile((await response.json()) as DriverProfile);
      setError(null);
    } else {
      setError(response.status === 404 ? "Select a driver to see what MIRA remembers." : "Could not load memories.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching on open and after each turn
    void load();
  }, [load, turns]);

  const forget = async (id: string) => {
    const response = await fetch(`${API_URL}/api/sessions/${sessionId()}/memories/${id}`, { method: "DELETE" });
    if (response.ok) void load();
    else setError("Could not delete that memory.");
  };

  if (error) return <p className="text-sm text-brushed">{error}</p>;
  if (!profile) return <p className="text-sm text-brushed">Loading…</p>;

  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="text-[10px] font-semibold tracking-[0.2em] text-brushed uppercase">{profile.driver.display_name}&apos;s preferences</p>
        <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
          {Object.entries(profile.preferences).map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-brushed">{PREF_LABEL[key] ?? key}</dt>
              <dd className="flex items-center gap-1.5">
                {key === "ambient_color" && <span className="size-2.5 rounded-full" style={{ background: String(value) }} />}
                {String(value).replace("_", " ")}
                {key === "temperature_c" ? " °C" : ""}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <p className="text-[10px] font-semibold tracking-[0.2em] text-brushed uppercase">Memories</p>
        {profile.memories.length === 0 && <p className="mt-1 text-brushed">Nothing yet. Tell MIRA something worth remembering.</p>}
        <ul className="mt-1 space-y-1">
          {profile.memories.map((memory) => (
            <li key={memory.id} className="group flex items-start justify-between gap-2 rounded-xl bg-halogen/5 px-3 py-2">
              <span>
                {memory.content}
                <span className="ml-2 text-[10px] text-brushed uppercase">{memory.category}</span>
              </span>
              <button
                type="button"
                onClick={() => void forget(memory.id)}
                aria-label={`Forget: ${memory.content}`}
                className="text-xs text-brushed hover:text-[#FF8A8A]"
              >
                Forget
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
