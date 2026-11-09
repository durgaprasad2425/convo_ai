import asyncio
from app.schemas import ChatRequest, ChatMessage
from app.services.llm import get_stream_generator


async def test_full_intake_flow():
    print("--- [Requirement 1] Testing Initial Welcome ---")
    req1 = ChatRequest(messages=[])
    gen1 = await get_stream_generator(req1)
    out1 = ""
    async for chunk in gen1:
        if chunk.startswith("data: "):
            import json
            data = json.loads(chunk[6:].strip())
            out1 += data.get("chunk", "")
    print("Welcome output:\n", out1)
    assert "welcome" in out1.lower() or "hello" in out1.lower()

    print("\n--- [Requirement 2 & 3] Customer provides Name and Purpose ---")
    req2 = ChatRequest(messages=[
        ChatMessage(role="user", content="Hi, my name is Alex Carter and I need consultation on cloud migration for our enterprise database.")
    ])
    gen2 = await get_stream_generator(req2)
    out2 = ""
    async for chunk in gen2:
        if chunk.startswith("data: "):
            import json
            data = json.loads(chunk[6:].strip())
            out2 += data.get("chunk", "")
    print("Follow-up response:\n", out2)
    assert "timeline" in out2.lower() or "goals" in out2.lower()

    print("\n--- [Requirement 6] Incomplete details test ---")
    req_incomplete = ChatRequest(messages=[
        ChatMessage(role="user", content="Alex Carter, enterprise database"),
        ChatMessage(role="assistant", content=out2),
        ChatMessage(role="user", content="We want to do it in Q1. Here is my phone: 555-987-6543") # missing email!
    ])
    gen_inc = await get_stream_generator(req_incomplete)
    out_inc = ""
    async for chunk in gen_inc:
        if chunk.startswith("data: "):
            import json
            data = json.loads(chunk[6:].strip())
            out_inc += data.get("chunk", "")
    print("Error handling response (missing email):\n", out_inc)
    assert "email" in out_inc.lower()

    print("\n--- [Requirement 4 & 5] Complete details & Appointment Confirmation ---")
    req3 = ChatRequest(messages=[
        ChatMessage(role="user", content="My name is Alex Carter. Purpose: enterprise database migration."),
        ChatMessage(role="assistant", content=out2),
        ChatMessage(role="user", content="alex.carter@enterprise.com and my phone is +1 (555) 987-6543"),
        ChatMessage(role="assistant", content="Perfect! When would you like to schedule?"),
        ChatMessage(role="user", content="Tomorrow at 2:30 PM")
    ])
    gen3 = await get_stream_generator(req3)
    out3 = ""
    async for chunk in gen3:
        if chunk.startswith("data: "):
            import json
            data = json.loads(chunk[6:].strip())
            out3 += data.get("chunk", "")
    print("Confirmation output:\n", out3)
    assert "confirmed" in out3.lower() or "reference" in out3.lower()
    print("\n✅ ALL 6 REQUIREMENTS VERIFIED SUCCESSFULLY!")


if __name__ == "__main__":
    asyncio.run(test_full_intake_flow())
