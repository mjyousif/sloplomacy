# Log-based metrics derived from structured JSON telemetry emitted to stdout by backend/telemetry.py

locals {
  telemetry_base_filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.service_name}\""
}

# 1. API Request Count (grouped by normalized FastAPI route_key, endpoint, method, status_class, status_code)
resource "google_logging_metric" "diplomacy_api_request_count" {
  name        = "${var.service_name}_api_request_count"
  description = "Count of HTTP /api/* requests grouped by FastAPI route template and status"
  filter      = "${local.telemetry_base_filter} AND jsonPayload.event_type=\"api_request\""
  depends_on  = [google_project_service.logging, google_project_service.monitoring]

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "route_key"
      value_type  = "STRING"
      description = "HTTP method and parameterized FastAPI route template"
    }
    labels {
      key         = "endpoint"
      value_type  = "STRING"
      description = "Parameterized FastAPI route path"
    }
    labels {
      key         = "method"
      value_type  = "STRING"
      description = "HTTP request method"
    }
    labels {
      key         = "status_class"
      value_type  = "STRING"
      description = "HTTP status class (2xx, 4xx, 5xx)"
    }
    labels {
      key         = "status_code"
      value_type  = "STRING"
      description = "HTTP status code"
    }
  }

  label_extractors = {
    route_key    = "EXTRACT(jsonPayload.route_key)"
    endpoint     = "EXTRACT(jsonPayload.endpoint)"
    method       = "EXTRACT(jsonPayload.method)"
    status_class = "EXTRACT(jsonPayload.status_class)"
    status_code  = "EXTRACT(jsonPayload.status_code)"
  }
}

# 2. API Request Latency Distribution (ms) per FastAPI route template
resource "google_logging_metric" "diplomacy_api_request_latency_ms" {
  name            = "${var.service_name}_api_request_latency_ms"
  description     = "Latency distribution (ms) for HTTP /api/* requests by FastAPI route template"
  filter          = "${local.telemetry_base_filter} AND jsonPayload.event_type=\"api_request\""
  value_extractor = "EXTRACT(jsonPayload.latency_ms)"
  depends_on      = [google_project_service.logging, google_project_service.monitoring]

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "ms"

    labels {
      key         = "route_key"
      value_type  = "STRING"
      description = "HTTP method and parameterized FastAPI route template"
    }
    labels {
      key         = "endpoint"
      value_type  = "STRING"
      description = "Parameterized FastAPI route path"
    }
    labels {
      key         = "method"
      value_type  = "STRING"
      description = "HTTP request method"
    }
    labels {
      key         = "status_class"
      value_type  = "STRING"
      description = "HTTP status class (2xx, 4xx, 5xx)"
    }
  }

  label_extractors = {
    route_key    = "EXTRACT(jsonPayload.route_key)"
    endpoint     = "EXTRACT(jsonPayload.endpoint)"
    method       = "EXTRACT(jsonPayload.method)"
    status_class = "EXTRACT(jsonPayload.status_class)"
  }

  bucket_options {
    exponential_buckets {
      num_finite_buckets = 64
      growth_factor      = 1.25
      scale              = 0.5
    }
  }
}

# 3. DATC Adjudication Engine Execution Latency Distribution (ms) by Phase
resource "google_logging_metric" "diplomacy_engine_adjudicate_latency_ms" {
  name            = "${var.service_name}_engine_adjudicate_latency_ms"
  description     = "DATC adjudication execution latency distribution (ms) grouped by phase"
  filter          = "${local.telemetry_base_filter} AND jsonPayload.event_type=\"engine_adjudicate\""
  value_extractor = "EXTRACT(jsonPayload.latency_ms)"
  depends_on      = [google_project_service.logging, google_project_service.monitoring]

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "ms"

    labels {
      key         = "phase"
      value_type  = "STRING"
      description = "Diplomacy phase (Movement, Retreats, Adjustments)"
    }
  }

  label_extractors = {
    phase = "EXTRACT(jsonPayload.phase)"
  }

  bucket_options {
    exponential_buckets {
      num_finite_buckets = 48
      growth_factor      = 1.25
      scale              = 0.25
    }
  }
}

# 4. Supabase PostgREST Query Count by Operation & Outcome
resource "google_logging_metric" "diplomacy_supabase_query_count" {
  name        = "${var.service_name}_supabase_query_count"
  description = "Count of Supabase PostgREST queries grouped by operation and outcome"
  filter      = "${local.telemetry_base_filter} AND jsonPayload.event_type=\"supabase_query\""
  depends_on  = [google_project_service.logging, google_project_service.monitoring]

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "operation"
      value_type  = "STRING"
      description = "Persistence operation (load_game, save_game, load_summaries, etc.)"
    }
    labels {
      key         = "outcome"
      value_type  = "STRING"
      description = "Query outcome (ok, not_found, error)"
    }
  }

  label_extractors = {
    operation = "EXTRACT(jsonPayload.operation)"
    outcome   = "EXTRACT(jsonPayload.outcome)"
  }
}

# 5. Supabase PostgREST Query Latency Distribution (ms) by Operation & Outcome
resource "google_logging_metric" "diplomacy_supabase_query_latency_ms" {
  name            = "${var.service_name}_supabase_query_latency_ms"
  description     = "Latency distribution (ms) for Supabase PostgREST queries by operation and outcome"
  filter          = "${local.telemetry_base_filter} AND jsonPayload.event_type=\"supabase_query\""
  value_extractor = "EXTRACT(jsonPayload.latency_ms)"
  depends_on      = [google_project_service.logging, google_project_service.monitoring]

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "ms"

    labels {
      key         = "operation"
      value_type  = "STRING"
      description = "Persistence operation"
    }
    labels {
      key         = "outcome"
      value_type  = "STRING"
      description = "Query outcome (ok, not_found, error)"
    }
  }

  label_extractors = {
    operation = "EXTRACT(jsonPayload.operation)"
    outcome   = "EXTRACT(jsonPayload.outcome)"
  }

  bucket_options {
    exponential_buckets {
      num_finite_buckets = 64
      growth_factor      = 1.25
      scale              = 0.5
    }
  }
}
