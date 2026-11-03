<#
.SYNOPSIS
  Run all backend and frontend tests, typechecks, and build verifications.
#>
param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"
$FrontendDir = Join-Path $RepoRoot "frontend"

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  Sloplomacy - Full Test Suite & Quality Gates    " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# 1. Backend Pytest
if (-not $FrontendOnly) {
    Write-Host "`n[1/2] Running Backend Tests (Pytest)..." -ForegroundColor Cyan
    $VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"
    $PythonCmd = if (Test-Path $VenvPython) { $VenvPython } else { "python" }
    
    Push-Location $RepoRoot
    try {
        & $PythonCmd -m pytest backend/ -v
        if ($LASTEXITCODE -ne 0) { throw "Backend pytest suite failed with code $LASTEXITCODE" }
        Write-Host "[OK] Backend tests passed!" -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

# 2. Frontend Vitest & Build
if (-not $BackendOnly) {
    Write-Host "`n[2/2] Running Frontend Tests & Typecheck..." -ForegroundColor Cyan
    Push-Location $FrontendDir
    try {
        npm test
        if ($LASTEXITCODE -ne 0) { throw "Frontend Vitest suite failed with code $LASTEXITCODE" }

        Write-Host "Running TypeScript typecheck & Vite build..." -ForegroundColor Cyan
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Frontend build failed with code $LASTEXITCODE" }
        Write-Host "[OK] Frontend tests and build passed!" -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

Write-Host "`n=================================================" -ForegroundColor Green
Write-Host "  ALL TESTS & CHECKS PASSED!" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
