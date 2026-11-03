param(
    [switch]$SeparateWindows,
    [switch]$NoBrowser,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RemainingArgs
)

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
$BackendDir = Join-Path $ScriptDir "backend"
$FrontendDir = Join-Path $ScriptDir "frontend"
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  Diplomacy 1901 Tactical Engine - Local Runner   " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# Check if venv python exists
if (-not (Test-Path $VenvPython)) {
    Write-Host "Virtual environment not found. Setting up backend..." -ForegroundColor Yellow
    python -m venv (Join-Path $BackendDir ".venv")
    & (Join-Path $BackendDir ".venv\Scripts\pip.exe") install -r (Join-Path $BackendDir "requirements.txt")
}

# Check frontend node_modules
if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
    Write-Host "Frontend node_modules not found. Running npm install..." -ForegroundColor Yellow
    Push-Location $FrontendDir
    npm install
    Pop-Location
}

if ($SeparateWindows) {
    Write-Host "`nLaunching Backend and Frontend in separate windows..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$BackendDir'; Write-Host 'FastAPI Backend running on http://127.0.0.1:8000' -ForegroundColor Cyan; & '$VenvPython' -m uvicorn main:app --reload --port 8000"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$FrontendDir'; Write-Host 'Vite Frontend running on http://localhost:5173' -ForegroundColor Green; npm run dev"
    
    if (-not $NoBrowser) {
        Start-Sleep -Seconds 2
        Start-Process "http://localhost:5173"
    }
    Write-Host "`nServers started in separate windows." -ForegroundColor Green
    Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
    Write-Host "Backend:  http://127.0.0.1:8000" -ForegroundColor Cyan
} else {
    $extraArgs = @()
    if ($NoBrowser) {
        $extraArgs += "--no-open"
    }
    if ($RemainingArgs) {
        $extraArgs += $RemainingArgs
    }
    & python (Join-Path $ScriptDir "quickstart.py") @extraArgs
}
