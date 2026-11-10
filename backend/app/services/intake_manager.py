import re
from typing import Dict, Any, Optional, List, Tuple
from app.schemas import ChatMessage, ChatRequest
from app.db import create_appointment


INTAKE_SYSTEM_PROMPT = """You are "Convo Desk", an intelligent, empathetic customer intake and appointment scheduling assistant.

YOUR GOAL:
Guide the customer through a polite, natural, step-by-step intake and appointment booking process following these 6 strict requirements:

REQUIREMENT 1: WELCOME MESSAGE
- If this is the start of the chat, greet the customer warmly, introduce yourself, and ask how you can help them today.

REQUIREMENT 2 & 3: DATA COLLECTION & CONVERSATIONAL FLOW
- Naturally collect the customer's:
  1. Full Name
  2. Contact Number
  3. Email Address
  4. Purpose of Enquiry
- Crucial Conversational Flow Rule: When the customer describes their purpose or issue, ALWAYS ask at least one relevant, helpful follow-up question or provide a helpful insight related to their specific inquiry before jumping directly to booking.
- Ask for missing information one or two items at a time so the customer is not overwhelmed.

REQUIREMENT 4: APPOINTMENT SCHEDULING
- Once you understand their purpose and have their contact details, ask for their preferred appointment date and time.

REQUIREMENT 5: CONFIRMATION
- Once all information (Name, Contact Number, Email, Purpose, Preferred Date & Time) is gathered and verified, display a formal structured Booking Confirmation summary:
  - 📋 Reference ID (e.g., CNV-XXXX)
  - 👤 Customer Name
  - 📞 Contact Number
  - ✉️ Email Address
  - 🎯 Purpose of Enquiry
  - 📅 Scheduled Date & Time
  - ℹ️ Next Steps / Cancellation policy

REQUIREMENT 6: ERROR HANDLING
- If the customer enters an invalid email (missing @ or domain) or invalid phone number, politely ask them to correct it.
- If a customer's answer is vague or incomplete, politely ask for clarification without resetting progress.
- Never lose previously collected information.
"""


def extract_customer_name(all_text: str) -> str:
    """Extracts customer full name with robust heuristics."""
    for prefix in ["my name is ", "i am ", "i'm ", "name:"]:
        if prefix in all_text.lower():
            idx = all_text.lower().find(prefix) + len(prefix)
            sub = all_text[idx:]
            for delim in [".", ",", " and ", " - ", "\n", ";", ":"]:
                if delim in sub:
                    sub = sub.split(delim)[0]
            candidate = sub.strip()
            # Clean non-alpha
            cleaned = re.sub(r'[^a-zA-Z\s]', '', candidate).strip()
            if cleaned and len(cleaned.split()) <= 4:
                return cleaned.title()
    return ""


def extract_intake_state(messages: List[ChatMessage]) -> Dict[str, Any]:
    """Parses conversation history to extract collected customer details."""
    user_texts = [m.content for m in messages if m.role == "user"]
    combined = " ".join(user_texts)

    email_regex = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
    phone_regex = re.compile(r'\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b')

    m_email = email_regex.search(combined)
    m_phone = phone_regex.search(combined)

    name = extract_customer_name(combined)

    # Detect appointment date/time
    date_keywords = ["am", "pm", "today", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "nov", "dec", "jan", "feb", "morning", "afternoon", "at "]
    appointment_time = None
    for text in reversed(user_texts):
        if any(k in text.lower() for k in date_keywords):
            appointment_time = text.strip()
            break

    return {
        "name": name if name else None,
        "phone": m_phone.group(0) if m_phone else None,
        "email": m_email.group(0) if m_email else None,
        "purpose": user_texts[0] if user_texts else None,
        "appointment": appointment_time,
        "confirmed": bool(appointment_time and m_email and m_phone)
    }


def simulate_intake_flow(messages: List[ChatMessage]) -> str:
    """
    Deterministic, state-machine intake flow simulator for Mock mode.
    Handles any number of user turns dynamically without brittle step counters.
    """
    user_messages = [m.content.strip() for m in messages if m.role == "user"]
    if not user_messages:
        return (
            "👋 **Hello and welcome!**\n\n"
            "I'm **Convo Desk**, your virtual assistant. I'm here to assist with your inquiries "
            "and help schedule an appointment with our specialist team.\n\n"
            "To get started, may I have your **full name** and the **purpose of your enquiry** today?"
        )

    last_user_input = user_messages[-1]
    all_user_text = " ".join(user_messages)

    # 1. Error handling check for empty or nonsense input
    if len(last_user_input) < 2:
        return (
            "⚠️ It looks like your response was empty or too short. "
            "Could you please provide a bit more detail so I can assist you properly?"
        )

    # 2. Extract state
    name = extract_customer_name(all_user_text) or "there"
    email_match = re.search(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', all_user_text)
    phone_match = re.search(r'\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b', all_user_text)

    # Check date/time reference
    date_keywords = ["am", "pm", "today", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "nov", "dec", "jan", "feb", "at ", "morning", "afternoon", "202", ":"]
    has_time_ref = any(k in last_user_input.lower() for k in date_keywords)

    # State Branch 1: Customer has not provided contact details (Email or Phone)
    if not email_match or not phone_match:
        # If this is the very first inquiry
        if len(user_messages) == 1:
            name_salutation = f" {name}" if name != "there" else ""
            return (
                f"Thank you{name_salutation}! It's a pleasure to connect with you.\n\n"
                f"Regarding your enquiry: *\"{user_messages[0]}\"*\n\n"
                "To help us best prepare for your consultation, could you tell me a little more about "
                "your specific timeline or requirements? Also, please share your **contact phone number** "
                "and **email address** so our team can reach you."
            )
        else:
            missing = []
            if not email_match:
                missing.append("a valid **email address** (e.g. name@example.com)")
            if not phone_match:
                missing.append("a valid **phone number** (e.g. +1 555-123-4567)")

            return (
                "Thank you for sharing that context!\n\n"
                f"Before we confirm your appointment slot, I noticed we still need: {' and '.join(missing)}.\n"
                "Could you please share those details?"
            )

    # State Branch 2: Contact info exists, but appointment date/time is needed
    if not has_time_ref:
        return (
            f"Thank you, {name}! I have noted your contact details:\n"
            f"- 📞 Phone: **{phone_match.group(0)}**\n"
            f"- ✉️ Email: **{email_match.group(0)}**\n\n"
            "📅 **Appointment Scheduling:**\n"
            "When would you prefer to schedule your consultation? "
            "Please select or type your preferred **date and time** (for example: *Tomorrow at 10:00 AM* or *Friday at 2:30 PM*)."
        )

    # State Branch 3: Contact info AND Date/Time provided -> CONFIRMATION!
    final_email = email_match.group(0)
    final_phone = phone_match.group(0)
    customer_name = name if name != "there" else "Valued Customer"
    appointment_slot = last_user_input

    # Generate unique reference code
    ref_id = f"CNV-{abs(hash(final_email + appointment_slot)) % 90000 + 10000}"

    # Persist directly into SQLite database
    try:
        create_appointment(
            ref_id=ref_id,
            name=customer_name,
            phone=final_phone,
            email=final_email,
            purpose=user_messages[0],
            appointment_time=appointment_slot
        )
    except Exception as e:
        print(f"Error persisting appointment: {e}")

    return (
        "✅ **Appointment Confirmed!**\n\n"
        "Thank you! Your appointment has been scheduled successfully. Here is your final booking confirmation:\n\n"
        "| Field | Details |\n"
        "| :--- | :--- |\n"
        f"| **Reference ID** | `{ref_id}` |\n"
        f"| **Customer Name** | {customer_name} |\n"
        f"| **Phone Number** | {final_phone} |\n"
        f"| **Email Address** | {final_email} |\n"
        f"| **Purpose of Enquiry** | {user_messages[0]} |\n"
        f"| **Scheduled Date & Time** | **{appointment_slot}** |\n"
        "| **Status** | 🟢 Confirmed |\n\n"
        "📬 *A calendar invitation and confirmation receipt have been dispatched to your email. "
        "If you need to reschedule or have any questions before then, simply reply here!*"
    )
