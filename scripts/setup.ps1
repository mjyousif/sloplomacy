<#
.SYNOPSIS
  Set up local developer environment (Python virtualenv, requirements, npm dependencies).
#>
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"
$FrontendDir = Join-Path $RepoRoot "frontend"

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  Sloplomacy - Developer Environment Setup       " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# 1. Backend venv
Write-Host "`n[1/2] Setting up Python backend..." -ForegroundColor Cyan
$VenvDir = Join-Path $BackendDir ".venv"
if (-not (Test-Path $VenvDir)) {
    Write-Host "Creating Python virtual environment in $VenvDir..."
    python -m venv $VenvDir
}
$PipExe = Join-Path $VenvDir "Scripts\pip.exe"
if (-not (Test-Path $PipExe)) { $PipExe = "pip" }
$PipReq = Join-Path $BackendDir "requirements-dev.txt"
if (-not (Test-Path $PipReq)) { $PipReq = Join-Path $BackendDir "requirements.txt" }
Write-Host "Installing backend dependencies from $PipReq..."
& $PipExe install --upgrade pip
& $PipExe install -r $PipReq
Write-Host "[OK] Backend environment ready!" -ForegroundColor Green

# 2. Frontend npm
Write-Host "`n[2/2] Setting up Frontend dependencies..." -ForegroundColor Cyan
Push-Location $FrontendDir
try {
    npm install
    Write-Host "[OK] Frontend environment ready!" -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host "`n=================================================" -ForegroundColor Green
Write-Host "  SETUP COMPLETE! Run .\scripts\dev.ps1 to launch dev." -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
