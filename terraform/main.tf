terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# 1. Enable required Google Cloud APIs
resource "google_project_service" "cloud_run" {
  service                    = "run.googleapis.com"
  disable_on_destroy         = false
  disable_dependent_services = false
}

resource "google_project_service" "artifact_registry" {
  service                    = "artifactregistry.googleapis.com"
  disable_on_destroy         = false
  disable_dependent_services = false
}

# 2. Artifact Registry Docker Repository
# Nothing pushes here yet: the CI workflow and scripts/deploy.* push to gcr.io/<project>/<service>,
# which is also the default image below. Set container_image to use an image in this repository.
resource "google_artifact_registry_repository" "app_repo" {
  depends_on    = [google_project_service.artifact_registry]
  location      = var.region
  repository_id = var.artifact_repository_id
  description   = "Docker repository for Sloplomacy 1901 serverless container"
  format        = "DOCKER"
}

# 3. Google Cloud Run Service (Serverless, True Scale-to-Zero)
locals {
  # The same path the CI workflow and scripts/deploy.* push to.
  default_image = "gcr.io/${var.project_id}/${var.service_name}:latest"
}

resource "google_cloud_run_v2_service" "diplomacy_service" {
  name     = var.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  depends_on = [google_project_service.cloud_run]

  template {
    # WebSockets count as one request, so this is how long one can stay open (the default is 300s).
    timeout = "3600s"

    scaling {
      min_instance_count = 0  # Scales to zero when idle ($0 idle cost)
      max_instance_count = 1  # Games live in this one process: a second instance would overwrite them
    }

    containers {
      image = var.container_image != "" ? var.container_image : local.default_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true # Only pay for CPU during active HTTP requests
      }

      # Terraform owns this whole list: a variable set by hand in the console is removed on the
      # next apply, so put every value here. PORT is left out because Cloud Run reserves it and
      # sets it from the container port. An empty value is treated as unset by the backend.

      env {
        name  = "VITE_SUPABASE_URL"
        value = var.supabase_url
      }

      env {
        name  = "VITE_SUPABASE_ANON_KEY"
        value = var.supabase_anon_key
      }

      env {
        name  = "SUPABASE_URL"
        value = var.supabase_url
      }

      # Only ever the service role key. Without it persistence stays off: RLS gives the anon key
      # zero rows, which would make every saved game look deleted.
      env {
        name  = "SUPABASE_KEY"
        value = var.supabase_service_role_key
      }

      env {
        name  = "SUPABASE_SERVICE_ROLE_KEY"
        value = var.supabase_service_role_key
      }

      env {
        name  = "SUPABASE_JWT_SECRET"
        value = var.supabase_jwt_secret
      }
    }
  }
}

# 4. Public Access (Allow unauthenticated web access to the game)
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.diplomacy_service.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
