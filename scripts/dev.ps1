param(
    [switch]$SeparateWindows,
    [switch]$NoBrowser,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RemainingArgs
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"
$FrontendDir = Join-Path $RepoRoot "frontend"
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  Diplomacy 1901 Tactical Engine - Local Dev     " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# Check if venv python exists
$PythonCmd = "python"
if (Test-Path $VenvPython) {
    $PythonCmd = $VenvPython
} else {
    $hasUvicorn = & python -c "import uvicorn" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Virtual environment not found. Setting up backend..." -ForegroundColor Yellow
        python -m venv (Join-Path $BackendDir ".venv")
        & (Join-Path $BackendDir ".venv\Scripts\pip.exe") install -r (Join-Path $BackendDir "requirements.txt")
        $PythonCmd = $VenvPython
    }
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
    # Lets a local demo sign-in work, same as backend_env() in quickstart.py. It is set in the
    # backend window so it cannot stay behind in the shell that ran this script.
    $BackendEnv = "if (-not `$env:ENVIRONMENT) { `$env:ENVIRONMENT = 'development' }"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$BackendDir'; $BackendEnv; Write-Host 'FastAPI Backend running on http://127.0.0.1:8000' -ForegroundColor Cyan; & '$PythonCmd' -m uvicorn main:app --reload --port 8000"
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
    
    $PythonCmd = if (Test-Path $VenvPython) { $VenvPython } else { "python" }
    Push-Location $RepoRoot
    try {
        & $PythonCmd (Join-Path $RepoRoot "quickstart.py") $extraArgs
    } finally {
        Pop-Location
    }
}
