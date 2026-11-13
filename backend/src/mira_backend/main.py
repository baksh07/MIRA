import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from mira_backend.api.health import router as health_router
from mira_backend.api.vehicle import router as vehicle_router
from mira_backend.core.config import get_settings
from mira_backend.vehicle_mcp.server import mcp

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

settings = get_settings()

# The vehicle MCP server, also reachable over streamable HTTP at /mcp.
mcp_app = mcp.http_app(path="/")

app = FastAPI(
    title="MIRA Backend",
    description="Backend services for MIRA, the Memory-Informed Road Assistant.",
    version="0.2.0",
    lifespan=mcp_app.lifespan,
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
app.mount("/mcp", mcp_app)
