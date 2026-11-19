output "service_url" {
  description = "The live public HTTPS URL of the deployed Cloud Run service"
  value       = google_cloud_run_v2_service.diplomacy_service.uri
}

output "artifact_registry_repo" {
  description = "Artifact Registry Docker repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_repository_id}"
}

output "dashboard_api_endpoints_id" {
  description = "Google Cloud Monitoring Dashboard resource ID for API Endpoint Performance"
  value       = google_monitoring_dashboard.api_endpoint_performance.id
}

output "dashboard_cloud_run_id" {
  description = "Google Cloud Monitoring Dashboard resource ID for Cloud Run Infrastructure & Scale-to-Zero"
  value       = google_monitoring_dashboard.cloud_run_infrastructure.id
}

output "dashboard_engine_supabase_id" {
  description = "Google Cloud Monitoring Dashboard resource ID for Game Engine & Supabase Persistence"
  value       = google_monitoring_dashboard.engine_and_supabase.id
}
