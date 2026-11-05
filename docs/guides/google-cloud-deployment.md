# Google Cloud Serverless Deployment Blueprint (Cloud Run + Supabase)

This guide outlines how to deploy the **Diplomacy 1901 Tactical Engine & Multiplayer Chancellery** using **Google Cloud Platform (GCP)** with a true **scale-to-zero serverless architecture**, paired with **Supabase** for Authentication and PostgreSQL persistence.

---

## 1. Architecture & Cost Optimization

| Layer | Technology | Billing & Free Tier Behavior |
| :--- | :--- | :--- |
| **Authentication** | **Supabase Auth** | **Free up to 50,000 Monthly Active Users (MAU)**. Handles Email/Password, Google/Discord OAuth, and Magic Links. |
| **Database** | **Supabase PostgreSQL** | **Free 500 MB database** with Row-Level Security (RLS). Avoids Cloud SQL's ~$10–$30/month minimum always-on cost. |
| **Backend + Frontend** | **Google Cloud Run** | **True Scale-to-Zero Serverless**. Scales down to `0` instances when idle ($0 idle cost). Includes 2 million free requests/month. |
| **Container Pipeline**| **Google Cloud Build** | Builds multi-stage Docker container directly on GCP via `cloudbuild.yaml`. |
| **Infrastructure as Code**| **Terraform** | Declaratively provisions Cloud Run v2 services and Artifact Registry Docker repositories. |

---

## 2. Setting Up Supabase & Database Migrations

1. Create a project at [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Under **Project Settings → API**, copy:
   - **Project URL** (`https://<project-ref>.supabase.co`)
   - **Anon Public Key** (`eyJ...`)
3. Execute database migrations:
   - Navigate to the Supabase **SQL Editor**.
   - Paste and run the schema file located at [`supabase/migrations/20261103000000_init_schema.sql`](../../supabase/migrations/20261103000000_init_schema.sql).
   - This provisions the `profiles` and `multiplayer_games` tables along with Row-Level Security (RLS) policies and user signup triggers.
4. (Optional) In **Authentication → Providers**, enable **Google** or **Discord** OAuth for 1-click login.

---

## 3. Automated One-Click Deployment Scripts

The repository includes native automated deployment scripts that handle building, pushing, and deploying to Cloud Run with scale-to-zero configuration:

### Windows (PowerShell)
```powershell
.\scripts\deploy.ps1 -ProjectId "your-gcp-project-id" -Region "us-central1"
```
Or interactively provide Supabase secrets:
```powershell
.\scripts\deploy.ps1 -ProjectId "your-gcp-project-id" -SupabaseUrl "https://<ref>.supabase.co" -SupabaseAnonKey "eyJ..."
```

### macOS / Linux / WSL (Bash)
```bash
./scripts/deploy.sh
```

### What the Automated Scripts Do:
1. Validates that `gcloud` is authenticated and configured.
2. Ensures required GCP APIs are enabled (`run.googleapis.com`, `cloudbuild.googleapis.com`, `artifactregistry.googleapis.com`).
3. Provisions an Artifact Registry repository (`sloplomacy-repo`) if it doesn't already exist.
4. Triggers **Google Cloud Build** using [`cloudbuild.yaml`](../../cloudbuild.yaml) to build the multi-stage [`Dockerfile`](../../Dockerfile).
5. Deploys the image to **Google Cloud Run** with `--min-instances 0` (scale-to-zero) and `--max-instances 3` (budget protection).

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
- [`terraform/main.tf`](../../terraform/main.tf): Enables Cloud APIs, provisions Artifact Registry Docker repository, and configures Cloud Run v2 service with scale-to-zero settings.
- [`terraform/variables.tf`](../../terraform/variables.tf): Configurable parameters (`project_id`, `region`, `service_name`, container image, environment variables).
- [`terraform/outputs.tf`](../../terraform/outputs.tf): Emits the live Cloud Run service URL and Artifact Registry endpoint.

---

## 5. Automated CI/CD Deployment (GitHub Actions)

The repository features an automated GitHub Actions pipeline in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) that triggers on every push/merge to `main` (or `master`) and supports manual triggering via `workflow_dispatch`.

### Pipeline Execution Flow:
1. **Quality Gates**: Runs backend unit tests (`pytest`) and frontend tests & production build check (`vitest`, `npm run build`).
2. **Conditional Deployment**: Only runs when commits hit `main` (not unmerged PRs) and both test suites succeed.
3. **Cloud Build & Cloud Run**: Builds the container on GCP Cloud Build with production environment arguments and deploys a new revision to Google Cloud Run.
4. **Summary**: Posts the verified public live URL to the GitHub Actions job summary.
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
- `GCP_REGION`: *(Optional, defaults to `us-central1`)*

---

## 6. Single-Container Multi-Stage Dockerfile

The root [`Dockerfile`](../../Dockerfile) uses a multi-stage build:
1. **Stage 1 (Frontend Builder)**: Node.js 20 builds the React 19 application via `npm run build`, baking in Supabase environment arguments (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
2. **Stage 2 (FastAPI Runner)**: Python 3.11-slim installs `backend/requirements.txt`, copies backend Python modules, mounts the compiled React bundle into `./static`, and launches Uvicorn on `${PORT}`.
