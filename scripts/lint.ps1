<#
.SYNOPSIS
  Run backend and frontend linters and typechecks without side effects.
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
Write-Host "  Sloplomacy - Code Quality & Linting Gates       " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"
$PythonCmd = if (Test-Path $VenvPython) { $VenvPython } else { "python" }

# 1. Backend Linting (Ruff)
if (-not $FrontendOnly) {
    Write-Host "`n[1/2] Linting Python backend (Ruff)..." -ForegroundColor Cyan
    Push-Location $RepoRoot
    try {
        & $PythonCmd -m ruff check backend/ scripts/generate_api.py
        if ($LASTEXITCODE -ne 0) { throw "Ruff check failed with code $LASTEXITCODE" }
        & $PythonCmd scripts/generate_api.py --check
        if ($LASTEXITCODE -ne 0) { throw "API codegen drift check failed with code $LASTEXITCODE" }
        Write-Host "[OK] Backend lint and API codegen checks passed!" -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

# 2. Frontend Linting & Typecheck (Biome & tsc)
if (-not $BackendOnly) {
    Write-Host "`n[2/2] Linting & typechecking Frontend (Biome & tsc)..." -ForegroundColor Cyan
    Push-Location $FrontendDir
    try {
        npm run lint
        if ($LASTEXITCODE -ne 0) { throw "Frontend lint failed with code $LASTEXITCODE" }

        npm run typecheck
        if ($LASTEXITCODE -ne 0) { throw "Frontend typecheck failed with code $LASTEXITCODE" }

        Write-Host "[OK] Frontend lint and typecheck passed!" -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

Write-Host "`n=================================================" -ForegroundColor Green
Write-Host "  ALL LINT CHECKS PASSED!" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
