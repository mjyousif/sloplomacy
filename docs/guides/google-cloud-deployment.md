# Google Cloud Serverless Deployment Blueprint (Cloud Run + Supabase)

This guide outlines how to deploy the **Diplomacy 1901 Tactical Engine & Multiplayer Chancellery** using your **Google Cloud Platform (GCP) credits** with a true **scale-to-zero serverless architecture**, paired with **Supabase** (Free Tier) for Authentication and PostgreSQL persistence.

---

## 1. Why Google Cloud Run + Supabase?

| Layer | Technology | Billing / Free Tier Behavior |
| :--- | :--- | :--- |
| **Authentication** | **Supabase Auth** | **Free up to 50,000 Monthly Active Users (MAU)**. Handles Email/Password, Magic Links, Google/Discord OAuth, and Passkeys. |
| **Database** | **Supabase PostgreSQL** | **Free 500 MB database** (no credit card required). Avoids Google Cloud SQL's ~$10–$30/month minimum always-on instance cost. |
| **Backend + Frontend** | **Google Cloud Run** | **True Scale-to-Zero Serverless**. Scales down to `0` instances when nobody is playing ($0 idle cost). Includes a generous monthly free tier (2 million requests/month free) and draws from your GCP credits only on active CPU seconds. |

---

## 2. Setting Up Your Supabase Project (Local & Cloud)

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard) and click **New Project**.
2. Once provisioned, navigate to **Project Settings → API** and copy:
   - **Project URL** (`https://<project-ref>.supabase.co`)
   - **Anon / Public Key** (`eyJ...`)
3. For local development, create `frontend/.env` (copied from `frontend/.env.example`):
   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```
4. Restart the frontend dev server (`.\start.ps1`). The Auth Modal will automatically switch from `⚡ Local Dev Auth Mode` to `● Connected to Supabase Auth`.

### Optional OAuth Providers (Google / Discord)
In the Supabase Dashboard under **Authentication → Providers**:
- Enable **Google** or **Discord** to activate the 1-click social login buttons in `AuthModal.tsx`.

---

## 3. Unified Single-Container Serverless Deployment (Cloud Run)

The simplest, lowest-cost way to host both FastAPI and React on Google Cloud Run is to serve the compiled Vite static bundle (`frontend/dist`) directly from FastAPI. This eliminates CORS issues and requires only **one** serverless service.

### Reference `Dockerfile` (Place in project root when ready to deploy)

```dockerfile
# Stage 1: Build React/Vite Frontend
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# Pass Supabase build-time env vars
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

# Stage 2: Python FastAPI Runtime
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist ./static

# Cloud Run injects the PORT environment variable (default 8080)
ENV PORT=8080
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
```

### Deploy Command with `gcloud` CLI

```bash
gcloud run deploy diplomacy-1901 \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 3 \
  --memory 512Mi
```

* `--min-instances 0`: Ensures the container scales down to 0 when idle so your GCP credits are never drained overnight.
* `--max-instances 3`: Caps maximum scaling to prevent unexpected bill spikes.
