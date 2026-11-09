# Convo AI PowerShell Dev Launcher
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "               Starting Convo AI Workspace              " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Start FastAPI backend
Write-Host "[1/2] Starting FastAPI Backend on http://127.0.0.1:8000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; .\venv\Scripts\Activate.ps1; python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

# 2. Start Next.js frontend
Write-Host "[2/2] Starting Next.js Frontend on http://localhost:3000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"

Write-Host ""
Write-Host "Services started!" -ForegroundColor Yellow
Write-Host "- Frontend:  http://localhost:3000" -ForegroundColor White
Write-Host "- Backend:   http://127.0.0.1:8000" -ForegroundColor White
Write-Host "- Swagger:   http://127.0.0.1:8000/docs" -ForegroundColor White
Write-Host "========================================================" -ForegroundColor Cyan

