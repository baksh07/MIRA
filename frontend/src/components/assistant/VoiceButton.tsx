"use client";

import { useEffect } from "react";
import { useVoiceStore } from "@/stores/voiceStore";

/**
 * The microphone control. MIRA's voice session opens by itself when the driver
 * gets in; this button mutes and unmutes the microphone (handy during demos),
 * or reconnects if voice is off.
 */
export function VoiceButton() {
  const { state, muted, caption, level, start, toggleMute } = useVoiceStore();

  useEffect(() => () => useVoiceStore.getState().stop(), []);

  const on = state === "on";
  const label = !on ? "Start talking to MIRA" : muted ? "Unmute microphone" : "Mute microphone";
  const tone = on && !muted ? "bg-ambient text-floor" : on ? "bg-red-500/80 text-white" : "bg-halogen/10 hover:bg-halogen/20";
  return (
    <>
      <button
        type="button"
        onClick={on ? toggleMute : () => void start()}
        aria-pressed={on && !muted}
        aria-label={label}
        title={label}
        className={`relative grid size-9 shrink-0 place-items-center rounded-full transition-colors ${tone}`}
      >
        {on && !muted && (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-ambient/40"
            style={{ transform: `scale(${1 + Math.min(level * 4, 0.8)})`, transition: "transform 80ms" }}
          />
        )}
        <svg viewBox="0 0 24 24" className="relative size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          {state === "connecting" ? (
            <circle cx="12" cy="12" r="8" strokeDasharray="12 40" className="origin-center animate-spin" />
          ) : (
            <>
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
              {muted && <path d="M4 4l16 16" strokeLinecap="round" />}
            </>
          )}
        </svg>
      </button>
      {caption && (
        <p className="pointer-events-none fixed inset-x-0 bottom-28 text-center text-lg text-halogen/90 drop-shadow" aria-live="polite">
          {caption}
        </p>
      )}
    </>
  );
}
