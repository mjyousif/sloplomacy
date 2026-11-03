<#
.SYNOPSIS
  Automated Infrastructure-as-Code Build & Deploy Script for Google Cloud Run + Supabase.
.DESCRIPTION
  Builds the unified single-container image (React + FastAPI) using Google Cloud Build
  and deploys it to Google Cloud Run with true Scale-to-Zero ($0 idle cost).
#>

param(
    [string]$ProjectId = "",
    [string]$Region = "us-central1",
    [string]$ServiceName = "diplomacy-1901",
    [string]$SupabaseUrl = "",
    [string]$SupabaseAnonKey = ""
)

$ErrorActionPreference = "Stop"

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
$EnvFilePath = Join-Path $PSScriptRoot "frontend\.env"
if (Test-Path $EnvFilePath) {
    Get-Content $EnvFilePath | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $parts = $line.Split("=", 2)
            if ($parts.Length -eq 2) {
                if ($parts[0] -eq "VITE_SUPABASE_URL" -and -not $SupabaseUrl) {
                    $SupabaseUrl = $parts[1].Trim()
                }
                if ($parts[0] -eq "VITE_SUPABASE_ANON_KEY" -and -not $SupabaseAnonKey) {
                    $SupabaseAnonKey = $parts[1].Trim()
                }
            }
        }
    }
}

if (-not $SupabaseUrl -or -not $SupabaseAnonKey) {
    Write-Host ""
    Write-Host "[!] Notice: Supabase credentials not found in frontend\.env" -ForegroundColor Yellow
    Write-Host "    If you have a Supabase project, enter the keys below (or press Enter to deploy in local-auth demo mode):" -ForegroundColor Yellow
    if (-not $SupabaseUrl) {
        $SupabaseUrl = Read-Host "Supabase Project URL (e.g. https://xyz.supabase.co)"
    }
    if (-not $SupabaseAnonKey -and $SupabaseUrl) {
        $SupabaseAnonKey = Read-Host "Supabase Anon Key"
    }
}

if ($SupabaseUrl) {
    Write-Host "[OK] Supabase configured: $SupabaseUrl" -ForegroundColor Green
} else {
    Write-Host "[i] Continuing in standalone demo mode (Supabase can be added anytime later)." -ForegroundColor DarkGray
}

# 3. Enable Required Google Cloud Services
Write-Host ""
Write-Host "--> Enabling required Google Cloud APIs (Cloud Run, Cloud Build, Artifact Registry)..." -ForegroundColor Cyan
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project $ProjectId

# 4. Build Container Image with Google Cloud Build
$ImageTag = "gcr.io/$ProjectId/${ServiceName}:latest"
Write-Host ""
Write-Host "--> Building container on Cloud Build ($ImageTag)..." -ForegroundColor Cyan

$buildSuccess = $false
try {
    gcloud builds submit `
        --config="$PSScriptRoot\cloudbuild.yaml" `
        --substitutions="_SUPABASE_URL=$SupabaseUrl,_SUPABASE_ANON_KEY=$SupabaseAnonKey,_IMAGE_TAG=$ImageTag" `
        --project $ProjectId `
        $PSScriptRoot
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
Write-Host "--> Deploying service to Google Cloud Run..." -ForegroundColor Cyan

$envList = @()
if ($SupabaseUrl) {
    $envList += "VITE_SUPABASE_URL=$SupabaseUrl"
}
if ($SupabaseAnonKey) {
    $envList += "VITE_SUPABASE_ANON_KEY=$SupabaseAnonKey"
}

if ($envList.Count -gt 0) {
    $envArg = ($envList -join ",")
    gcloud run deploy $ServiceName `
        --image $ImageTag `
        --region $Region `
        --project $ProjectId `
        --platform managed `
        --allow-unauthenticated `
        --min-instances 0 `
        --max-instances 3 `
        --memory 512Mi `
        --set-env-vars $envArg
} else {
    gcloud run deploy $ServiceName `
        --image $ImageTag `
        --region $Region `
        --project $ProjectId `
        --platform managed `
        --allow-unauthenticated `
        --min-instances 0 `
        --max-instances 3 `
        --memory 512Mi
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Cloud Run deployment failed." -ForegroundColor Red
    exit 1
}

# 6. Retrieve Service URL
$ServiceUrl = (gcloud run services describe $ServiceName --region $Region --project $ProjectId --format "value(status.url)")

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  SUCCESSFULLY DEPLOYED TO GOOGLE CLOUD RUN!             " -ForegroundColor Green
Write-Host "  Public Live URL: $ServiceUrl" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green
