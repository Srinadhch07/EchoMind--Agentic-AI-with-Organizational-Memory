import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import agent, health, memory, testimonials
from app.services import testimonials as testimonial_store

logger = logging.getLogger("echomind")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Create the testimonial table and add clearly-labelled samples if empty.

    The samples are marked is_sample=1 so the UI labels them as sample content.
    They are not real customers and are never presented as such.
    """
    testimonial_store.init_store()
    added = testimonial_store.seed_samples()
    if added:
        logger.info("testimonial.samples_seeded count=%d", added)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="An organizational memory system for AI agents.",
    lifespan=lifespan,
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
app.include_router(testimonials.router, prefix=settings.API_PREFIX, tags=["testimonials"])


@app.get("/")
async def root() -> dict:
    return {"app": settings.APP_NAME, "docs": "/docs"}
