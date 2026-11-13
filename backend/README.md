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
