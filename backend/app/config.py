import os
from pathlib import Path
from pydantic_settings import BaseSettings
from typing import List

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BACKEND_DIR / ".env"


class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True
    
    # Provider API keys
    gemini_api_key: str = ""
    openai_api_key: str = ""
    mistral_api_key: str = ""
    
    # Defaults
    default_gemini_model: str = "gemini-2.5-flash"
    default_openai_model: str = "gpt-4o-mini"
    default_mistral_model: str = "ministral-8b-latest"
    active_provider: str = "mock"
    
    # CORS
    cors_origins: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "*"
    ]

    class Config:
        env_file = str(ENV_PATH) if ENV_PATH.exists() else ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()

