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
ARTIFACT_REPO="${4:-diplomacy-repo}"
IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/${SERVICE_NAME}:latest"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: No active GCP project configured. Run 'gcloud config set project <PROJECT_ID>'."
  exit 1
fi

echo "[✓] Target GCP Project: $PROJECT_ID"
echo "[✓] Target GCP Region : $REGION"

SUPABASE_URL=""
SUPABASE_ANON_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""
SUPABASE_JWT_SECRET=""

if [ -f "frontend/.env" ]; then
  SUPABASE_URL=$(grep -E '^(VITE_)?SUPABASE_URL=' frontend/.env | head -n1 | cut -d '=' -f2- | tr -d ' "' || true)
  SUPABASE_ANON_KEY=$(grep -E '^(VITE_)?SUPABASE_ANON_KEY=' frontend/.env | head -n1 | cut -d '=' -f2- | tr -d ' "' || true)
  SUPABASE_SERVICE_ROLE_KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' frontend/.env | head -n1 | cut -d '=' -f2- | tr -d ' "' || true)
  SUPABASE_JWT_SECRET=$(grep -E '^SUPABASE_JWT_SECRET=' frontend/.env | head -n1 | cut -d '=' -f2- | tr -d ' "' || true)
fi

# The backend persists games only with the service role key. RLS gives the anon key zero rows,
# so falling back to it would make every saved game look deleted.
if [ -n "$SUPABASE_URL" ] && [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "[!] Warning: SUPABASE_SERVICE_ROLE_KEY is not in frontend/.env. Game persistence stays off unless the service already has it."
fi

# --update-env-vars keeps variables set by hand on the service, and only values that are present
# are sent, so a missing value never blanks one that is already set.
ENV_VARS=""
add_env() {
  if [ -n "$2" ]; then
    ENV_VARS="${ENV_VARS:+${ENV_VARS},}$1=$2"
  fi
}
add_env VITE_SUPABASE_URL "$SUPABASE_URL"
add_env VITE_SUPABASE_ANON_KEY "$SUPABASE_ANON_KEY"
add_env SUPABASE_URL "$SUPABASE_URL"
add_env SUPABASE_KEY "$SUPABASE_SERVICE_ROLE_KEY"
add_env SUPABASE_SERVICE_ROLE_KEY "$SUPABASE_SERVICE_ROLE_KEY"
add_env SUPABASE_JWT_SECRET "$SUPABASE_JWT_SECRET"
ENV_FLAGS=()
if [ -n "$ENV_VARS" ]; then
  ENV_FLAGS=(--update-env-vars "$ENV_VARS")
fi

echo "--> Enabling Google Cloud APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project "$PROJECT_ID"

echo "--> Ensuring Artifact Registry repository '$ARTIFACT_REPO' exists..."
if ! gcloud artifacts repositories describe "$ARTIFACT_REPO" --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  echo "Creating Artifact Registry repository '$ARTIFACT_REPO'..."
  gcloud artifacts repositories create "$ARTIFACT_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Docker repository for Sloplomacy 1901" \
    --project="$PROJECT_ID"
fi

echo "--> Building container with Google Cloud Build..."
SHORT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "dev")
gcloud builds submit --config=cloudbuild.yaml --substitutions="_SUPABASE_URL=${SUPABASE_URL},_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY},_SHORT_SHA=${SHORT_SHA},_IMAGE_TAG=${IMAGE_TAG},_REGION=${REGION}" --project "$PROJECT_ID" .

# --max-instances 1 is required: games live in one process.
# --timeout 3600 lets a WebSocket stay open for an hour instead of 5 minutes.
# --cpu-throttling ensures compute charges apply only during active request processing.
# --cpu-boost temporarily allocates extra CPU during cold-start boot.
echo "--> Deploying to Google Cloud Run (Scale-to-zero with Supabase Persistence)..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_TAG" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 1 \
  --cpu 1 \
  --memory 512Mi \
  --cpu-throttling \
  --cpu-boost \
  --port 8080 \
  --timeout 3600 \
  ${ENV_FLAGS[@]+"${ENV_FLAGS[@]}"}

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$PROJECT_ID" --format "value(status.url)")

echo "=========================================================="
echo "  DEPLOYMENT COMPLETE!"
echo "=========================================================="
echo "Service URL: $SERVICE_URL"
