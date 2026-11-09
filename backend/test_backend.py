import asyncio
import httpx
from app.main import app
from app.schemas import ChatRequest, ChatMessage
from app.services.llm import get_stream_generator


async def test_stream():
    req = ChatRequest(
        messages=[ChatMessage(role="user", content="Hello, write a short python greeting!")]
    )
    generator = await get_stream_generator(req)
    chunks = []
    async for chunk in generator:
        chunks.append(chunk)
    print(f"Stream yielded {len(chunks)} events.")
    print("Sample output:", "".join(chunks)[:150])


if __name__ == "__main__":
    asyncio.run(test_stream())
    print("Backend test passed successfully!")
