from typing import List, Literal, Optional
from pydantic import BaseModel, Field
from datetime import datetime


class Attachment(BaseModel):
    name: str
    content: str
    size: int
    mime_type: Optional[str] = "text/plain"


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str
    timestamp: Optional[str] = Field(default_factory=lambda: datetime.utcnow().isoformat())


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    provider: Optional[Literal["gemini", "openai", "mistral", "mock"]] = None
    model: Optional[str] = None
    temperature: Optional[float] = 0.7
    system_prompt: Optional[str] = None
    attachments: Optional[List[Attachment]] = None


class ChatResponse(BaseModel):
    role: Literal["assistant"] = "assistant"
    content: str
    provider: str
    model: str
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class ModelInfo(BaseModel):
    id: str
    name: str
    provider: str
    is_available: bool
    description: Optional[str] = None
