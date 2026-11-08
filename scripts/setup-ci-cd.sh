#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
cd "$REPO_ROOT"

echo "=========================================================="
echo "  Sloplomacy 1901 - GitHub Actions CI/CD GCP Setup        "
echo "=========================================================="

# 1. Resolve GCP Project ID
PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null)}"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: No active GCP project configured. Run 'gcloud config set project <PROJECT_ID>'."
  exit 1
fi

echo "[✓] Target GCP Project: $PROJECT_ID"

# 2. Enable Required APIs & Prepare Artifact Registry
echo ""
echo "--> Enabling required APIs (Cloud Run, Cloud Build, Artifact Registry, IAM)..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com iam.googleapis.com --project "$PROJECT_ID"

echo "--> Ensuring Artifact Registry repository 'diplomacy-repo' exists..."
if ! gcloud artifacts repositories describe diplomacy-repo --location="us-central1" --project="$PROJECT_ID" &>/dev/null; then
  echo "Creating Artifact Registry repository 'diplomacy-repo'..."
  gcloud artifacts repositories create diplomacy-repo \
    --repository-format=docker \
    --location="us-central1" \
    --description="Docker repository for Sloplomacy 1901" \
    --project="$PROJECT_ID"
fi

# 3. Create Service Account
SA_NAME="github-deployer"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo ""
echo "--> Checking Service Account '$SA_EMAIL'..."
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID" &>/dev/null; then
  echo "Creating service account '$SA_NAME'..."
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="GitHub Actions Cloud Run Deployer" \
    --project="$PROJECT_ID"
  echo "[✓] Created Service Account: $SA_EMAIL"
else
  echo "[✓] Service account '$SA_EMAIL' already exists."
fi

# 4. Grant Required Roles
echo ""
echo "--> Granting required IAM roles..."
ROLES=(
  "roles/run.admin"
  "roles/iam.serviceAccountUser"
  "roles/cloudbuild.builds.editor"
  "roles/storage.admin"
  "roles/artifactregistry.writer"
)

for ROLE in "${ROLES[@]}"; do
  echo "  + Assigning $ROLE..."
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$ROLE" \
    --condition=None \
    --quiet >/dev/null
done
echo "[✓] IAM roles granted successfully."

# 5. Generate Service Account Key JSON
KEY_PATH="$REPO_ROOT/gcp-key.json"
echo ""
echo "--> Generating service account key ($KEY_PATH)..."
gcloud iam service-accounts keys create "$KEY_PATH" \
  --iam-account="$SA_EMAIL" \
  --project="$PROJECT_ID"

SUPABASE_URL=""
SUPABASE_ANON_KEY=""

if [ -f "frontend/.env" ]; then
  SUPABASE_URL=$(grep -E '^VITE_SUPABASE_URL=' frontend/.env | cut -d '=' -f2- | tr -d ' "' || true)
  SUPABASE_ANON_KEY=$(grep -E '^VITE_SUPABASE_ANON_KEY=' frontend/.env | cut -d '=' -f2- | tr -d ' "' || true)
fi

echo ""
echo "=========================================================="
echo "  SETUP COMPLETE! Next Steps:"
echo "=========================================================="
echo "Go to your GitHub Repository: Settings > Secrets and variables > Actions"
echo "Add the following repository secrets:"
echo ""
echo "1. GCP_PROJECT_ID: $PROJECT_ID"
echo "2. GCP_SA_KEY: (Contents of file: $KEY_PATH)"
echo "3. VITE_SUPABASE_URL: ${SUPABASE_URL:-https://your-project.supabase.co}"
echo "4. VITE_SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY:-your-supabase-anon-key}"
echo "5. GCP_REGION: (Optional, defaults to us-central1)"
echo ""
echo "Note: Remember to delete '$KEY_PATH' after saving your secret to GitHub."
