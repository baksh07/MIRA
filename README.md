# MIRA — Memory-Informed Road Assistant

An in-car voice assistant for a simulated sports coupe. Walk around the car in a 3D showroom,
open the door, get in, let MIRA recognise you, and talk to her: she changes the cabin, plans and
drives routes, and **remembers each driver** — preferences, habits and past trips — the next time
they get in.

**Live demo:** **https://mira-assistant-taupe.vercel.app**
<sub>The backend runs on a free tier: after a quiet period the first request can take ~40 s to wake up.</sub>

## Try this (1 minute)

1. Drag to walk around the car, click the blue dot on the driver's door, then **Get in**.
2. Pick **Daniel** or **Sophia** — MIRA "recognises" them and sets the car up their way.
3. Press the mic (or type) and say: *"I'm freezing and tired. Take me to Munich Airport, let's go."*
   MIRA applies a cozy cabin scene, plans the route and drives: watch the speed, ETA and fuel, and listen for her arrival announcement.
4. Say *"I always like it at 21 degrees"* — then switch drivers and back: the car remembers.
5. Open **Memories** in the assistant panel to see (and delete) what MIRA knows about you.

## What it does

| | |
|---|---|
| **3D showroom** | React Three Fiber scene: reflective studio floor, opening doors on computed hinges, cinematic intro, live wrap colours, wheels and road that move while driving, adaptive quality on slow devices. |
| **Vehicle simulator** | The single authority over car state (climate, seat heating, ambient light, drive mode, music, navigation, drives with speed/fuel/ETA, windows, doors, paint). Every change is validated and confirmed; the UI never claims success early. One simulated car per browser session. |
| **MCP tools** | The simulator is exposed as a FastMCP server (`/mcp`); the agent drives the car only through these tools. |
| **Agent** | LangGraph loop over Groq models (automatic fallback through several models, then OpenAI). Picks tools, applies cabin scenes from moods ("I'm exhausted" → relax), and lets explicit requests beat remembered preferences. |
| **Memory** | Per-driver profile, preference and episodic memory in Supabase Postgres: lasting preferences, facts ("call me Dan"), past trips ("take me back to where I went last time"), habit detection ("you keep choosing 24 °C — make it your usual?"). Strict isolation between drivers; users can view and delete memories. |
| **Voice** | Pipecat pipeline: microphone → Deepgram Nova-3 speech-to-text → agent → Deepgram Aura text-to-speech, with live captions, barge-in and proactive announcements (arrival, low fuel). |
| **Driver recognition** | Simulated (no camera, no biometrics): a face-scan animation identifies one of two demo drivers. |

## Architecture

```text
 Browser (Next.js 16 · React 19 · R3F)                       FastAPI backend (Python 3.12)
 ┌─────────────────────────────────────┐   REST + WebSocket   ┌──────────────────────────────────────┐
 │ 3D garage · cockpit HUD · assistant │ ───────────────────▶ │ Vehicle simulator (authoritative)    │
 │ vehicle store (confirmed state only)│ ◀─── state updates ─ │   ▲ FastMCP tools (/mcp)              │
 │ mic AudioWorklet ⇄ speech playback  │ ⇄── voice socket ──▶ │ Pipecat: Deepgram STT → agent → TTS  │
 └─────────────────────────────────────┘                      │ LangGraph agent ── Groq → OpenAI      │
                                                              │ Sessions & memory ── Supabase (RLS)  │
                                                              └──────────────────────────────────────┘
```

## Tech stack

Next.js 16, React 19, TypeScript, Tailwind CSS 4, three.js r186, React Three Fiber 9, drei 10, Zustand ·
FastAPI, Pydantic, LangGraph, LangChain, FastMCP, Pipecat, Deepgram · Supabase Postgres · Vercel + Render.

## Run it locally

```bash
# backend (Python 3.12 + uv)
cd backend
cp .env.example .env                      # fill in the keys
uv sync
uv run python scripts/migrate.py          # create tables and demo drivers in Supabase
uv run python -m mira_backend.devserver   # http://127.0.0.1:8000 (API docs at /docs)

# frontend (Node 24)
cd frontend
cp .env.example .env.local
npm install
npm run dev                               # http://localhost:3000
```

Keys: Groq (+ OpenAI fallback) for the agent, Deepgram for voice, Supabase for memory — see the `.env.example` files.

## Quality

- **Tests:** backend 53 (pytest: simulator, API, WebSocket, MCP tools, agent tool selection with a scripted model, memory isolation and policy, model fallback, voice protocol, rate limits); frontend 12 (Vitest: camera framing, garage state, habit detection). TypeScript strict, ESLint and production build clean.
- **Verified end to end** in a real browser on the public deployment (including voice with synthesised speech and a fake microphone) and across 12 screen sizes at 100 % and 125 % scaling.
- **Security:** secrets stay server-side; Supabase Row Level Security with no browser access (the public key gets 401 on every table); every personal-data query is scoped to the driver bound to the caller's session; per-visitor rate limits protect paid APIs; the memory policy refuses sensitive data.

More detail: [`backend/README.md`](backend/README.md) (API, agent, voice) · [`docs/development/deployment.md`](docs/development/deployment.md).

## Credits

- 3D car model: ["BMW M2 g87 [Free]"](https://sketchfab.com/3d-models/bmw-m2-g87-free-125412579b244790b27b2a7839527c6e)
  by Black Snow, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  Modified for MIRA: manufacturer badges and interior logos removed, hidden drivetrain parts dropped,
  geometry and textures compressed (`frontend/scripts/build-car-model.mjs`).

## Disclaimer

MIRA is an independent portfolio project. It is not affiliated with, endorsed by, or officially
associated with BMW. All vehicle signals and interactions are simulated.
