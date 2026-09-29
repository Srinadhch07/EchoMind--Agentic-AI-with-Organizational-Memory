from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Default location for the testimonial store. backend/app/config.py -> backend/
BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_TESTIMONIAL_DB_PATH = BACKEND_DIR / "data" / "testimonials.db"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "EchoMind"
    DEBUG: bool = False
    API_PREFIX: str = "/api"
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-120b"

    HINDSIGHT_API_KEY: str = ""
    HINDSIGHT_BASE_URL: str = "https://api.hindsight.vectorize.io"
    HINDSIGHT_BANK_ID: str = "echomind-support"

    # --- Testimonials -------------------------------------------------------
    # Standard-library SQLite file. No database server, no connection string.
    TESTIMONIAL_DB_PATH: str = str(DEFAULT_TESTIMONIAL_DB_PATH)
    # Shared secret required to review or approve submissions. When it is empty,
    # moderation is disabled and the approve/pending endpoints return 503.
    TESTIMONIAL_ADMIN_KEY: str = ""

    # --- Admin control plane ------------------------------------------------
    # Single-administrator authentication for the organization dashboard.
    # All three are required before admin access can be granted at all. When
    # any of them is missing, every /api/admin/* route returns 503 rather than
    # falling open.
    ADMIN_USERNAME: str = ""
    # HMAC key for the session token (HS256). Any long random string.
    ADMIN_SECRET_KEY: str = ""
    # Preferred: PBKDF2-HMAC-SHA256, encoded as
    #   pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>
    # Generate with: python -m app.services.admin_auth   (prints a ready value)
    ADMIN_PASSWORD_HASH: str = ""
    # Fallback for convenience: plaintext, compared in constant time. Only use
    # this when hashing is inconvenient; ADMIN_PASSWORD_HASH is better.
    ADMIN_PASSWORD: str = ""
    # Session lifetime in minutes.
    ADMIN_SESSION_MINUTES: int = 480
    # Sends the admin cookie with the Secure flag. Enable behind HTTPS.
    ADMIN_COOKIE_SECURE: bool = False


settings = Settings()
