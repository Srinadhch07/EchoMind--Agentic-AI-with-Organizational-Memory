from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import agent, health, memory

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="An organizational memory system for AI agents.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix=settings.API_PREFIX, tags=["health"])
app.include_router(memory.router, prefix=f"{settings.API_PREFIX}/memory", tags=["memory"])
app.include_router(agent.router, prefix=f"{settings.API_PREFIX}/agent", tags=["agent"])


@app.get("/")
async def root() -> dict:
    return {"app": settings.APP_NAME, "docs": "/docs"}
