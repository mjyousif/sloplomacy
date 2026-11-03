#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
cd "$REPO_ROOT"

echo "=========================================================="
echo "  Sloplomacy 1901 - Google Cloud Run Automated Deployer   "
echo "=========================================================="

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${2:-us-central1}"
SERVICE_NAME="${3:-diplomacy-1901}"
IMAGE_TAG="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: No active GCP project configured. Run 'gcloud config set project <PROJECT_ID>'."
  exit 1
fi

echo "[✓] Target GCP Project: $PROJECT_ID"
echo "[✓] Target GCP Region : $REGION"

SUPABASE_URL=""
SUPABASE_ANON_KEY=""

if [ -f "frontend/.env" ]; then
  SUPABASE_URL=$(grep -E '^VITE_SUPABASE_URL=' frontend/.env | cut -d '=' -f2- | tr -d ' "' || true)
  SUPABASE_ANON_KEY=$(grep -E '^VITE_SUPABASE_ANON_KEY=' frontend/.env | cut -d '=' -f2- | tr -d ' "' || true)
fi

echo "--> Enabling Google Cloud APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project "$PROJECT_ID"

echo "--> Building container with Google Cloud Build..."
gcloud builds submit --tag "$IMAGE_TAG" --project "$PROJECT_ID" .

echo "--> Deploying to Google Cloud Run (Scale-to-zero)..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_TAG" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 3 \
  --memory 512Mi \
  --port 8080 \
  --set-env-vars "VITE_SUPABASE_URL=${SUPABASE_URL},VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}"

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$PROJECT_ID" --format "value(status.url)")

echo "=========================================================="
echo "  DEPLOYMENT COMPLETE!"
echo "=========================================================="
echo "Service URL: $SERVICE_URL"
