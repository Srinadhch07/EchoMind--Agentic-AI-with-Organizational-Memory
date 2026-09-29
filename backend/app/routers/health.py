from fastapi import APIRouter

from app.config import settings

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "groq_configured": bool(settings.GROQ_API_KEY),
        "hindsight_configured": bool(settings.HINDSIGHT_API_KEY),
    }
