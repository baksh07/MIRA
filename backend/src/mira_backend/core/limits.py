"""Per-visitor limits on the endpoints that spend paid API credit.

A sliding window per client IP (the app runs as one process, so memory is
enough). Behind Render's proxy the client IP is the first X-Forwarded-For hop.
"""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, WebSocket


def client_ip(connection: Request | WebSocket) -> str:
    forwarded = connection.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return connection.client.host if connection.client else "unknown"


class RateLimit:
    def __init__(self, per_minute: int) -> None:
        self.per_minute = per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > 60:
            hits.popleft()
        if len(hits) >= self.per_minute:
            raise HTTPException(status_code=429, detail="You're talking a lot! Give MIRA a few seconds, then try again.")
        hits.append(now)
        if len(self._hits) > 10_000:  # forget idle visitors
            for stale in [k for k, v in self._hits.items() if not v or now - v[-1] > 60]:
                del self._hits[stale]


class ConcurrencyLimit:
    def __init__(self, per_key: int) -> None:
        self.per_key = per_key
        self._active: dict[str, int] = defaultdict(int)

    def acquire(self, key: str) -> bool:
        if self._active[key] >= self.per_key:
            return False
        self._active[key] += 1
        return True

    def release(self, key: str) -> None:
        self._active[key] = max(0, self._active[key] - 1)


chat_limit = RateLimit(per_minute=20)
speak_limit = RateLimit(per_minute=30)
voice_sessions = ConcurrencyLimit(per_key=2)
