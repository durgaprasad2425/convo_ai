@echo off
echo ========================================================
echo               Starting Convo AI Workspace
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/2] Launching FastAPI Backend on http://localhost:8000 ...
start "Convo AI - Backend (FastAPI)" cmd /k "cd backend && call venv\Scripts\activate && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo [2/2] Launching Next.js Frontend on http://localhost:3000 ...
start "Convo AI - Frontend (Next.js)" cmd /k "cd frontend && npm run dev"

echo.
echo Both servers have been launched in separate windows!
echo - Frontend: http://localhost:3000
echo - Backend API Docs: http://localhost:8000/docs
echo ========================================================

