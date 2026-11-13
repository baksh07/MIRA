"use client";

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useAssistantStore } from "@/stores/assistantStore";
import { useDriverStore } from "@/stores/driverStore";
import { MemoryPanel } from "./MemoryPanel";

const SUGGESTIONS = ["I'm cold", "Purple ambient light", "Take me to the airport", "Sport mode, please"];

/** MIRA's presence: a glowing orb in the car's ambient colour. */
export function AssistantOrb({ status, size = "size-12" }: { status: string; size?: string }) {
  return (
    <span
      data-status={status}
      aria-hidden="true"
      className={`orb block shrink-0 rounded-full ${size} bg-[radial-gradient(circle_at_35%_30%,#fff8,var(--color-ambient)_45%,color-mix(in_oklab,var(--color-ambient)_30%,#000)_100%)] shadow-[0_0_30px_4px_color-mix(in_oklab,var(--color-ambient)_55%,transparent)]`}
    />
  );
}

/** Talk to MIRA. `voice` is the microphone control, slotted in by the voice feature. */
export function AssistantPanel({ voice }: { voice?: ReactNode }) {
  const { turns, status, speakReplies, toggleSpeakReplies } = useAssistantStore();
  const driver = useDriverStore((s) => s.current);
  const [draft, setDraft] = useState("");
  const [showMemory, setShowMemory] = useState(false);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [turns.length]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft;
    setDraft("");
    void useAssistantStore.getState().ask(text);
  };

  return (
    <section className="border border-halogen/10 bg-floor/60 backdrop-blur-md backdrop-saturate-150 flex w-full max-w-sm flex-col rounded-3xl p-4" aria-label="MIRA assistant">
      <div className="flex items-center gap-3">
        <AssistantOrb status={status} />
        <div className="min-w-0 flex-1">
          <p className="font-bold tracking-wide [font-stretch:115%]">MIRA</p>
          <p className="text-xs text-brushed" role="status" aria-live="polite">
            {status === "thinking" ? "Thinking…" : status === "listening" ? "Listening…" : status === "speaking" ? "Speaking…" : driver ? `Ready for you, ${driver.display_name}` : "Ready. Select a driver so I can remember you."}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleSpeakReplies}
          aria-pressed={speakReplies}
          aria-label={speakReplies ? "Mute MIRA's spoken replies" : "Read MIRA's replies aloud"}
          title={speakReplies ? "Spoken replies on" : "Spoken replies off"}
          className="rounded-full bg-halogen/8 px-2.5 py-1 text-xs hover:bg-halogen/15"
        >
          {speakReplies ? "🔊" : "🔇"}
        </button>
        <button
          type="button"
          onClick={() => setShowMemory((v) => !v)}
          aria-pressed={showMemory}
          className="rounded-full bg-halogen/8 px-3 py-1 text-xs hover:bg-halogen/15"
        >
          {showMemory ? "Chat" : "Memories"}
        </button>
      </div>

      {showMemory && (
        <div className="mt-3 max-h-56 overflow-y-auto pr-1">
          <MemoryPanel />
        </div>
      )}
      <div ref={log} hidden={showMemory} className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1 text-sm" aria-live="polite">
        {turns.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => void useAssistantStore.getState().ask(s)} className="rounded-full bg-halogen/8 px-3 py-1 text-xs hover:bg-halogen/15">
                {s}
              </button>
            ))}
          </div>
        )}
        {turns.map((turn) => (
          <div key={turn.id} className={turn.role === "user" ? "text-right" : ""}>
            <p className={`inline-block max-w-[90%] rounded-2xl px-3 py-2 text-left ${turn.role === "user" ? "bg-halogen/10" : "bg-ambient/12"}`}>{turn.text}</p>
            {turn.actions?.map((a) => (
              <p key={a} className="mt-1 text-xs text-brushed">✓ {a}</p>
            ))}
            {turn.offer && (
              <div className="mt-1.5 flex gap-1.5">
                <button type="button" onClick={() => void useAssistantStore.getState().acceptOffer(turn.id)} className="rounded-full bg-ambient px-3 py-1 text-xs font-semibold text-floor">
                  Yes, remember
                </button>
                <button type="button" onClick={() => useAssistantStore.getState().dismissOffer(turn.id)} className="rounded-full bg-halogen/8 px-3 py-1 text-xs">
                  Not now
                </button>
              </div>
            )}
            {turn.memories?.map((m) => (
              <p key={m} className="mt-1 text-xs text-ambient">◆ Remembered: {m}</p>
            ))}
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="mt-3 flex items-center gap-2">
        {voice}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask MIRA…"
          aria-label="Message MIRA"
          maxLength={500}
          className="min-w-0 flex-1 rounded-full bg-halogen/8 px-4 py-2 text-sm outline-none placeholder:text-brushed focus:bg-halogen/12"
        />
        <button type="submit" disabled={!draft.trim() || status === "thinking"} className="rounded-full bg-halogen px-4 py-2 text-sm font-semibold text-floor disabled:opacity-40">
          Send
        </button>
      </form>
    </section>
  );
}
