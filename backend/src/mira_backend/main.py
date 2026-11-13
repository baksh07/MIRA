import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from mira_backend.api.drivers import router as drivers_router
from mira_backend.api.health import router as health_router
from mira_backend.api.vehicle import router as vehicle_router
from mira_backend.core.config import get_settings
from mira_backend.services import container
from mira_backend.vehicle_mcp.server import mcp

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

settings = get_settings()

# The vehicle MCP server, also reachable over streamable HTTP at /mcp.
mcp_app = mcp.http_app(path="/")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await container.startup()
    async with mcp_app.lifespan(app):
        yield
    await container.shutdown()


app = FastAPI(
    title="MIRA Backend",
    description="Backend services for MIRA, the Memory-Informed Road Assistant.",
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origin_list,
    allow_origin_regex=settings.frontend_origin_regex or None,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(vehicle_router)
app.include_router(drivers_router)
app.mount("/mcp", mcp_app)
