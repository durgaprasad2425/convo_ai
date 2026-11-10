import asyncio
import json
import re
from datetime import datetime
from typing import AsyncGenerator, List, Dict, Any
from app.config import settings
from app.schemas import ChatMessage, ChatRequest, ChatResponse, ModelInfo, Attachment
from app.services.intake_manager import INTAKE_SYSTEM_PROMPT, simulate_intake_flow, extract_intake_state, build_intake_guidance


def sanitize_text(text: str) -> str:
    """Replaces raw LLM placeholder brackets and strips out echoed meta-instructions."""
    if not text:
        return text
    now = datetime.now()
    today_str = now.strftime("%A, %B %d, %Y")
    text = re.sub(r'\[(?:current|today\'?s?)\s*date\]', today_str, text, flags=re.IGNORECASE)
    text = re.sub(r'\[date\]', today_str, text, flags=re.IGNORECASE)
    text = re.sub(r'\[your name\]', "Convo Desk", text, flags=re.IGNORECASE)
    text = re.sub(r'\(No thank you for an invalid number\.?\)', '', text, flags=re.IGNORECASE)
    return text


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
    reply = simulate_intake_flow(request.messages)

    words = reply.split(" ")
    for i, word in enumerate(words):
        await asyncio.sleep(0.03)
        prefix = "" if i == 0 else " "
        payload = {"chunk": prefix + word, "done": False}
        yield f"data: {json.dumps(payload)}\n\n"

    state = extract_intake_state(request.messages)
    yield f"data: {json.dumps({'chunk': '', 'done': True, 'model': 'mock-intake-v1', 'provider': 'mock', 'intake_state': state})}\n\n"


async def mistral_stream(request: ChatRequest) -> AsyncGenerator[str, None]:
    """Streams responses from Mistral AI API with intake & appointment system instructions."""
    api_key = settings.mistral_api_key
    if not api_key:
        yield f"data: {json.dumps({'chunk': 'Error: MISTRAL_API_KEY is not configured in backend/.env', 'done': True, 'error': True})}\n\n"
        return

    try:
        from openai import AsyncOpenAI
        # Mistral AI provides an official OpenAI-compatible endpoint
        client = AsyncOpenAI(api_key=api_key, base_url="https://api.mistral.ai/v1")
        
        attachment_ctx = build_attachment_context(request.attachments or [])
        model_name = request.model or settings.default_mistral_model
        messages: List[Dict[str, str]] = []
        
        guidance = build_intake_guidance(request.messages)
        system_content = INTAKE_SYSTEM_PROMPT
        if guidance:
            system_content += guidance
        if request.system_prompt:
            system_content += f"\n\nAdditional Instructions: {request.system_prompt}"
        if attachment_ctx:
            system_content += f"\n\nContext files:\n{attachment_ctx}"

        messages.append({"role": "system", "content": system_content})
            
        filtered_msgs = [m for m in request.messages if m.content.strip()]
        has_user_msgs = any(m.role == "user" for m in filtered_msgs)

        if not has_user_msgs:
            welcome_text = simulate_intake_flow([])
            payload = {"chunk": welcome_text, "done": False}
            yield f"data: {json.dumps(payload)}\n\n"
            yield f"data: {json.dumps({'chunk': '', 'done': True, 'model': model_name, 'provider': 'mistral', 'intake_state': extract_intake_state([])})}\n\n"
            return

        for msg in filtered_msgs:
            content = msg.content
            # If the user sent a bare phone number without prose (e.g. 7330640851),
            # frame it so Mistral's safety filter treats it as the user's own business intake contact info
            if msg.role == "user":
                digits = re.sub(r'\D', '', content.strip())
                if 10 <= len(digits) <= 15 and len(content.strip()) <= 18:
                    content = f"My contact phone number is {content.strip()}."
            messages.append({"role": msg.role, "content": content})

        models_to_try = [model_name]
        for alt in ["ministral-8b-latest", "ministral-3b-latest", "codestral-latest"]:
            if alt not in models_to_try:
                models_to_try.append(alt)

        response = None
        last_err = None
        for current_model in models_to_try:
            try:
                response = await client.chat.completions.create(
                    model=current_model,
                    messages=messages,
                    temperature=request.temperature or 0.7,
                    stream=True
                )
                model_name = current_model
                break
            except Exception as err:
                last_err = err
                if "429" in str(err) or "rate" in str(err).lower():
                    await asyncio.sleep(1.2)
                    continue
                else:
                    raise err

        if response is None:
            # Graceful fallback to deterministic intake flow if rate-limited
            async for chunk in mock_stream(request):
                yield chunk
            return

        accumulated_text = ""
        async for chunk in response:
            delta = chunk.choices[0].delta if chunk.choices else None
            text = delta.content if delta and delta.content else ""
            if text:
                text = sanitize_text(text)
                accumulated_text += text
                payload = {"chunk": text, "done": False}
                yield f"data: {json.dumps(payload)}\n\n"

        # Auto-persist appointment in SQLite if confirmation table was emitted
        if "CNV-" in accumulated_text and ("confirm" in accumulated_text.lower() or "booking" in accumulated_text.lower() or "reference id" in accumulated_text.lower()):
            try:
                from app.db import create_appointment
                ref_match = re.search(r"CNV-\d+", accumulated_text)
                ref_id = ref_match.group(0) if ref_match else f"CNV-{int(datetime.now().timestamp()) % 100000}"
                state = extract_intake_state(request.messages)
                user_msgs = [m.content for m in request.messages if m.role == "user"]
                customer_name = state.get("name") or "Valued Customer"
                phone_num = state.get("phone") or "Provided"
                email_addr = state.get("email") or "Provided"
                purpose_text = state.get("purpose") or (user_msgs[0] if user_msgs else "General Consultation")
                sched_time = state.get("appointment") or "Tomorrow at 10:00 AM"

                # Parse Markdown Table if available
                table_lines = [l.strip() for l in accumulated_text.strip().split("\n") if l.strip().startswith("|")]
                if len(table_lines) >= 3 and ("reference id" in table_lines[0].lower() or "customer name" in table_lines[0].lower()):
                    # Horizontal table
                    headers = [h.strip().replace("**", "").lower() for h in table_lines[0].split("|")[1:-1]]
                    values = [v.strip().replace("**", "") for v in table_lines[2].split("|")[1:-1]]
                    data = dict(zip(headers, values))
                    for k, v in data.items():
                        if "name" in k and v: customer_name = v
                        elif ("phone" in k or "contact" in k) and v: phone_num = v
                        elif "email" in k and v: email_addr = v
                        elif "purpose" in k and v: purpose_text = v
                        elif ("date" in k or "time" in k or "scheduled" in k) and v: sched_time = v
                else:
                    # Vertical key-value table
                    time_match = re.search(r"\|\s*(?:\*\*)?Scheduled Date & Time(?:\*\*)?\s*\|\s*(?:\*\*)?([^|\n]+)(?:\*\*)?\s*\|", accumulated_text, re.I)
                    if time_match:
                        sched_time = time_match.group(1).strip()

                # Regex fallback if phone or email was in bullets below the table
                if not phone_num or phone_num == "Provided":
                    phone_match = re.search(r'(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b[6-9]\d{9}\b|\b\d{10}\b', accumulated_text)
                    if phone_match:
                        phone_num = phone_match.group(0).strip()

                if not email_addr or email_addr == "Provided":
                    email_match = re.search(r'\b[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\b', accumulated_text)
                    if email_match:
                        email_addr = email_match.group(0).strip()
                
                create_appointment(
                    ref_id=ref_id,
                    name=customer_name,
                    phone=phone_num,
                    email=email_addr,
                    purpose=purpose_text,
                    appointment_time=sched_time
                )

                # Automatically dispatch calendar event to customer email
                if email_addr and "@" in email_addr:
                    try:
                        from app.services.google_calendar import send_calendar_event_to_customer
                        asyncio.create_task(send_calendar_event_to_customer({
                            "ref_id": ref_id,
                            "name": customer_name,
                            "email": email_addr,
                            "phone": phone_num,
                            "purpose": purpose_text,
                            "appointment_time": sched_time
                        }))
                    except Exception as email_err:
                        print(f"Calendar email auto-dispatch notice: {email_err}")
            except Exception as save_err:
                print(f"Appointment auto-save notice: {save_err}")

        state = extract_intake_state(request.messages)
        yield f"data: {json.dumps({'chunk': '', 'done': True, 'model': model_name, 'provider': 'mistral', 'intake_state': state})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'chunk': f'Mistral Error: {str(e)}', 'done': True, 'error': True})}\n\n"


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
        guidance = build_intake_guidance(request.messages)
        system_instruction = INTAKE_SYSTEM_PROMPT
        if guidance:
            system_instruction += guidance
        if request.system_prompt:
            system_instruction += f"\n\nAdditional Instructions: {request.system_prompt}"

        filtered_msgs = [m for m in request.messages if m.content.strip()]
        has_user_msgs = any(m.role == "user" for m in filtered_msgs)

        if not has_user_msgs:
            welcome_text = simulate_intake_flow([])
            payload = {"chunk": welcome_text, "done": False}
            yield f"data: {json.dumps(payload)}\n\n"
            yield f"data: {json.dumps({'chunk': '', 'done': True, 'model': settings.default_gemini_model, 'provider': 'gemini', 'intake_state': extract_intake_state([])})}\n\n"
            return

        initial_asst_context = ""
        while filtered_msgs and filtered_msgs[0].role == "assistant":
            initial_asst_context += filtered_msgs[0].content + "\n"
            filtered_msgs = filtered_msgs[1:]

        if initial_asst_context:
            system_instruction += f"\n\n[CONTEXT: You previously greeted the customer with:\n\"{initial_asst_context.strip()}\"\nThe customer is now replying to you. Do NOT send another welcome greeting. Acknowledge them directly.]"

        contents = []
        for i, msg in enumerate(filtered_msgs):
            text = msg.content
            if i == len(filtered_msgs) - 1 and attachment_ctx:
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
                text = sanitize_text(text)
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
        
        guidance = build_intake_guidance(request.messages)
        system_content = INTAKE_SYSTEM_PROMPT
        if guidance:
            system_content += guidance
        if request.system_prompt:
            system_content += f"\n\nAdditional Instructions: {request.system_prompt}"
        if attachment_ctx:
            system_content += f"\n\nContext files:\n{attachment_ctx}"

        messages.append({"role": "system", "content": system_content})
            
        filtered_msgs = [m for m in request.messages if m.content.strip()]
        has_user_msgs = any(m.role == "user" for m in filtered_msgs)

        if not has_user_msgs:
            welcome_text = simulate_intake_flow([])
            payload = {"chunk": welcome_text, "done": False}
            yield f"data: {json.dumps(payload)}\n\n"
            yield f"data: {json.dumps({'chunk': '', 'done': True, 'model': model_name, 'provider': 'openai', 'intake_state': extract_intake_state([])})}\n\n"
            return

        for msg in filtered_msgs:
            content = msg.content
            # If the user sent a bare phone number without prose (e.g. 7330640851),
            # frame it so Mistral's safety filter treats it as the user's own business intake contact info
            if msg.role == "user":
                digits = re.sub(r'\D', '', content.strip())
                if 10 <= len(digits) <= 15 and len(content.strip()) <= 18:
                    content = f"My contact phone number is {content.strip()}."
            messages.append({"role": msg.role, "content": content})

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
                text = sanitize_text(text)
                payload = {"chunk": text, "done": False}
                yield f"data: {json.dumps(payload)}\n\n"

        state = extract_intake_state(request.messages)
        yield f"data: {json.dumps({'chunk': '', 'done': True, 'model': model_name, 'provider': 'openai', 'intake_state': state})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'chunk': f'OpenAI Error: {str(e)}', 'done': True, 'error': True})}\n\n"


async def get_stream_generator(request: ChatRequest) -> AsyncGenerator[str, None]:
    """Determines provider and returns corresponding stream generator."""
    provider = request.provider or settings.active_provider
    
    if provider == "mistral":
        if settings.mistral_api_key:
            return mistral_stream(request)
        else:
            return mock_stream(request)
    elif provider == "gemini":
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
    has_mistral = bool(settings.mistral_api_key)
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
            id="mistral-small-latest",
            name="Mistral Small 3",
            provider="mistral",
            is_available=has_mistral,
            description="Fast, high-efficiency Mistral AI reasoning model."
        ),
        ModelInfo(
            id="mistral-large-latest",
            name="Mistral Large 2",
            provider="mistral",
            is_available=has_mistral,
            description="Mistral AI flagship frontier model for complex customer workflows."
        ),
        ModelInfo(
            id="codestral-latest",
            name="Codestral",
            provider="mistral",
            is_available=has_mistral,
            description="Mistral's dedicated code and structured data model."
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
