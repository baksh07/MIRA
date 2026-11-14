"""Process-wide services, created once at startup.

With DATABASE_URL set, driver data lives in Supabase Postgres; without it (tests,
quick local runs) an in-memory repository with the same two demo drivers is used.
"""

import logging

from mira_backend.core.config import get_settings
from mira_backend.services.driver_repository import (
    DriverRepository,
    InMemoryDriverRepository,
    PostgresDriverRepository,
)
from mira_backend.services.sessions import SessionService
from mira_backend.services.vehicle_simulator import vehicles

logger = logging.getLogger(__name__)


class Container:
    def __init__(self, repo: DriverRepository) -> None:
        self.repo = repo
        self.sessions = SessionService(repo)


_container = Container(InMemoryDriverRepository())
vehicles.arrival_listeners.append(lambda vid, dest: _container.sessions.record_arrival(vid, dest))


def container() -> Container:
    return _container


async def startup() -> None:
    global _container
    url = get_settings().database_url
    if not url:
        logger.warning("DATABASE_URL not set: using the in-memory driver repository")
        return
    repo = PostgresDriverRepository(url)
    await repo.open()
    _container = Container(repo)
    vehicles.arrival_listeners[:] = [lambda vid, dest: _container.sessions.record_arrival(vid, dest)]
    logger.info("driver repository: Supabase Postgres")


async def shutdown() -> None:
    if isinstance(_container.repo, PostgresDriverRepository):
        await _container.repo.close()
