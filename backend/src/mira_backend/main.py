from fastapi import FastAPI

from mira_backend.api.health import router as health_router

app = FastAPI(
    title="MIRA Backend",
    description="Backend services for MIRA, the Memory-Informed Road Assistant.",
    version="0.1.0",
)

app.include_router(health_router)
