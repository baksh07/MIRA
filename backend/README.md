# MIRA Backend

FastAPI backend for MIRA (Memory-Informed Road Assistant).

## Requirements

- Python 3.12+
- [uv](https://docs.astral.sh/uv/)

## Setup

From `backend/`:

```bash
uv sync
```

This creates `.venv/` and installs runtime and dev dependencies from `uv.lock`.

## Run the API

```bash
uv run uvicorn mira_backend.main:app --reload
```

- API: http://127.0.0.1:8000
- Health check: http://127.0.0.1:8000/health
- Interactive docs: http://127.0.0.1:8000/docs

## Test

```bash
uv run pytest
```

## Layout

```text
backend/
├── src/mira_backend/
│   ├── main.py      # FastAPI app and router registration
│   ├── api/         # HTTP routes
│   ├── core/        # configuration and shared infrastructure
│   ├── models/      # Pydantic data models
│   └── services/    # business logic
├── tests/
├── pyproject.toml
└── uv.lock
```

## Endpoints

| Method | Path      | Response           | Purpose        |
|--------|-----------|--------------------|----------------|
| GET    | `/health` | `{"status": "ok"}` | Liveness check |

## Configuration

Copy `.env.example` to `.env` (git-ignored) and fill in the keys. Settings are read by
`mira_backend.core.config.Settings`; real environment variables take precedence.

## Vehicle simulator (Phase 6)

Each browser session owns one simulated car, identified by a client-generated UUID.
The simulator (`services/vehicle_simulator.py`) is the only thing that changes vehicle
state: it validates every command, applies it, logs it and broadcasts the confirmed state.

| Endpoint | Purpose |
|---|---|
| `GET /api/vehicles/{id}` | Current state |
| `POST /api/vehicles/{id}/commands` | Apply one command, e.g. `{"type": "set_temperature", "celsius": 22}`. Invalid commands get `422` and change nothing. |
| `WS /ws/vehicles/{id}` | Sends the current state on connect, then every confirmed change |
| `/mcp` | The vehicle MCP server (streamable HTTP) |

Commands: `set_temperature`, `set_fan_speed`, `set_seat_heating`, `set_ambient_lighting`,
`set_driving_mode`, `control_music`, `set_destination`, `clear_destination`, `set_window`, `set_door`
(schemas in `models/vehicle.py`).

### MCP tools

`vehicle_mcp/server.py` (FastMCP) exposes the same operations as tools:
`get_vehicle_status`, `set_cabin_temperature`, `set_fan_speed`, `set_seat_heating`,
`set_ambient_lighting`, `set_driving_mode`, `control_music`, `set_navigation_destination`,
`cancel_navigation`, `set_window`, `set_door`. Each takes the session's `vehicle_id`.
The agent calls them in-process through a FastMCP client and fills in `vehicle_id` itself.

## Drivers and memory (Phase 4)

Schema: `supabase/migrations/` (drivers, driver_preferences, memories, sessions,
session_messages; RLS on, no browser access). Apply with `uv run python scripts/migrate.py`
(idempotent; also runs `supabase/seed.sql` with the two demo drivers, Daniel and Sophia).

| Endpoint | Purpose |
|---|---|
| `GET /api/drivers` | Demo drivers (no personal data) |
| `POST /api/sessions` | `{vehicle_id, driver_id}`: identify the driver in this car and apply their preferences |
| `GET /api/sessions/{vehicle_id}` | Driver currently in this car |
| `GET /api/sessions/{vehicle_id}/profile` | That driver's preferences and memories |
| `DELETE /api/sessions/{vehicle_id}/memories/{id}` | Forget one memory (scoped to that driver) |

Personal data is only reachable through the session bound to the caller's car, so a
client can never read another driver's memories.

## Agent and memory (Phase 8)

`agent/graph.py` is a LangGraph loop (model ⇄ tools, max 4 model calls per turn) built
per request around the caller's car and driver.

- **Models** (`agent/llm.py`): `GROQ_MODELS` in order (each has its own free quota), then
  `OPENAI_MODEL`. Any error, including 429 rate limits, falls through immediately.
- **Tools** (`agent/tools.py`): the vehicle tools are generated from the MCP server's schemas
  and called through an MCP client; `vehicle_id` is hidden from the model and filled in
  server-side. `remember` and `save_preference` write to the current driver only, after
  validation and the memory policy (lasting facts only; sensitive data refused; 50 max).
- **Context**: compact car summary, the driver's preferences and recent memories.
  Explicit instructions win over remembered preferences.
- `POST /api/assistant/chat` `{vehicle_id, message}` → `{reply, actions, memories, model}`.

Local dev server on Windows: `uv run python -m mira_backend.devserver` (selects the event
loop psycopg needs on Windows).
