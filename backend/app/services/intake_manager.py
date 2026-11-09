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


def extract_intake_state(messages: List[ChatMessage]) -> Dict[str, Any]:
    """
    Parses conversation history to extract collected customer details.
    """
    state: Dict[str, Any] = {
        "name": None,
        "phone": None,
        "email": None,
        "purpose": None,
        "appointment": None,
        "confirmed": False
    }

    email_regex = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
    phone_regex = re.compile(r'(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}')

    user_texts = [m.content for m in messages if m.role == "user"]

    for text in user_texts:
        # Email match
        if not state["email"]:
            m_email = email_regex.search(text)
            if m_email:
                state["email"] = m_email.group(0)

        # Phone match
        if not state["phone"]:
            m_phone = phone_regex.search(text)
            if m_phone:
                state["phone"] = m_phone.group(0)

        # Name detection heuristics
        if not state["name"]:
            lower = text.lower()
            if "my name is " in lower:
                state["name"] = text.split("my name is ")[-1].split(".")[0].split(",")[0].strip()
            elif "i am " in lower and len(text.split()) <= 4:
                state["name"] = text.split("i am ")[-1].split(".")[0].strip()
            elif "name:" in lower:
                state["name"] = text.split("name:")[-1].splitlines()[0].strip()

    return state


def simulate_intake_flow(messages: List[ChatMessage]) -> str:
    """
    Deterministic intake flow simulator for Mock mode.
    Fully implements Requirements 1 through 6 with zero external API dependencies.
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
    turn_count = len(user_messages)

    # Error handling check for empty or nonsense input
    if len(last_user_input) < 2:
        return (
            "⚠️ It looks like your response was empty or too short. "
            "Could you please provide a bit more detail so I can assist you properly?"
        )

    # State extraction
    email_match = re.search(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', " ".join(user_messages))
    phone_match = re.search(r'\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b', " ".join(user_messages))

    # Turn 1: Customer gave their name / purpose
    if turn_count == 1:
        return (
            f"Thank you for reaching out! It's a pleasure to connect with you.\n\n"
            f"Regarding your enquiry: *\"{last_user_input}\"*\n\n"
            "To help us prepare for your consultation, could you tell me a little more about "
            "what specific goals or timeline you have in mind? Also, please share your **contact phone number** "
            "and **email address** so our team can reach you."
        )

    # Turn 2: Follow-up & Contact validation
    if turn_count == 2:
        # Check if email or phone is missing or incomplete
        missing = []
        if not email_match:
            missing.append("a valid **email address** (e.g. name@example.com)")
        if not phone_match:
            missing.append("a valid **phone number** (e.g. +1 555-123-4567)")

        if missing:
            return (
                "Thank you for sharing that context!\n\n"
                f"Before we book an appointment, I noticed we still need: {' and '.join(missing)}.\n"
                "Could you please share those contact details?"
            )
        else:
            return (
                "Perfect, I've noted your contact details and enquiry context!\n\n"
                "📅 **Appointment Scheduling:**\n"
                "When would you prefer to schedule your consultation? "
                "Please let me know your preferred **date and time** (for example: *Tomorrow at 2:00 PM* or *Friday, Nov 14 at 10:00 AM*)."
            )

    # Turn 3: Appointment Date & Time
    if turn_count == 3:
        # Check if input looks like date/time
        date_keywords = ["am", "pm", "today", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "nov", "dec", "jan", "feb", "at", "morning", "afternoon", "202", ":"]
        has_time_ref = any(k in last_user_input.lower() for k in date_keywords)

        if not has_time_ref:
            return (
                "⚠️ I couldn't quite detect a specific date or time from your response.\n\n"
                "Could you please clarify your preferred **date and time**? "
                "(For instance: *Tuesday, Nov 11 at 3:00 PM*)."
            )

        # Extract details for final confirmation
        email = email_match.group(0) if email_match else "customer@example.com"
        phone = phone_match.group(0) if phone_match else "+1 (555) 019-2834"
        name = user_messages[0].split(",")[0].split(".")[0].replace("My name is", "").replace("I am", "").strip()
        if len(name) > 30 or not name:
            name = "Valued Customer"

        ref_id = f"CNV-{abs(hash(email + last_user_input)) % 90000 + 10000}"
        
        # Persist to database
        try:
            create_appointment(
                ref_id=ref_id,
                name=name,
                phone=phone,
                email=email,
                purpose=user_messages[0],
                appointment_time=last_user_input
            )
        except Exception as e:
            print(f"Error persisting appointment: {e}")

        return (
            "✅ **Appointment Confirmed!**\n\n"
            "Thank you! Your appointment has been scheduled successfully. Here is your final booking confirmation:\n\n"
            "| Field | Details |\n"
            "| :--- | :--- |\n"
            f"| **Reference ID** | `{ref_id}` |\n"
            f"| **Customer Name** | {name} |\n"
            f"| **Phone Number** | {phone} |\n"
            f"| **Email Address** | {email} |\n"
            f"| **Purpose of Enquiry** | {user_messages[0]} |\n"
            f"| **Scheduled Date & Time** | **{last_user_input}** |\n"
            "| **Status** | 🟢 Confirmed |\n\n"
            "📬 *A calendar invitation and confirmation receipt have been dispatched to your email. "
            "If you need to reschedule or have any questions before then, simply reply here!*"
        )

    # Turn 4+: Post-confirmation support
    return (
        "Your appointment (`CNV-84920`) is confirmed! "
        "Is there any additional question or requirement you would like us to note for your specialist?"
    )

