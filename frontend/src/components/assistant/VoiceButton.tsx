"use client";

import { useEffect, useRef, useState } from "react";
import { sessionId } from "@/lib/api";
import { startVoice, type VoiceEvent, type VoiceSession } from "@/lib/voiceClient";
import { useAssistantStore } from "@/stores/assistantStore";

/**
 * Hands-free conversation with MIRA. While on, the microphone streams to the
 * voice pipeline: MIRA greets the driver, then answers when called by name
 * ("MIRA, …") or right after she has spoken. Transcripts and replies land in
 * the same transcript as text chat.
 */
export function VoiceButton() {
  const [state, setState] = useState<"off" | "connecting" | "on">("off");
  const [caption, setCaption] = useState("");
  const [level, setLevel] = useState(0);
  const session = useRef<VoiceSession | null>(null);
  const followUp = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => session.current?.stop(), []);

  /** After MIRA speaks she listens for a few seconds; then she waits for her name again. */
  const setVoiceStatus = (status: "standby" | "listening" | "thinking" | "speaking", seconds?: number) => {
    if (followUp.current) clearTimeout(followUp.current);
    followUp.current = null;
    useAssistantStore.getState().setStatus(status);
    if (status === "listening" && seconds) {
      followUp.current = setTimeout(() => useAssistantStore.getState().setStatus("standby"), seconds * 1000);
    }
  };

  const onEvent = (event: VoiceEvent) => {
    const store = useAssistantStore.getState();
    switch (event.type) {
      case "status":
        setVoiceStatus(event.status === "idle" ? "standby" : event.status, event.seconds);
        break;
      case "standby":
        // Heard, but not addressed to MIRA: say so instead of silently ignoring it.
        setCaption(`“${event.text}” — say “MIRA” first so I know you mean me`);
        setTimeout(() => setCaption((c) => (c.startsWith(`“${event.text}”`) ? "" : c)), 3500);
        break;
      case "interim":
        setCaption(event.text);
        break;
      case "user":
        setCaption("");
        store.addTurn({ role: "user", text: event.text });
        break;
      case "assistant":
        store.addTurn({ role: "assistant", text: event.text, actions: event.actions, memories: event.memories });
        break;
      case "error":
        store.addTurn({ role: "assistant", text: `Voice problem: ${event.message}` });
        stop();
        break;
    }
  };

  const start = async () => {
    setState("connecting");
    try {
      session.current = await startVoice(sessionId(), onEvent, (l) => setLevel((prev) => prev * 0.6 + l * 0.4));
      setState("on");
      useAssistantStore.setState({ voiceOn: true });
      setVoiceStatus("thinking");
    } catch (error) {
      setState("off");
      const reason =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in the address bar, or type instead."
          : error instanceof Error ? error.message : "Voice is unavailable";
      useAssistantStore.getState().addTurn({ role: "assistant", text: reason });
    }
  };

  const stop = () => {
    session.current?.stop();
    session.current = null;
    if (followUp.current) clearTimeout(followUp.current);
    setState("off");
    setCaption("");
    useAssistantStore.setState({ voiceOn: false });
    useAssistantStore.getState().setStatus("idle");
  };

  return (
    <>
      <button
        type="button"
        onClick={state === "off" ? () => void start() : stop}
        aria-pressed={state === "on"}
        aria-label={state === "on" ? "Stop talking to MIRA" : "Talk to MIRA"}
        title={state === "on" ? "Stop voice" : "Talk to MIRA"}
        className={`relative grid size-9 shrink-0 place-items-center rounded-full transition-colors ${state === "on" ? "bg-ambient text-floor" : "bg-halogen/10 hover:bg-halogen/20"}`}
      >
        {state === "on" && (
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
