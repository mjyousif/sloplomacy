# Google Cloud Serverless Deployment Blueprint (Cloud Run + Supabase)

This guide outlines how to deploy the **Diplomacy 1901 Tactical Engine & Multiplayer Chancellery** using **Google Cloud Platform (GCP)** with a true **scale-to-zero serverless architecture**, paired with **Supabase** for Authentication, cryptographically authorized host controls, and persistent PostgreSQL state tracking.

---

## 1. Architectural Highlights & Zero-Cost Tier

| Component | Service | Cost Profile & Configuration |
| :--- | :--- | :--- |
| **Compute Runtime** | **Google Cloud Run** | **Scale-to-zero ($0 idle cost)**. Uses Google Cloud Run's free tier (2M requests/month, 360,000 vCPU-seconds, 360,000 GiB-seconds). Configured with `--min-instances 0`, `--max-instances 1` (games live in one process), `--cpu-throttling` (CPU charged only during active request processing), and `--cpu-boost` (startup CPU boost to slash cold-start delays). Includes client-side background idle disconnection to prevent abandoned browser tabs from keeping instances awake. |
| **Container Registry**| **GCP Artifact Registry** (`docker.pkg.dev` paths) | Docker repository (`diplomacy-repo`) with automated cleanup policies keeping the 5 most recent versions and deleting untagged layers to prevent storage billing creep. |
| **Adjudication Engine**| **FastAPI + DATC Adjudicator** | Runs inside Cloud Run container. Adjudicates official DATC turns deterministically in under 5ms, with GZip compression and immutable asset cache headers to minimize egress bandwidth. |
| **Authentication** | **Supabase Auth** | **Free up to 50,000 Monthly Active Users (MAU)**. Handles Email/Password, Google/Discord OAuth, Magic Links, and ES256 / HS256 JWT validation. |
| **Database & Persistence** | **Supabase PostgreSQL** | **Free 500 MB database** with Row-Level Security (RLS) and JSONB game state tracking. Automatically persists match state and turn histories across container cold starts. |
| **Infrastructure as Code**| **Terraform** | Declaratively provisions Cloud Run v2 services with startup CPU boost and Artifact Registry repositories with automated lifecycle cleanup policies. |

---

## 2. Setting Up Supabase & Database Migrations

1. Create a project at [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Under **Project Settings → API**, copy:
   - **Project URL** (`https://<project-ref>.supabase.co`)
   - **Anon Public Key** (`eyJ...`)
   - **service_role Key** (`eyJ...` under Project API Keys, for server-side persistence)
   - **JWT Secret** (under JWT Settings, if using HS256)
3. Execute database migrations in order:
   - The CI deploy job runs every file in [`supabase/migrations/`](../../supabase/migrations/) when the `DATABASE_URL` secret is set (see section 5). To run them by hand, use the same command:
     ```bash
     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
       $(ls -1 supabase/migrations/*.sql | sort | sed 's/^/-f /')
     ```
     Or paste each file into the Supabase **SQL Editor**, oldest first.
   - Every file is safe to run again, and every run applies all of them. No file grants the anon key access to `multiplayer_games`, even partway through a run.
   - They provision the `profiles` and `multiplayer_games` tables with JSONB state tracking and auxiliary columns. On `multiplayer_games`, select, insert, update and delete are all `TO service_role` only. The anon and authenticated keys read no rows, and the browser reads games through the backend.
   - The `public.lobby_games` view lists public, non-sandbox games without passcodes or game state. It is owned by `postgres`, so it is not filtered by RLS, and the anon key can read it. The app does not use it.
4. (Optional) In **Authentication → Providers**, enable **Google** or **Discord** OAuth for 1-click login.

---

## 3. Automated One-Click Deployment Scripts

The repository includes native automated deployment scripts that handle building, pushing, and deploying to Cloud Run with scale-to-zero configuration and persistent state tracking:

### Windows (PowerShell)
```powershell
.\scripts\deploy.ps1 -ProjectId "your-gcp-project-id" -Region "us-central1"
```
Or interactively provide Supabase secrets:
```powershell
.\scripts\deploy.ps1 -ProjectId "your-gcp-project-id" -SupabaseUrl "https://<ref>.supabase.co" -SupabaseAnonKey "eyJ..." -SupabaseServiceRoleKey "eyJ..." -SupabaseJwtSecret "your-secret"
```

### macOS / Linux / WSL (Bash)
```bash
./scripts/deploy.sh
```

### What the Automated Scripts Do:
1. Validates that `gcloud` is authenticated and configured.
2. Ensures required GCP APIs are enabled (`run.googleapis.com`, `cloudbuild.googleapis.com`, `artifactregistry.googleapis.com`) and verifies the `diplomacy-repo` Artifact Registry repository exists.
3. Triggers **Google Cloud Build** using [`cloudbuild.yaml`](../../cloudbuild.yaml) to build the multi-stage [`Dockerfile`](../../Dockerfile) and push it to `${REGION}-docker.pkg.dev/<project>/diplomacy-repo/<service>:latest`.
4. Deploys the image to **Google Cloud Run** with `--min-instances 0` (scale-to-zero), `--max-instances 1` (games live in one process, protecting budget), `--cpu-throttling` (request-based billing), `--cpu-boost` (startup CPU acceleration), and `--timeout 3600` (WebSockets stay open for an hour).
5. Sets the Supabase variables with `--update-env-vars`. Variables you set by hand on the service are kept, and a value the script doesn't have is left as it is on the service instead of being blanked.

### Game Persistence Needs the Service Role Key
The backend saves games only with `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_KEY` holding the service role key). It never falls back to the anon key: RLS gives the anon key zero rows, so the lobby sync would take every saved game for deleted. With no service role key, or with a key that is the anon key, persistence stays off and the server logs an error once at the first database call. Games then live in memory only and are lost when the instance stops.

---

## 4. Infrastructure as Code (Terraform)

For reproducible IaC management, the `terraform/` directory contains complete HashiCorp Terraform definitions:

```bash
cd terraform

# Initialize Terraform providers
terraform init

# Plan provisioning with your GCP Project ID
terraform plan -var="project_id=your-gcp-project-id"

# Apply infrastructure
terraform apply -var="project_id=your-gcp-project-id"
```

### Terraform Manifests:
- [`terraform/main.tf`](../../terraform/main.tf): Enables Cloud APIs, provisions an Artifact Registry Docker repository with automated cleanup policies (keeping recent 5 versions and deleting untagged layers), and configures the Cloud Run v2 service with scale-to-zero, one instance, startup CPU boost, a 3600 s request timeout and persistence settings.
  - The image defaults to `${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_repository_id}/${var.service_name}:latest`, matching the CI workflow and `scripts/deploy.*`. Set `container_image` if deploying a custom tag.
  - Terraform owns the service's whole environment list: a variable set by hand in the console is removed on the next `terraform apply`. `PORT` is not set, because Cloud Run reserves it. `SUPABASE_KEY` is the service role key only.
- [`terraform/variables.tf`](../../terraform/variables.tf): Configurable parameters (`project_id`, `region`, `service_name`, container image, Supabase URL, anon key, service role key, JWT secret).
- [`terraform/outputs.tf`](../../terraform/outputs.tf): Emits the live Cloud Run service URL and Artifact Registry endpoint.

---

## 5. Automated CI/CD Deployment (GitHub Actions)

The repository features an automated GitHub Actions pipeline in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) that triggers on every push/merge to `main` (or `master`) and supports manual triggering via `workflow_dispatch`.

### Pipeline Execution Flow:
1. **Quality Gates**: Runs backend unit tests (`pytest`, Python 3.11) and frontend tests & production build check (`vitest`, `npm run build`, Node.js 22). Each job has a `timeout-minutes` limit, so a hung test fails the run instead of holding it for six hours.
2. **Conditional Deployment**: Only runs when commits hit `main` (not unmerged PRs) and both test suites succeed.
3. **Migrations**: When `DATABASE_URL` (or `SUPABASE_DB_URL`) is set, runs every migration with `psql -v ON_ERROR_STOP=1 --single-transaction`. A failing migration rolls back the whole run and stops the deploy. Without the secret the step is skipped.
4. **Direct Docker Build & Artifact Registry**: Builds the multi-stage container directly on GitHub Actions runners with Docker Buildx and GitHub Actions layer caching (`type=gha`), pushing directly to GCP Artifact Registry without consuming Google Cloud Build minutes or Cloud Storage staging quotas.
5. **Cloud Run Deployment**: Deploys a new revision to Google Cloud Run with `--update-env-vars`, `--cpu-throttling`, and `--cpu-boost`.
6. **Summary**: Posts the verified public live URL to the GitHub Actions job summary.
   - **Production Endpoint**: [https://diplomacy-1901-rrwl6tgtaa-uc.a.run.app](https://diplomacy-1901-rrwl6tgtaa-uc.a.run.app)

### One-Time CI/CD Setup:
Run the setup helper script to create the dedicated service account and export credentials:
```powershell
.\scripts\setup-ci-cd.ps1
```
*(Or on Linux/macOS: `./scripts/setup-ci-cd.sh`)*

Add the following **Repository Secrets** under **Settings > Secrets and variables > Actions**:
- `GCP_PROJECT_ID`: Your GCP project ID.
- `GCP_SA_KEY`: The JSON key generated by `setup-ci-cd` (automatically copied to clipboard).
- `VITE_SUPABASE_URL`: *(Optional)* Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: *(Optional)* Supabase anon public key.
- `SUPABASE_SERVICE_ROLE_KEY`: *(Optional)* Supabase service role key. Without it game persistence stays off.
- `DATABASE_URL` or `SUPABASE_DB_URL`: *(Optional)* Postgres connection string for running migrations. Use the IPv4 Connection Pooler URI (`aws-0-<region>.pooler.supabase.com:6543`), because GitHub Actions runners have no IPv6.
- `SUPABASE_JWT_SECRET`: *(Optional)* Supabase JWT secret for cryptographic admin token authorization.
- `GCP_REGION`: *(Optional, defaults to `us-central1`)*

---

## 6. Single-Container Multi-Stage Dockerfile

The root [`Dockerfile`](../../Dockerfile) uses a multi-stage build:
1. **Stage 1 (Frontend Builder)**: Node.js 22 builds the React 19 application via `npm run build`, baking in Supabase environment arguments (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
2. **Stage 2 (FastAPI Runner)**: Python 3.11-slim installs `backend/requirements-runtime.txt` (no test tools), copies the backend packages (`main.py`, `api/`, `engine/`, `storage/`, `security/`, etc.), mounts the compiled React bundle into `./static`, and launches Uvicorn on `${PORT}`.

The test suite (`backend/tests/`) is left out of the image by [`.dockerignore`](../../.dockerignore).
