# Convo AI 🤖💬

A full-stack, real-time conversational AI application built with **Next.js (React 19, Tailwind CSS)** frontend and **FastAPI (Python 3.14)** backend.

## ✨ Features

- **Real-Time Streaming:** Server-Sent Events (SSE) provide fluid, word-by-word streaming responses.
- **Multi-Provider Support:**
  - 🌟 **Google Gemini API** (`gemini-2.5-flash`, `gemini-2.5-pro`)
  - 🧠 **OpenAI API** (`gpt-4o-mini`, `gpt-4o`)
  - ⚡ **Built-in Mock Simulator** (works immediately without any API keys)
- **Modern UI / UX:**
  - Responsive chat interface with auto-scrolling
  - Markdown formatting & syntax code blocks
  - Provider & model selector with instant live feedback
  - Multi-session chat history with session switching & clear chat
  - Quick prompt suggestions to kickstart conversations
  - Dark & light mode aesthetics
- **Type-Safe:** Pydantic schemas on backend, TypeScript interfaces on frontend.

---

## 🚀 Quick Start

### 1. One-Click Start (Windows)
Double-click `start.bat` or run:
```powershell
.\start.bat
```
This opens both the FastAPI backend and Next.js frontend in separate terminal windows.

---

### 2. Manual Start

#### Backend:
```bash
cd backend
# Activate virtual environment
venv\Scripts\activate   # On Windows
# (or source venv/bin/activate on macOS/Linux)

# Start backend server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
API Documentation will be available at [http://localhost:8000/docs](http://localhost:8000/docs).

#### Frontend:
```bash
cd frontend
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 Environment Configuration

In `backend/.env`:
```env
# Server
HOST=0.0.0.0
PORT=8000
DEBUG=True

# LLM Providers (Optional - mock mode runs if keys are not provided)
GEMINI_API_KEY=your_gemini_api_key_here
DEFAULT_GEMINI_MODEL=gemini-2.5-flash

OPENAI_API_KEY=your_openai_api_key_here
DEFAULT_OPENAI_MODEL=gpt-4o-mini

# Active Provider: "mock", "gemini", or "openai"
ACTIVE_PROVIDER=mock
```

---

## 📁 Project Architecture

```
convo_ai/
├── backend/
│   ├── app/
│   │   ├── config.py         # Application configuration & settings
│   │   ├── main.py           # FastAPI entrypoint, SSE streaming endpoints
│   │   ├── schemas.py        # Pydantic schemas (messages, requests, models)
│   │   └── services/
│   │       └── llm.py        # Streaming adapters for Gemini, OpenAI & Mock
│   ├── requirements.txt      # Python dependencies
│   ├── .env.example          # Example environment file
│   └── test_backend.py       # Automated streaming verification script
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx      # Interactive chat UI
│   │   │   ├── layout.tsx    # App root layout
│   │   │   └── globals.css   # Tailwind styles
│   ├── package.json
│   └── tsconfig.json
├── start.bat                 # Convenient launch script
└── README.md
```
