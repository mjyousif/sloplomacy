<#
.SYNOPSIS
  Check or apply code formatting across backend and frontend.
#>
param(
    [switch]$Check,
    [switch]$BackendOnly,
    [switch]$FrontendOnly
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"
$FrontendDir = Join-Path $RepoRoot "frontend"

Write-Host "=================================================" -ForegroundColor Cyan
if ($Check) {
    Write-Host "  Sloplomacy - Code Formatting Verification       " -ForegroundColor Cyan
} else {
    Write-Host "  Sloplomacy - Code Formatting Application        " -ForegroundColor Cyan
}
Write-Host "=================================================" -ForegroundColor Cyan

$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"
$PythonCmd = if (Test-Path $VenvPython) { $VenvPython } else { "python" }

# 1. Backend Formatting (Ruff)
if (-not $FrontendOnly) {
    Write-Host "`n[1/2] Processing Python backend (Ruff)..." -ForegroundColor Cyan
    Push-Location $RepoRoot
    try {
        if ($Check) {
            & $PythonCmd -m ruff format --check backend/
        } else {
            & $PythonCmd -m ruff format backend/
        }
        if ($LASTEXITCODE -ne 0) { throw "Ruff format failed with code $LASTEXITCODE" }
        Write-Host "[OK] Backend formatting complete!" -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

# 2. Frontend Formatting (Biome)
if (-not $BackendOnly) {
    Write-Host "`n[2/2] Processing Frontend (Biome)..." -ForegroundColor Cyan
    Push-Location $FrontendDir
    try {
        if ($Check) {
            npm run format:check
        } else {
            npm run format
        }
        if ($LASTEXITCODE -ne 0) { throw "Biome format failed with code $LASTEXITCODE" }
        Write-Host "[OK] Frontend formatting complete!" -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

Write-Host "`n=================================================" -ForegroundColor Green
Write-Host "  FORMATTING COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
