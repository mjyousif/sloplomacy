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
    Write-Host "`n[1/3] Linting Python backend (Ruff)..." -ForegroundColor Cyan
    Push-Location $RepoRoot
    try {
        & $PythonCmd -m ruff check backend/
        if ($LASTEXITCODE -ne 0) { throw "Ruff check failed with code $LASTEXITCODE" }
        Write-Host "[OK] Backend lint checks passed!" -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

# 2. Frontend Linting & Typecheck (Biome & tsc)
if (-not $BackendOnly) {
    Write-Host "`n[2/3] Linting & typechecking Frontend (Biome & tsc)..." -ForegroundColor Cyan
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

# 3. Modularity & File Size Audit
Write-Host "`n[3/3] Checking codebase modularity and file-size ceilings..." -ForegroundColor Cyan
Push-Location $RepoRoot
try {
    & $PythonCmd scripts/check_file_limits.py
    if ($LASTEXITCODE -ne 0) { throw "Modularity check failed with code $LASTEXITCODE" }
    Write-Host "[OK] File size modularity audit passed!" -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host "`n=================================================" -ForegroundColor Green
Write-Host "  ALL LINT CHECKS PASSED!" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
