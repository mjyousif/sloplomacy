output "service_url" {
  description = "The live public HTTPS URL of the deployed Cloud Run service"
  value       = google_cloud_run_v2_service.diplomacy_service.uri
}

output "artifact_registry_repo" {
  description = "Artifact Registry Docker repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_repository_id}"
}
