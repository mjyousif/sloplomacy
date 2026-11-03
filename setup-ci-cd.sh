#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "  Sloplomacy 1901 - GitHub Actions CI/CD GCP Setup        "
echo "=========================================================="

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null || true)}"

if [ -z "$PROJECT_ID" ]; then
  read -rp "Enter your Google Cloud Project ID: " PROJECT_ID
fi

if [ -z "$PROJECT_ID" ]; then
  echo "Error: No active GCP project provided."
  exit 1
fi

echo "[✓] Target GCP Project: $PROJECT_ID"

echo "--> Enabling required APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com iam.googleapis.com --project "$PROJECT_ID"

SA_NAME="github-deployer"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "--> Creating/verifying Service Account '$SA_EMAIL'..."
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="GitHub Actions Cloud Run Deployer" \
    --project="$PROJECT_ID"
  echo "[✓] Created service account: $SA_EMAIL"
else
  echo "[✓] Service account '$SA_EMAIL' exists."
fi

echo "--> Assigning IAM roles..."
ROLES=(
  "roles/run.admin"
  "roles/iam.serviceAccountUser"
  "roles/cloudbuild.builds.editor"
  "roles/storage.admin"
  "roles/artifactregistry.writer"
)

for role in "${ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
done

KEY_PATH="gcp-key.json"
echo "--> Generating service account key: $KEY_PATH..."
gcloud iam service-accounts keys create "$KEY_PATH" \
  --iam-account="$SA_EMAIL" \
  --project="$PROJECT_ID"

SUPABASE_URL=""
SUPABASE_KEY=""
if [ -f "frontend/.env" ]; then
  SUPABASE_URL=$(grep -E '^VITE_SUPABASE_URL=' frontend/.env | cut -d '=' -f2- | tr -d ' "' || true)
  SUPABASE_KEY=$(grep -E '^VITE_SUPABASE_ANON_KEY=' frontend/.env | cut -d '=' -f2- | tr -d ' "' || true)
fi

echo ""
echo "=========================================================="
echo "  SETUP COMPLETE! Next Steps:"
echo "=========================================================="
echo "In GitHub, go to: Settings > Secrets and variables > Actions"
echo "Add the following Repository Secrets:"
echo ""
echo "1. GCP_PROJECT_ID"
echo "   Value: $PROJECT_ID"
echo ""
echo "2. GCP_SA_KEY"
echo "   Value: (Copy the contents of $KEY_PATH)"
echo ""
echo "3. VITE_SUPABASE_URL (Optional if using Supabase)"
echo "   Value: ${SUPABASE_URL:-https://your-project.supabase.co}"
echo ""
echo "4. VITE_SUPABASE_ANON_KEY (Optional if using Supabase)"
echo "   Value: ${SUPABASE_KEY:-your-supabase-anon-key}"
echo ""
echo "5. GCP_REGION (Optional, defaults to us-central1)"
echo ""
echo "[!] Note: Remember to delete '$KEY_PATH' once pasted into GitHub Secrets!"
