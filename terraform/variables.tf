variable "project_id" {
  description = "The Google Cloud Platform (GCP) Project ID"
  type        = string
}

variable "region" {
  description = "The GCP Region for Cloud Run & Artifact Registry"
  type        = string
  default     = "us-central1"
}

variable "service_name" {
  description = "Cloud Run service name"
  type        = string
  default     = "diplomacy-1901"
}

variable "artifact_repository_id" {
  description = "Artifact Registry repository ID"
  type        = string
  default     = "diplomacy-repo"
}

variable "container_image" {
  description = "Full container image URL. If left blank, defaults to the Artifact Registry repository path"
  type        = string
  default     = ""
}

variable "supabase_url" {
  description = "Supabase project URL (https://<project-ref>.supabase.co)"
  type        = string
  default     = ""
}

variable "supabase_anon_key" {
  description = "Supabase anon/public API key"
  type        = string
  default     = ""
  sensitive   = true
}

variable "supabase_service_role_key" {
  description = "Supabase service_role API key for authoritative backend persistence"
  type        = string
  default     = ""
  sensitive   = true
}

variable "supabase_jwt_secret" {
  description = "Supabase JWT Secret for cryptographic admin authorization"
  type        = string
  default     = ""
  sensitive   = true
}
