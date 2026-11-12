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
