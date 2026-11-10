from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from app.config import settings
from app.schemas import ChatRequest, ChatResponse, ModelInfo
from app.services.llm import get_stream_generator, get_available_models
from app.db import get_all_appointments, update_status, delete_appointment, create_appointment
from typing import List, Dict, Any

app = FastAPI(
    title="Convo AI API",
    description="Streaming Conversational AI Backend powered by Gemini, OpenAI, and FastAPI",
    version="1.0.0"
)

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "Convo AI API",
        "version": "1.0.0",
        "active_provider": settings.active_provider
    }


@app.get("/api/models", response_model=List[ModelInfo])
def list_models():
    """Retrieve list of supported models and their availability."""
    return get_available_models()


@app.get("/api/welcome")
def get_welcome_message():
    """Requirement 1: Official customer intake greeting."""
    return {
        "role": "assistant",
        "content": (
            "👋 **Welcome to Convo Desk!**\n\n"
            "I'm your dedicated customer concierge. Whether you're exploring our solutions, requesting a live product demo, "
            "or planning a technical consultation, I'm here to assist and reserve your priority appointment with our specialist team.\n\n"
            "To get started, may I please have your **full name** and the **purpose of your enquiry** today?"
        ),
        "sender": "Convo Desk",
        "status": "ready"
    }


@app.get("/api/appointments")
def list_appointments():
    """Returns all booked appointments from SQLite database."""
    return get_all_appointments()


@app.patch("/api/appointments/{ref_id}/status")
def change_appointment_status(ref_id: str, payload: Dict[str, str] = Body(...)):
    """Updates appointment status: 'confirmed', 'completed', or 'cancelled'."""
    new_status = payload.get("status")
    if not new_status:
        raise HTTPException(status_code=400, detail="Status is required.")
    success = update_status(ref_id, new_status)
    if not success:
        raise HTTPException(status_code=404, detail="Appointment not found.")
    return {"id": ref_id, "status": new_status, "updated": True}


@app.delete("/api/appointments/{ref_id}")
def remove_appointment(ref_id: str):
    """Deletes an appointment by reference ID."""
    success = delete_appointment(ref_id)
    if not success:
        raise HTTPException(status_code=404, detail="Appointment not found.")
    return {"id": ref_id, "deleted": True}


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    Stream chat completions via Server-Sent Events (SSE).
    """
    if not request.messages:
        raise HTTPException(status_code=400, detail="Messages list cannot be empty.")
        
    generator = await get_stream_generator(request)
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat_completion(request: ChatRequest):
    """
    Standard non-streaming completion endpoint.
    """
    if not request.messages:
        raise HTTPException(status_code=400, detail="Messages list cannot be empty.")
        
    # Accumulate chunks from generator
    generator = await get_stream_generator(request)
    full_text = ""
    provider_used = request.provider or settings.active_provider
    model_used = request.model or "default"
    
    import json
    async for raw_chunk in generator:
        if raw_chunk.startswith("data: "):
            try:
                data = json.loads(raw_chunk[6:].strip())
                if data.get("chunk"):
                    full_text += data["chunk"]
                if data.get("provider"):
                    provider_used = data["provider"]
                if data.get("model"):
                    model_used = data["model"]
            except Exception:
                pass
                
    return ChatResponse(
        content=full_text,
        provider=provider_used,
        model=model_used
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=settings.debug)

