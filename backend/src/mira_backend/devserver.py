"""Local development server.

    uv run python -m mira_backend.devserver

On Windows, psycopg's async driver needs the selector event loop (the default
Proactor loop is unsupported), so it is selected before uvicorn starts.
Production (Linux) uses `uvicorn mira_backend.main:app` directly.
"""

import asyncio
import os
import sys

import uvicorn


def main() -> None:
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())  # type: ignore[attr-defined]
    uvicorn.run(
        "mira_backend.main:app",
        host="127.0.0.1",
        port=int(os.environ.get("PORT", "8000")),
        loop="none",
        timeout_graceful_shutdown=2,
    )


if __name__ == "__main__":
    main()
