from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Backend configuration, read from the environment (and backend/.env locally)."""

    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    # LLM: Groq models tried in order, OpenAI as the last fallback.
    groq_api_key: str = ""
    groq_models: str = "openai/gpt-oss-20b,openai/gpt-oss-120b,qwen/qwen3.8-27b"
    openai_api_key: str = ""
    openai_model: str = "gpt-5-mini"

    deepgram_api_key: str = ""
    deepgram_stt_model: str = "nova-3"
    deepgram_tts_voice: str = "aura-2-thalia-en"

    supabase_url: str = ""
    supabase_secret_key: str = ""
    database_url: str = ""

    # Comma-separated origins allowed to call the API from a browser.
    frontend_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3123"
    # Regex for preview deployments (e.g. Vercel preview URLs).
    frontend_origin_regex: str = Field(default=r"https://mira[a-z0-9-]*\.vercel\.app")

    @property
    def groq_model_list(self) -> list[str]:
        return [m.strip() for m in self.groq_models.split(",") if m.strip()]

    @property
    def frontend_origin_list(self) -> list[str]:
        return [o.strip() for o in self.frontend_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
