from fastapi import FastAPI, HTTPException, Body, Response, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, RedirectResponse
from app.config import settings
from app.schemas import ChatRequest, ChatResponse, ModelInfo
from app.services.llm import get_stream_generator, get_available_models
from app.db import (
    get_all_appointments,
    update_status,
    delete_appointment,
    create_appointment,
    get_google_tokens,
    clear_google_tokens
)
from app.services.google_calendar import (
    create_google_calendar_event,
    get_calendar_status,
    parse_appointment_datetime,
    generate_ics_content,
    send_calendar_event_to_customer,
    get_sent_invitations,
    get_google_auth_url,
    exchange_google_code,
)
from typing import List, Dict, Any, Optional

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
            "I'm here to assist with your questions and schedule an appointment with our team.\n\n"
            "To get started, may I have your **full name**?"
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


# --- Google Calendar Integration Endpoints ---

@app.get("/api/calendar/status")
def get_gcal_status():
    """Retrieve Google Calendar integration status, capabilities, and provider config."""
    return get_calendar_status()


@app.get("/api/calendar/auth/status")
def get_calendar_auth_status():
    """Returns current Google Calendar OAuth connection state and account details."""
    tokens = get_google_tokens()
    is_connected = bool(tokens and tokens.get("access_token"))
    return {
        "connected": is_connected,
        "client_id_configured": bool(settings.google_client_id),
        "user_email": tokens.get("user_email") if tokens else None,
        "expires_at": tokens.get("expires_at") if tokens else None,
        "auth_url": get_google_auth_url() if settings.google_client_id else None,
        "redirect_uri": "http://localhost:8000/api/calendar/auth/callback"
    }


@app.get("/api/calendar/auth/login")
def google_auth_login(
    request: Request,
    redirect_uri: Optional[str] = None,
    raw_url: bool = Query(False)
):
    """
    Initiates Google OAuth 2.0 flow for Google Calendar & Meet integration.
    Redirects the user directly to Google's consent screen.
    """
    if not settings.google_client_id:
        raise HTTPException(status_code=400, detail="GOOGLE_CLIENT_ID is not configured in backend/.env")
    
    callback = redirect_uri or "http://localhost:8000/api/calendar/auth/callback"
    auth_url = get_google_auth_url(redirect_uri=callback)
    
    if raw_url or "application/json" in request.headers.get("accept", ""):
        return {"auth_url": auth_url, "redirect_uri": callback}
        
    return RedirectResponse(url=auth_url)


@app.get("/api/calendar/auth/callback")
@app.get("/callback")
async def google_auth_callback(
    code: Optional[str] = None,
    error: Optional[str] = None,
    state: Optional[str] = None
):
    """
    Receives authorization code from Google OAuth, exchanges it for tokens,
    stores credentials in SQLite, and redirects back to the frontend application.
    """
    if error:
        return RedirectResponse(url=f"http://localhost:3000/?calendar_error={error}")
        
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code.")
        
    res = await exchange_google_code(code)
    if res.get("success"):
        user_email = res.get("email", "")
        return RedirectResponse(url=f"http://localhost:3000/?calendar_connected=true&email={user_email}")
    else:
        err_text = res.get("error", "Failed to exchange authorization code")
        import urllib.parse
        safe_err = urllib.parse.quote(str(err_text)[:120])
        return RedirectResponse(url=f"http://localhost:3000/?calendar_error={safe_err}")


@app.post("/api/calendar/auth/disconnect")
def disconnect_google_calendar():
    """Disconnects and removes stored Google Calendar OAuth tokens."""
    clear_google_tokens()
    return {"success": True, "message": "Google Calendar disconnected."}


@app.post("/api/calendar/events")
async def create_calendar_event(payload: Dict[str, Any] = Body(...)):
    """
    Creates Google Calendar event & sync link for booked customer appointments.
    Also ensures the appointment is persisted in SQLite.
    """
    result = await create_google_calendar_event(payload)
    
    # Auto-persist to SQLite
    ref_id = result.get("ref_id")
    if ref_id and payload.get("name") and payload.get("appointment_time"):
        try:
            create_appointment(
                ref_id=ref_id,
                name=payload.get("name", "Customer"),
                phone=payload.get("phone", ""),
                email=payload.get("email", ""),
                purpose=payload.get("purpose", "Consultation"),
                appointment_time=payload.get("appointment_time", "")
            )
        except Exception:
            pass
            
    return result


@app.get("/api/calendar/ics/{ref_id}")
def download_ics_file(
    ref_id: str,
    name: str = "Customer",
    time: str = "Tomorrow at 10:00 AM",
    email: str = "",
    purpose: str = "Consultation"
):
    """
    Downloads standard RFC 5545 .ics iCalendar file for direct import into Google Calendar / Outlook / Apple Calendar.
    """
    start_dt, end_dt = parse_appointment_datetime(time)
    summary = f"Convo Desk Consultation: {name}"
    description = (
        f"Customer Consultation & Intake Booking\\n"
        f"Reference ID: {ref_id}\\n"
        f"Customer Name: {name}\\n"
        f"Email: {email}\\n"
        f"Purpose: {purpose}\\n"
        f"Scheduled via Convo Desk."
    )
    ics_text = generate_ics_content(
        summary=summary,
        start_dt=start_dt,
        end_dt=end_dt,
        description=description,
        location="Google Meet (Online Video Consultation)",
        attendee_email=email,
        ref_id=ref_id
    )
    return Response(
        content=ics_text,
        media_type="text/calendar",
        headers={
            "Content-Disposition": f"attachment; filename=ConvoDesk_Booking_{ref_id}.ics"
        }
    )


@app.post("/api/calendar/send-invite")
async def send_customer_invite(payload: Dict[str, Any] = Body(...)):
    """
    Dispatches calendar event invitation (with embedded .ics and Google Calendar/Meet buttons)
    directly to customer's email address.
    """
    recipient_email = payload.get("email")
    if not recipient_email or "@" not in recipient_email:
        raise HTTPException(status_code=400, detail="A valid customer email is required.")
        
    result = await send_calendar_event_to_customer(payload)
    return result


@app.get("/api/calendar/invitations")
def list_sent_invitations():
    """Returns history of all dispatched calendar invitations."""
    return get_sent_invitations()


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

