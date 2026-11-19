# Google Cloud Monitoring Dashboards for Sloplomacy 1901

locals {
  cloud_run_resource_filter = "resource.type=\"cloud_run_revision\" resource.label.\"service_name\"=\"${var.service_name}\""

  m_api_count       = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.diplomacy_api_request_count.name}\" ${local.cloud_run_resource_filter}"
  m_api_latency     = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.diplomacy_api_request_latency_ms.name}\" ${local.cloud_run_resource_filter}"
  m_engine_latency  = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.diplomacy_engine_adjudicate_latency_ms.name}\" ${local.cloud_run_resource_filter}"
  m_supa_count      = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.diplomacy_supabase_query_count.name}\" ${local.cloud_run_resource_filter}"
  m_supa_latency    = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.diplomacy_supabase_query_latency_ms.name}\" ${local.cloud_run_resource_filter}"
  m_run_instances   = "metric.type=\"run.googleapis.com/container/instance_count\" ${local.cloud_run_resource_filter}"
  m_run_startup     = "metric.type=\"run.googleapis.com/container/startup_latencies\" ${local.cloud_run_resource_filter}"
  m_run_cpu         = "metric.type=\"run.googleapis.com/container/cpu/utilizations\" ${local.cloud_run_resource_filter}"
  m_run_mem         = "metric.type=\"run.googleapis.com/container/memory/utilizations\" ${local.cloud_run_resource_filter}"
  m_run_concurrency = "metric.type=\"run.googleapis.com/container/max_request_concurrencies\" ${local.cloud_run_resource_filter}"
  m_run_requests    = "metric.type=\"run.googleapis.com/request_count\" ${local.cloud_run_resource_filter}"
  m_run_billable    = "metric.type=\"run.googleapis.com/container/billable_instance_time\" ${local.cloud_run_resource_filter}"
  m_run_net_sent    = "metric.type=\"run.googleapis.com/container/network/sent_bytes_count\" ${local.cloud_run_resource_filter}"
  m_run_net_recv    = "metric.type=\"run.googleapis.com/container/network/received_bytes_count\" ${local.cloud_run_resource_filter}"

  api_endpoint_tiles = [
    {
      x = 0, y = 0, w = 6, h = 4, period = "60s"
      title = "Overall API Request Rate by Status Class (RPS)", y_label = "Requests / sec"
      datasets = [{ filter = local.m_api_count, aligner = "ALIGN_RATE", reducer = "REDUCE_SUM", group_by = ["metric.label.status_class"], plot = "STACKED_BAR", legend = "$${metric.label.status_class}" }]
    },
    {
      x = 6, y = 0, w = 6, h = 4, period = "300s"
      title = "Overall API Latency Percentiles (p50 / p95 / p99)", y_label = "Latency (ms)"
      datasets = [
        { filter = local.m_api_latency, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_50", group_by = [], plot = "LINE", legend = "p50" },
        { filter = local.m_api_latency, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_95", group_by = [], plot = "LINE", legend = "p95" },
        { filter = local.m_api_latency, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_99", group_by = [], plot = "LINE", legend = "p99" },
      ]
    },
    {
      x = 0, y = 4, w = 6, h = 5, period = "300s"
      title = "p95 Latency by Endpoint", y_label = "Latency (ms)"
      datasets = [{ filter = local.m_api_latency, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_95", group_by = ["metric.label.route_key"], plot = "LINE", legend = "$${metric.label.route_key}" }]
    },
    {
      x = 6, y = 4, w = 6, h = 5, period = "300s"
      title = "p50 Median Latency by Endpoint", y_label = "Latency (ms)"
      datasets = [{ filter = local.m_api_latency, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_50", group_by = ["metric.label.route_key"], plot = "LINE", legend = "$${metric.label.route_key}" }]
    },
    {
      x = 0, y = 9, w = 6, h = 5, period = "300s"
      title = "p99 Tail Latency by Endpoint", y_label = "Latency (ms)"
      datasets = [{ filter = local.m_api_latency, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_99", group_by = ["metric.label.route_key"], plot = "LINE", legend = "$${metric.label.route_key}" }]
    },
    {
      x = 6, y = 9, w = 6, h = 5, period = "60s"
      title = "Request Rate (RPS) by Endpoint", y_label = "Requests / sec"
      datasets = [{ filter = local.m_api_count, aligner = "ALIGN_RATE", reducer = "REDUCE_SUM", group_by = ["metric.label.route_key"], plot = "STACKED_BAR", legend = "$${metric.label.route_key}" }]
    },
    {
      x = 0, y = 14, w = 6, h = 4, period = "60s"
      title = "4xx & 5xx Error Rate by Endpoint", y_label = "Errors / sec"
      datasets = [{ filter = "${local.m_api_count} metric.label.\"status_class\"=monitoring.regex.full_match(\"4xx|5xx\")", aligner = "ALIGN_RATE", reducer = "REDUCE_SUM", group_by = ["metric.label.route_key", "metric.label.status_class"], plot = "STACKED_BAR", legend = "$${metric.label.route_key} ($${metric.label.status_class})" }]
    },
    {
      x = 6, y = 14, w = 6, h = 4, period = "60s"
      title = "API Traffic by HTTP Method", y_label = "Requests / sec"
      datasets = [{ filter = local.m_api_count, aligner = "ALIGN_RATE", reducer = "REDUCE_SUM", group_by = ["metric.label.method"], plot = "STACKED_AREA", legend = "$${metric.label.method}" }]
    },
  ]

  cloud_run_tiles = [
    {
      x = 0, y = 0, w = 6, h = 4, period = "60s"
      title = "Container Instance Count (Active vs Idle)", y_label = "Instances"
      datasets = [{ filter = local.m_run_instances, aligner = "ALIGN_MEAN", reducer = "REDUCE_SUM", group_by = ["metric.label.state"], plot = "STACKED_AREA", legend = "$${metric.label.state}" }]
    },
    {
      x = 6, y = 0, w = 6, h = 4, period = "60s"
      title = "Cold-Start Container Startup Latency (p50 / p95 / p99)", y_label = "Startup Latency (ms)"
      datasets = [
        { filter = local.m_run_startup, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_50", group_by = [], plot = "LINE", legend = "p50" },
        { filter = local.m_run_startup, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_95", group_by = [], plot = "LINE", legend = "p95" },
        { filter = local.m_run_startup, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_99", group_by = [], plot = "LINE", legend = "p99" },
      ]
    },
    {
      x = 0, y = 4, w = 6, h = 4, period = "60s"
      title = "Container CPU Utilization (p50 / p95 / p99)", y_label = "Utilization (0-1)"
      datasets = [
        { filter = local.m_run_cpu, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_50", group_by = [], plot = "LINE", legend = "p50" },
        { filter = local.m_run_cpu, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_95", group_by = [], plot = "LINE", legend = "p95" },
        { filter = local.m_run_cpu, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_99", group_by = [], plot = "LINE", legend = "p99" },
      ]
    },
    {
      x = 6, y = 4, w = 6, h = 4, period = "60s"
      title = "Container Memory Utilization (p50 / p95 / p99)", y_label = "Utilization (0-1)"
      datasets = [
        { filter = local.m_run_mem, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_50", group_by = [], plot = "LINE", legend = "p50" },
        { filter = local.m_run_mem, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_95", group_by = [], plot = "LINE", legend = "p95" },
        { filter = local.m_run_mem, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_99", group_by = [], plot = "LINE", legend = "p99" },
      ]
    },
    {
      x = 0, y = 8, w = 6, h = 4, period = "60s"
      title = "Max Concurrent Requests (WebSockets + HTTP)", y_label = "Concurrent Requests"
      datasets = [
        { filter = local.m_run_concurrency, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_50", group_by = [], plot = "LINE", legend = "p50" },
        { filter = local.m_run_concurrency, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_95", group_by = [], plot = "LINE", legend = "p95" },
      ]
    },
    {
      x = 6, y = 8, w = 6, h = 4, period = "60s"
      title = "Cloud Run Total Requests by Response Code Class (All Traffic)", y_label = "Requests / sec"
      datasets = [{ filter = local.m_run_requests, aligner = "ALIGN_RATE", reducer = "REDUCE_SUM", group_by = ["metric.label.response_code_class"], plot = "STACKED_BAR", legend = "$${metric.label.response_code_class}" }]
    },
    {
      x = 0, y = 12, w = 6, h = 4, period = "60s"
      title = "Billable Container Instance Time", y_label = "Instance-seconds / sec"
      datasets = [{ filter = local.m_run_billable, aligner = "ALIGN_RATE", reducer = "REDUCE_SUM", group_by = [], plot = "STACKED_BAR", legend = "Billable instance-s / s" }]
    },
    {
      x = 6, y = 12, w = 6, h = 4, period = "60s"
      title = "Container Network Egress & Ingress", y_label = "Bytes / sec"
      datasets = [
        { filter = local.m_run_net_sent, aligner = "ALIGN_RATE", reducer = "REDUCE_SUM", group_by = [], plot = "LINE", legend = "Sent (bytes/s)" },
        { filter = local.m_run_net_recv, aligner = "ALIGN_RATE", reducer = "REDUCE_SUM", group_by = [], plot = "LINE", legend = "Received (bytes/s)" },
      ]
    },
  ]

  engine_supabase_tiles = [
    {
      x = 0, y = 0, w = 6, h = 4, period = "300s"
      title = "DATC Adjudication p95 Latency by Phase", y_label = "Latency (ms)"
      datasets = [{ filter = local.m_engine_latency, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_95", group_by = ["metric.label.phase"], plot = "LINE", legend = "$${metric.label.phase} (p95)" }]
    },
    {
      x = 6, y = 0, w = 6, h = 4, period = "60s"
      title = "DATC Adjudication Calls by Phase (per minute)", y_label = "Adjudications / min"
      datasets = [{ filter = local.m_engine_latency, aligner = "ALIGN_COUNT", reducer = "REDUCE_SUM", group_by = ["metric.label.phase"], plot = "STACKED_BAR", legend = "$${metric.label.phase}" }]
    },
    {
      x = 0, y = 4, w = 6, h = 4, period = "300s"
      title = "Supabase Query p95 Latency by Operation", y_label = "Latency (ms)"
      datasets = [{ filter = local.m_supa_latency, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_95", group_by = ["metric.label.operation"], plot = "LINE", legend = "$${metric.label.operation}" }]
    },
    {
      x = 6, y = 4, w = 6, h = 4, period = "300s"
      title = "Supabase Query p50 Median Latency by Operation", y_label = "Latency (ms)"
      datasets = [{ filter = local.m_supa_latency, aligner = "ALIGN_DELTA", reducer = "REDUCE_PERCENTILE_50", group_by = ["metric.label.operation"], plot = "LINE", legend = "$${metric.label.operation}" }]
    },
    {
      x = 0, y = 8, w = 6, h = 4, period = "60s"
      title = "Supabase Query Rate by Operation & Outcome", y_label = "Queries / sec"
      datasets = [{ filter = local.m_supa_count, aligner = "ALIGN_RATE", reducer = "REDUCE_SUM", group_by = ["metric.label.operation", "metric.label.outcome"], plot = "STACKED_BAR", legend = "$${metric.label.operation} ($${metric.label.outcome})" }]
    },
    {
      x = 6, y = 8, w = 6, h = 4, period = "60s"
      title = "Supabase Persistence Errors by Operation", y_label = "Errors / sec"
      datasets = [{ filter = "${local.m_supa_count} metric.label.\"outcome\"=\"error\"", aligner = "ALIGN_RATE", reducer = "REDUCE_SUM", group_by = ["metric.label.operation"], plot = "STACKED_BAR", legend = "$${metric.label.operation}" }]
    },
  ]

  dashboard_specs = {
    api_endpoint_performance = {
      display_name = "Sloplomacy — API Endpoint Performance (${var.service_name})"
      tiles        = local.api_endpoint_tiles
    }
    cloud_run_infrastructure = {
      display_name = "Sloplomacy — Cloud Run Infrastructure & Scale-to-Zero (${var.service_name})"
      tiles        = local.cloud_run_tiles
    }
    engine_and_supabase = {
      display_name = "Sloplomacy — Game Engine & Supabase Persistence (${var.service_name})"
      tiles        = local.engine_supabase_tiles
    }
  }
}

resource "google_monitoring_dashboard" "api_endpoint_performance" {
  depends_on = [google_project_service.monitoring]

  dashboard_json = jsonencode({
    displayName = local.dashboard_specs.api_endpoint_performance.display_name
    mosaicLayout = {
      columns = 12
      tiles = [
        for t in local.dashboard_specs.api_endpoint_performance.tiles : {
          xPos = t.x, yPos = t.y, width = t.w, height = t.h
          widget = {
            title = t.title
            xyChart = {
              dataSets = [
                for d in t.datasets : {
                  plotType       = d.plot
                  legendTemplate = d.legend
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = d.filter
                      aggregation = {
                        alignmentPeriod    = t.period
                        perSeriesAligner   = d.aligner
                        crossSeriesReducer = d.reducer
                        groupByFields      = d.group_by
                      }
                    }
                  }
                }
              ]
              yAxis = { label = t.y_label, scale = "LINEAR" }
            }
          }
        }
      ]
    }
  })
}

resource "google_monitoring_dashboard" "cloud_run_infrastructure" {
  depends_on = [google_project_service.monitoring]

  dashboard_json = jsonencode({
    displayName = local.dashboard_specs.cloud_run_infrastructure.display_name
    mosaicLayout = {
      columns = 12
      tiles = [
        for t in local.dashboard_specs.cloud_run_infrastructure.tiles : {
          xPos = t.x, yPos = t.y, width = t.w, height = t.h
          widget = {
            title = t.title
            xyChart = {
              dataSets = [
                for d in t.datasets : {
                  plotType       = d.plot
                  legendTemplate = d.legend
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = d.filter
                      aggregation = {
                        alignmentPeriod    = t.period
                        perSeriesAligner   = d.aligner
                        crossSeriesReducer = d.reducer
                        groupByFields      = d.group_by
                      }
                    }
                  }
                }
              ]
              yAxis = { label = t.y_label, scale = "LINEAR" }
            }
          }
        }
      ]
    }
  })
}

resource "google_monitoring_dashboard" "engine_and_supabase" {
  depends_on = [google_project_service.monitoring]

  dashboard_json = jsonencode({
    displayName = local.dashboard_specs.engine_and_supabase.display_name
    mosaicLayout = {
      columns = 12
      tiles = [
        for t in local.dashboard_specs.engine_and_supabase.tiles : {
          xPos = t.x, yPos = t.y, width = t.w, height = t.h
          widget = {
            title = t.title
            xyChart = {
              dataSets = [
                for d in t.datasets : {
                  plotType       = d.plot
                  legendTemplate = d.legend
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = d.filter
                      aggregation = {
                        alignmentPeriod    = t.period
                        perSeriesAligner   = d.aligner
                        crossSeriesReducer = d.reducer
                        groupByFields      = d.group_by
                      }
                    }
                  }
                }
              ]
              yAxis = { label = t.y_label, scale = "LINEAR" }
            }
          }
        }
      ]
    }
  })
}
