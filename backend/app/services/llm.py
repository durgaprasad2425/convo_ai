import asyncio
import json
from typing import AsyncGenerator, List, Dict, Any
from app.config import settings
from app.schemas import ChatMessage, ChatRequest, ChatResponse, ModelInfo


async def mock_stream(request: ChatRequest) -> AsyncGenerator[str, None]:
    """Generates realistic simulated streaming responses for testing without an API key."""
    last_msg = request.messages[-1].content if request.messages else "Hello!"
    
    # Generate contextual responses based on prompt keywords
    lower = last_msg.lower()
    if "python" in lower or "code" in lower:
        reply = (
            "Here is a quick Python example for you:\n\n"
            "```python\ndef greet(name: str) -> str:\n"
            "    return f\"Hello, {name}! Welcome to Convo AI.\"\n\n"
            "print(greet('Developer'))\n```\n\n"
            "This demonstrates clean typing and f-string formatting in modern Python."
        )
    elif "explain" in lower or "what is" in lower:
        reply = (
            f"You asked about: **\"{last_msg}\"**.\n\n"
            "Conversational AI combines Natural Language Processing (NLP), Large Language Models (LLMs), "
            "and real-time streaming architectures. When a user sends a prompt, the message is tokenized, "
            "processed by multi-head self-attention layers, and decoded iteratively token-by-token back to the client.\n\n"
            "- **Low Latency:** Streaming ensures users see words immediately.\n"
            "- **Context Retention:** Multi-turn message history gives the model memory.\n"
            "- **Tool Use & Function Calling:** Enables calling real-world APIs."
        )
    else:
        reply = (
            f"I received your message: *\"{last_msg}\"*.\n\n"
            "I am **Convo AI**, your intelligent conversational assistant! "
            "I support streaming responses, multi-turn dialogue, markdown formatting, and code highlighting.\n\n"
            "You can switch between Gemini, OpenAI, or Mock provider anytime from the settings or your `.env` file. "
            "How can I assist your project today?"
        )

    # Stream out words with slight async pause
    words = reply.split(" ")
    for i, word in enumerate(words):
        await asyncio.sleep(0.035)
        prefix = "" if i == 0 else " "
        payload = {"chunk": prefix + word, "done": False}
        yield f"data: {json.dumps(payload)}\n\n"

    # Send final done message
    yield f"data: {json.dumps({'chunk': '', 'done': True, 'model': 'mock-convo-v1', 'provider': 'mock'})}\n\n"


async def gemini_stream(request: ChatRequest) -> AsyncGenerator[str, None]:
    """Streams responses from Google Gemini API."""
    api_key = settings.gemini_api_key
    if not api_key:
        yield f"data: {json.dumps({'chunk': 'Error: GEMINI_API_KEY is not configured in backend/.env', 'done': True, 'error': True})}\n\n"
        return

    try:
        # Try new google-genai SDK first
        from google import genai
        client = genai.Client(api_key=api_key)
        
        # Build contents from messages
        contents = []
        for msg in request.messages:
            contents.append({
                "role": "model" if msg.role == "assistant" else "user",
                "parts": [{"text": msg.content}]
            })
            
        model_name = request.model or settings.default_gemini_model
        
        # Run synchronous stream in thread pool to prevent blocking asyncio loop
        def generate():
            return client.models.generate_content_stream(
                model=model_name,
                contents=contents
            )
            
        stream = await asyncio.to_thread(generate)
        for chunk in stream:
            text = chunk.text or ""
            if text:
                payload = {"chunk": text, "done": False}
                yield f"data: {json.dumps(payload)}\n\n"
                
        yield f"data: {json.dumps({'chunk': '', 'done': True, 'model': model_name, 'provider': 'gemini'})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'chunk': f'Gemini Error: {str(e)}', 'done': True, 'error': True})}\n\n"


async def openai_stream(request: ChatRequest) -> AsyncGenerator[str, None]:
    """Streams responses from OpenAI API."""
    api_key = settings.openai_api_key
    if not api_key:
        yield f"data: {json.dumps({'chunk': 'Error: OPENAI_API_KEY is not configured in backend/.env', 'done': True, 'error': True})}\n\n"
        return

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key)
        
        model_name = request.model or settings.default_openai_model
        messages: List[Dict[str, str]] = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
            
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

        yield f"data: {json.dumps({'chunk': '', 'done': True, 'model': model_name, 'provider': 'openai'})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'chunk': f'OpenAI Error: {str(e)}', 'done': True, 'error': True})}\n\n"


async def get_stream_generator(request: ChatRequest) -> AsyncGenerator[str, None]:
    """Determines provider and returns corresponding stream generator."""
    provider = request.provider or settings.active_provider
    
    # Auto-fallback logic
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
            id="mock-convo-v1",
            name="Convo AI Simulator (Mock)",
            provider="mock",
            is_available=True,
            description="Built-in fast simulated LLM for testing without API keys."
        ),
        ModelInfo(
            id="gemini-2.5-flash",
            name="Gemini 2.5 Flash",
            provider="gemini",
            is_available=has_gemini,
            description="Ultra-fast, versatile Google multimodal model."
        ),
        ModelInfo(
            id="gemini-2.5-pro",
            name="Gemini 2.5 Pro",
            provider="gemini",
            is_available=has_gemini,
            description="Google's highest intelligence reasoning model."
        ),
        ModelInfo(
            id="gpt-4o-mini",
            name="GPT-4o Mini",
            provider="openai",
            is_available=has_openai,
            description="Fast, lightweight OpenAI flagship model."
        ),
        ModelInfo(
            id="gpt-4o",
            name="GPT-4o",
            provider="openai",
            is_available=has_openai,
            description="OpenAI's high-intelligence flagship model."
        )
    ]

