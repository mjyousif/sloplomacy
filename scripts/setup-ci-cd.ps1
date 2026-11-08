<#
.SYNOPSIS
  Helper script to configure GCP IAM permissions and generate credentials for GitHub Actions Auto-Deployment.
.DESCRIPTION
  Creates a dedicated Service Account ('github-deployer'), grants the minimum required
  roles for Cloud Build & Cloud Run, and exports a Service Account Key JSON to add to GitHub Secrets.
#>

param(
    [string]$ProjectId = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Sloplomacy 1901 - GitHub Actions CI/CD GCP Setup        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Resolve Project ID
$detectedProject = (gcloud config get-value project 2>$null).Trim()
if (-not $ProjectId) {
    if ($detectedProject) {
        $confirm = Read-Host "Detected active GCP project '$detectedProject'. Use this project? (Y/n or enter new ID)"
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

# 2. Enable Required APIs
Write-Host ""
Write-Host "--> Enabling required APIs (Cloud Run, Cloud Build, Artifact Registry, IAM)..." -ForegroundColor Cyan
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com iam.googleapis.com --project $ProjectId

Write-Host ""
Write-Host "--> Ensuring Artifact Registry repository 'diplomacy-repo' exists..." -ForegroundColor Cyan
& gcloud artifacts repositories describe diplomacy-repo --location=us-central1 --project=$ProjectId 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating Artifact Registry repository 'diplomacy-repo'..." -ForegroundColor Yellow
    & gcloud artifacts repositories create diplomacy-repo `
        --repository-format=docker `
        --location=us-central1 `
        --description="Docker repository for Sloplomacy 1901" `
        --project=$ProjectId
}

# 3. Create Service Account
$SaName = "github-deployer"
$SaEmail = "$SaName@$ProjectId.iam.gserviceaccount.com"

Write-Host ""
Write-Host "--> Checking Service Account '$SaEmail'..." -ForegroundColor Cyan

$existingSa = (gcloud iam service-accounts list --filter="email:$SaEmail" --format="value(email)" --project $ProjectId 2>$null)
if (-not $existingSa) {
    Write-Host "Creating service account '$SaName'..." -ForegroundColor DarkGray
    gcloud iam service-accounts create $SaName `
        --display-name="GitHub Actions Cloud Run Deployer" `
        --project=$ProjectId
    Write-Host "[OK] Created Service Account: $SaEmail" -ForegroundColor Green
} else {
    Write-Host "[OK] Service account '$SaEmail' already exists." -ForegroundColor Green
}

# 4. Grant Required Roles
Write-Host ""
Write-Host "--> Granting required IAM roles..." -ForegroundColor Cyan

$roles = @(
    "roles/run.admin",
    "roles/iam.serviceAccountUser",
    "roles/cloudbuild.builds.editor",
    "roles/storage.admin",
    "roles/artifactregistry.writer"
)

foreach ($role in $roles) {
    Write-Host "  + Assigning $role..." -ForegroundColor DarkGray
    gcloud projects add-iam-policy-binding $ProjectId `
        --member="serviceAccount:$SaEmail" `
        --role="$role" `
        --condition=None `
        --quiet > $null
}
Write-Host "[OK] IAM roles granted successfully." -ForegroundColor Green

# 5. Generate Service Account Key JSON
$KeyPath = Join-Path $RepoRoot "gcp-key.json"
Write-Host ""
Write-Host "--> Generating service account key ($KeyPath)..." -ForegroundColor Cyan
gcloud iam service-accounts keys create "$KeyPath" `
    --iam-account="$SaEmail" `
    --project=$ProjectId

if (Test-Path $KeyPath) {
    $keyContent = Get-Content $KeyPath -Raw
    try {
        Set-Clipboard -Value $keyContent
        $copied = $true
    } catch {
        $copied = $false
    }

    # Detect Supabase env vars if present
    $supabaseUrl = ""
    $supabaseKey = ""
    $envPath = Join-Path $RepoRoot "frontend\.env"
    if (Test-Path $envPath) {
        Get-Content $envPath | ForEach-Object {
            $line = $_.Trim()
            if ($line.StartsWith("VITE_SUPABASE_URL=")) { $supabaseUrl = $line.Split("=", 2)[1].Trim('"'' ') }
            if ($line.StartsWith("VITE_SUPABASE_ANON_KEY=")) { $supabaseKey = $line.Split("=", 2)[1].Trim('"'' ') }
        }
    }

    $displayUrl = if ($supabaseUrl) { $supabaseUrl } else { "https://your-project.supabase.co" }
    $displayKey = if ($supabaseKey) { $supabaseKey } else { "your-supabase-anon-key" }

    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "  SETUP COMPLETE! Next Steps:" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "Go to your GitHub Repository: Settings > Secrets and variables > Actions"
    Write-Host "Add the following repository secrets:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. GCP_PROJECT_ID" -ForegroundColor Yellow
    Write-Host "   Value: $ProjectId"
    Write-Host ""
    Write-Host "2. GCP_SA_KEY" -ForegroundColor Yellow
    if ($copied) {
        Write-Host "   Value: (The full JSON key has been COPIED to your clipboard! Paste directly)"
    } else {
        Write-Host "   Value: (Contents of file: $KeyPath)"
    }
    Write-Host ""
    Write-Host "3. VITE_SUPABASE_URL (Optional if using Supabase)" -ForegroundColor Yellow
    Write-Host "   Value: $displayUrl"
    Write-Host ""
    Write-Host "4. VITE_SUPABASE_ANON_KEY (Optional if using Supabase)" -ForegroundColor Yellow
    Write-Host "   Value: $displayKey"
    Write-Host ""
    Write-Host "5. GCP_REGION (Optional, defaults to us-central1)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "[!] Note: Remember to delete '$KeyPath' after saving your secret to GitHub." -ForegroundColor Red
}
