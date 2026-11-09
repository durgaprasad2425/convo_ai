import asyncio
import json
from typing import AsyncGenerator, List, Dict, Any
from app.config import settings
from app.schemas import ChatMessage, ChatRequest, ChatResponse, ModelInfo, Attachment
from app.services.intake_manager import INTAKE_SYSTEM_PROMPT, simulate_intake_flow, extract_intake_state


def build_attachment_context(attachments: List[Attachment]) -> str:
    """Formats file attachments into clean markdown context blocks."""
    if not attachments:
        return ""
    blocks = ["\n\n### 📎 Attached Documents / Files:"]
    for att in attachments:
        blocks.append(f"#### File: `{att.name}` ({att.size} bytes)\n```\n{att.content}\n```")
    return "\n\n".join(blocks)


async def mock_stream(request: ChatRequest) -> AsyncGenerator[str, None]:
    """
    Deterministic simulated streaming response following the 6 intake & scheduling requirements.
    """
    # Use intake flow simulator
    reply = simulate_intake_flow(request.messages)

    # Stream out reply words with smooth pacing
    words = reply.split(" ")
    for i, word in enumerate(words):
        await asyncio.sleep(0.03)
        prefix = "" if i == 0 else " "
        payload = {"chunk": prefix + word, "done": False}
        yield f"data: {json.dumps(payload)}\n\n"

    # Send final done event with intake details extracted
    state = extract_intake_state(request.messages)
    yield f"data: {json.dumps({'chunk': '', 'done': True, 'model': 'mock-intake-v1', 'provider': 'mock', 'intake_state': state})}\n\n"


async def gemini_stream(request: ChatRequest) -> AsyncGenerator[str, None]:
    """Streams responses from Google Gemini API with intake & appointment system instructions."""
    api_key = settings.gemini_api_key
    if not api_key:
        yield f"data: {json.dumps({'chunk': 'Error: GEMINI_API_KEY is not configured in backend/.env', 'done': True, 'error': True})}\n\n"
        return

    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        
        attachment_ctx = build_attachment_context(request.attachments or [])
        system_instruction = INTAKE_SYSTEM_PROMPT
        if request.system_prompt:
            system_instruction += f"\n\nAdditional Instructions: {request.system_prompt}"

        contents = []
        for i, msg in enumerate(request.messages):
            text = msg.content
            if i == len(request.messages) - 1 and attachment_ctx:
                text += attachment_ctx
                
            contents.append({
                "role": "model" if msg.role == "assistant" else "user",
                "parts": [{"text": text}]
            })
            
        model_name = request.model or settings.default_gemini_model
        
        def generate():
            return client.models.generate_content_stream(
                model=model_name,
                contents=contents,
                config={"system_instruction": system_instruction}
            )
            
        stream = await asyncio.to_thread(generate)
        for chunk in stream:
            text = chunk.text or ""
            if text:
                payload = {"chunk": text, "done": False}
                yield f"data: {json.dumps(payload)}\n\n"
                
        state = extract_intake_state(request.messages)
        yield f"data: {json.dumps({'chunk': '', 'done': True, 'model': model_name, 'provider': 'gemini', 'intake_state': state})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'chunk': f'Gemini Error: {str(e)}', 'done': True, 'error': True})}\n\n"


async def openai_stream(request: ChatRequest) -> AsyncGenerator[str, None]:
    """Streams responses from OpenAI API with intake & appointment system instructions."""
    api_key = settings.openai_api_key
    if not api_key:
        yield f"data: {json.dumps({'chunk': 'Error: OPENAI_API_KEY is not configured in backend/.env', 'done': True, 'error': True})}\n\n"
        return

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key)
        
        attachment_ctx = build_attachment_context(request.attachments or [])
        model_name = request.model or settings.default_openai_model
        messages: List[Dict[str, str]] = []
        
        system_content = INTAKE_SYSTEM_PROMPT
        if request.system_prompt:
            system_content += f"\n\nAdditional Instructions: {request.system_prompt}"
        if attachment_ctx:
            system_content += f"\n\nContext files:\n{attachment_ctx}"

        messages.append({"role": "system", "content": system_content})
            
        for msg in request.messages:
            messages.append({"role": msg.role, "content": msg.content})

        response = await client.chat.completions.create(
            model=model_name,
            messages=messages,
            temperature=request.temperature or 0.7,
            stream=True
        )

        async for chunk in response:
            delta = chunk.choices[0].delta if chunk.choices else None
            text = delta.content if delta and delta.content else ""
            if text:
                payload = {"chunk": text, "done": False}
                yield f"data: {json.dumps(payload)}\n\n"

        state = extract_intake_state(request.messages)
        yield f"data: {json.dumps({'chunk': '', 'done': True, 'model': model_name, 'provider': 'openai', 'intake_state': state})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'chunk': f'OpenAI Error: {str(e)}', 'done': True, 'error': True})}\n\n"


async def get_stream_generator(request: ChatRequest) -> AsyncGenerator[str, None]:
    """Determines provider and returns corresponding stream generator."""
    provider = request.provider or settings.active_provider
    
    if provider == "gemini":
        if settings.gemini_api_key:
            return gemini_stream(request)
        else:
            return mock_stream(request)
    elif provider == "openai":
        if settings.openai_api_key:
            return openai_stream(request)
        else:
            return mock_stream(request)
    else:
        return mock_stream(request)


def get_available_models() -> List[ModelInfo]:
    """Returns available models based on active keys."""
    has_gemini = bool(settings.gemini_api_key)
    has_openai = bool(settings.openai_api_key)
    
    return [
        ModelInfo(
            id="mock-intake-v1",
            name="Convo Intake Bot (Mock)",
            provider="mock",
            is_available=True,
            description="Dedicated Customer Intake & Scheduling state machine (zero API keys required)."
        ),
        ModelInfo(
            id="gemini-2.5-flash",
            name="Gemini 2.5 Flash",
            provider="gemini",
            is_available=has_gemini,
            description="Google Gemini configured with 6-step Customer Intake System Instructions."
        ),
        ModelInfo(
            id="gpt-4o-mini",
            name="GPT-4o Mini",
            provider="openai",
            is_available=has_openai,
            description="OpenAI model configured with 6-step Customer Intake System Instructions."
        )
    ]
