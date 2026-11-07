<#
.SYNOPSIS
  Automated Infrastructure-as-Code Build & Deploy Script for Google Cloud Run + Supabase.
.DESCRIPTION
  Builds the unified single-container image (React + FastAPI) using Google Cloud Build
  and deploys it to Google Cloud Run with true Scale-to-Zero ($0 idle cost) and persistent
  Supabase PostgreSQL state tracking.
#>

param(
    [string]$ProjectId = "",
    [string]$Region = "us-central1",
    [string]$ServiceName = "diplomacy-1901",
    [string]$SupabaseUrl = "",
    [string]$SupabaseAnonKey = "",
    [string]$SupabaseServiceRoleKey = "",
    [string]$SupabaseJwtSecret = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Sloplomacy 1901 - Google Cloud Run Automated Deployer   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Resolve GCP Project
$detectedProject = (gcloud config get-value project 2>$null).Trim()
if (-not $ProjectId) {
    if ($detectedProject) {
        $confirm = Read-Host "Detected GCP project '$detectedProject'. Use this project? (Y/n or enter new Project ID)"
        if ($confirm -eq "" -or $confirm -match "^[Yy]") {
            $ProjectId = $detectedProject
        } else {
            $ProjectId = $confirm.Trim()
        }
    }
}

if (-not $ProjectId) {
    $ProjectId = Read-Host "Enter your Google Cloud Project ID"
}

if (-not $ProjectId) {
    Write-Host "[!] Error: No GCP Project ID provided." -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Target GCP Project: $ProjectId" -ForegroundColor Green
Write-Host "[OK] Target GCP Region : $Region" -ForegroundColor Green

# 2. Resolve Supabase Environment Variables
$EnvFilePath = Join-Path $RepoRoot "frontend\.env"
if (Test-Path $EnvFilePath) {
    Write-Host "[OK] Reading Supabase credentials from $EnvFilePath..." -ForegroundColor Green
    Get-Content $EnvFilePath | ForEach-Object {
        $line = $_.Trim()
        if ($line -match "^VITE_SUPABASE_URL\s*=\s*(.*)$" -or $line -match "^SUPABASE_URL\s*=\s*(.*)$") {
            if (-not $SupabaseUrl) {
                $SupabaseUrl = $matches[1].Trim('"'' ')
            }
        }
        if ($line -match "^VITE_SUPABASE_ANON_KEY\s*=\s*(.*)$" -or $line -match "^SUPABASE_ANON_KEY\s*=\s*(.*)$") {
            if (-not $SupabaseAnonKey) {
                $SupabaseAnonKey = $matches[1].Trim('"'' ')
            }
        }
        if ($line -match "^SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.*)$" -or $line -match "^SUPABASE_KEY\s*=\s*(.*)$") {
            if (-not $SupabaseServiceRoleKey) {
                $SupabaseServiceRoleKey = $matches[1].Trim('"'' ')
            }
        }
        if ($line -match "^SUPABASE_JWT_SECRET\s*=\s*(.*)$") {
            if (-not $SupabaseJwtSecret) {
                $SupabaseJwtSecret = $matches[1].Trim('"'' ')
            }
        }
    }
}

if (-not $SupabaseUrl -or -not $SupabaseAnonKey) {
    Write-Host "[!] Notice: Supabase credentials not found in frontend\.env" -ForegroundColor Yellow
    if (-not $SupabaseUrl) {
        $SupabaseUrl = Read-Host "Enter VITE_SUPABASE_URL (press Enter to skip/disable Cloud Auth)"
    }
    if (-not $SupabaseAnonKey -and $SupabaseUrl) {
        $SupabaseAnonKey = Read-Host "Enter VITE_SUPABASE_ANON_KEY"
    }
}

# 3. Enable Required Google Cloud Services
Write-Host ""
Write-Host "--> Enabling required Google Cloud APIs..." -ForegroundColor Cyan
gcloud services enable `
    run.googleapis.com `
    cloudbuild.googleapis.com `
    artifactregistry.googleapis.com `
    --project $ProjectId

# 4. Build Container Image with Google Cloud Build
$ImageTag = "gcr.io/$ProjectId/${ServiceName}:latest"
Write-Host ""
Write-Host "--> Building container on Cloud Build ($ImageTag)..." -ForegroundColor Cyan

$buildSuccess = $false
try {
    $ShortSha = (git rev-parse --short HEAD 2>$null)
    if (-not $ShortSha) { $ShortSha = "dev" }
    gcloud builds submit `
        --config="$RepoRoot\cloudbuild.yaml" `
        --substitutions="_SUPABASE_URL=$SupabaseUrl,_SUPABASE_ANON_KEY=$SupabaseAnonKey,_SHORT_SHA=$ShortSha,_IMAGE_TAG=$ImageTag" `
        --project $ProjectId `
        $RepoRoot
    $buildSuccess = ($LASTEXITCODE -eq 0)
} catch {
    Write-Host "[!] Build failed: $_" -ForegroundColor Red
    exit 1
}

if (-not $buildSuccess) {
    Write-Host "[!] Cloud Build encountered an error. Halting deployment." -ForegroundColor Red
    exit 1
}

# 5. Deploy to Google Cloud Run (Scale-to-zero)
Write-Host ""
Write-Host "--> Deploying service to Google Cloud Run with Supabase Database Persistence..." -ForegroundColor Cyan

# The backend persists games only with the service role key. RLS gives the anon key zero rows,
# so falling back to it would make every saved game look deleted.
if ($SupabaseUrl -and -not $SupabaseServiceRoleKey) {
    Write-Host "[!] Warning: no SUPABASE_SERVICE_ROLE_KEY given. Game persistence stays off unless the service already has it." -ForegroundColor Yellow
}

# --update-env-vars keeps variables set by hand on the service, and only values that are present
# are sent, so a missing value never blanks one that is already set.
$envPairs = [ordered]@{
    VITE_SUPABASE_URL         = $SupabaseUrl
    VITE_SUPABASE_ANON_KEY    = $SupabaseAnonKey
    SUPABASE_URL              = $SupabaseUrl
    SUPABASE_KEY              = $SupabaseServiceRoleKey
    SUPABASE_SERVICE_ROLE_KEY = $SupabaseServiceRoleKey
    SUPABASE_JWT_SECRET       = $SupabaseJwtSecret
}
$envVars = ($envPairs.GetEnumerator() | Where-Object { $_.Value } | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ","

# --max-instances 1 is required: games live in one process.
# --timeout 3600 lets a WebSocket stay open for an hour instead of 5 minutes.
$deployArgs = @(
    "run", "deploy", $ServiceName,
    "--image", $ImageTag,
    "--region", $Region,
    "--project", $ProjectId,
    "--platform", "managed",
    "--allow-unauthenticated",
    "--min-instances", "0",
    "--max-instances", "1",
    "--memory", "512Mi",
    "--port", "8080",
    "--timeout", "3600"
)
if ($envVars) {
    $deployArgs += @("--update-env-vars", $envVars)
}

gcloud @deployArgs
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Cloud Run deployment failed." -ForegroundColor Red
    exit 1
}

# 6. Retrieve Service URL
$ServiceUrl = (gcloud run services describe $ServiceName --region $Region --project $ProjectId --format "value(status.url)").Trim()

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  DEPLOYMENT SUCCESSFUL!                                  " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Service URL: $ServiceUrl" -ForegroundColor Cyan
Write-Host "Live App   : $ServiceUrl" -ForegroundColor Cyan
Write-Host "API Docs   : $ServiceUrl/docs" -ForegroundColor Cyan
Write-Host "Scale Mode : Scale-to-Zero (0 idle instances = $0 cost)   " -ForegroundColor DarkGray
Write-Host "Persistence: Supabase PostgreSQL JSONB State Tracking    " -ForegroundColor DarkGray
Write-Host "==========================================================" -ForegroundColor Green
