# Databricks notebook source
# MAGIC %md
# MAGIC # OTel Emitter — Self-Contained Setup & Test
# MAGIC
# MAGIC This notebook creates OTel tables in Unity Catalog and emits sample traces, logs, and metrics
# MAGIC via the Databricks OTLP endpoints. Everything is auto-detected — just run it.
# MAGIC
# MAGIC **Note:** Traces and logs use the v2 schema (`/api/2.0/tracing/otel`), while metrics use the
# MAGIC v1 schema (`/api/2.0/otel`) as v2 metrics ingestion is not yet supported.
# MAGIC
# MAGIC **Requirements:**
# MAGIC - Unity Catalog enabled workspace
# MAGIC - A catalog you have CREATE TABLE permissions on
# MAGIC - Serverless or classic compute (both work)

# COMMAND ----------

# MAGIC %pip install opentelemetry-api opentelemetry-sdk opentelemetry-exporter-otlp-proto-http databricks-sdk --quiet

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

# Auto-detect workspace host and token — no manual config needed
_ctx = dbutils.notebook.entry_point.getDbutils().notebook().getContext()

WORKSPACE_HOST = f"https://{spark.conf.get('spark.databricks.workspaceUrl')}"
TOKEN = _ctx.apiToken().get()

# Configure catalog and schema via widgets (defaults shown)
dbutils.widgets.text("catalog", spark.sql("SELECT current_catalog()").first()[0], "Catalog")
dbutils.widgets.text("schema", "otel", "Schema")
dbutils.widgets.text("service_name", "otel-v2-test-emitter", "Service Name")

CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")
SERVICE_NAME = dbutils.widgets.get("service_name")

print(f"Workspace:    {WORKSPACE_HOST}")
print(f"Destination:  {CATALOG}.{SCHEMA}")
print(f"Service:      {SERVICE_NAME}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Create OTel Tables

# COMMAND ----------

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}")

_TBLPROPS_V2 = """
TBLPROPERTIES (
  'otel.schemaVersion' = 'v2',
  'delta.enableRowTracking' = 'true',
  'delta.feature.appendOnly' = 'supported',
  'delta.feature.domainMetadata' = 'supported',
  'delta.feature.rowTracking' = 'supported'
)"""

SPANS_DDL = f"""
CREATE TABLE IF NOT EXISTS {CATALOG}.{SCHEMA}.otel_spans_v2 (
  record_id STRING,
  time TIMESTAMP,
  date DATE,
  service_name STRING,
  trace_id STRING,
  span_id STRING,
  trace_state STRING,
  parent_span_id STRING,
  flags INT,
  name STRING,
  kind STRING,
  start_time_unix_nano LONG,
  end_time_unix_nano LONG,
  attributes VARIANT,
  dropped_attributes_count INT,
  events ARRAY<STRUCT<
    time_unix_nano: LONG,
    name: STRING,
    attributes: VARIANT,
    dropped_attributes_count: INT
  >>,
  dropped_events_count INT,
  links ARRAY<STRUCT<
    trace_id: STRING,
    span_id: STRING,
    trace_state: STRING,
    attributes: VARIANT,
    dropped_attributes_count: INT,
    flags: INT
  >>,
  dropped_links_count INT,
  status STRUCT<message: STRING, code: STRING>,
  resource STRUCT<attributes: VARIANT, dropped_attributes_count: INT>,
  resource_schema_url STRING,
  instrumentation_scope STRUCT<name: STRING, version: STRING, attributes: VARIANT, dropped_attributes_count: INT>,
  span_schema_url STRING
) USING DELTA
{_TBLPROPS_V2}
"""

LOGS_DDL = f"""
CREATE TABLE IF NOT EXISTS {CATALOG}.{SCHEMA}.otel_logs_v2 (
  record_id STRING,
  time TIMESTAMP,
  date DATE,
  service_name STRING,
  event_name STRING,
  trace_id STRING,
  span_id STRING,
  time_unix_nano LONG,
  observed_time_unix_nano LONG,
  severity_number STRING,
  severity_text STRING,
  body VARIANT,
  attributes VARIANT,
  dropped_attributes_count INT,
  flags INT,
  resource STRUCT<attributes: VARIANT, dropped_attributes_count: INT>,
  resource_schema_url STRING,
  instrumentation_scope STRUCT<name: STRING, version: STRING, attributes: VARIANT, dropped_attributes_count: INT>,
  log_schema_url STRING
) USING DELTA
{_TBLPROPS_V2}
"""

# Metrics use v1 schema — the /api/2.0/otel endpoint requires MAP<STRING,STRING> not VARIANT
METRICS_DDL = f"""
CREATE TABLE IF NOT EXISTS {CATALOG}.{SCHEMA}.otel_metrics (
  name STRING,
  description STRING,
  unit STRING,
  metric_type STRING,
  gauge STRUCT<
    start_time_unix_nano: LONG, time_unix_nano: LONG, value: DOUBLE,
    exemplars: ARRAY<STRUCT<time_unix_nano: LONG, value: DOUBLE, span_id: STRING, trace_id: STRING, filtered_attributes: MAP<STRING, STRING>>>,
    attributes: MAP<STRING, STRING>, flags: INT
  >,
  sum STRUCT<
    start_time_unix_nano: LONG, time_unix_nano: LONG, value: DOUBLE,
    exemplars: ARRAY<STRUCT<time_unix_nano: LONG, value: DOUBLE, span_id: STRING, trace_id: STRING, filtered_attributes: MAP<STRING, STRING>>>,
    attributes: MAP<STRING, STRING>, flags: INT, aggregation_temporality: STRING, is_monotonic: BOOLEAN
  >,
  histogram STRUCT<
    start_time_unix_nano: LONG, time_unix_nano: LONG, count: LONG, sum: DOUBLE,
    bucket_counts: ARRAY<LONG>, explicit_bounds: ARRAY<DOUBLE>,
    exemplars: ARRAY<STRUCT<time_unix_nano: LONG, value: DOUBLE, span_id: STRING, trace_id: STRING, filtered_attributes: MAP<STRING, STRING>>>,
    attributes: MAP<STRING, STRING>, flags: INT, min: DOUBLE, max: DOUBLE, aggregation_temporality: STRING
  >,
  exponential_histogram STRUCT<
    attributes: MAP<STRING, STRING>, start_time_unix_nano: LONG, time_unix_nano: LONG, count: LONG, sum: DOUBLE,
    scale: INT, zero_count: LONG,
    positive_bucket: STRUCT<offset: INT, bucket_counts: ARRAY<LONG>>,
    negative_bucket: STRUCT<offset: INT, bucket_counts: ARRAY<LONG>>,
    flags: INT,
    exemplars: ARRAY<STRUCT<time_unix_nano: LONG, value: DOUBLE, span_id: STRING, trace_id: STRING, filtered_attributes: MAP<STRING, STRING>>>,
    min: DOUBLE, max: DOUBLE, zero_threshold: DOUBLE, aggregation_temporality: STRING
  >,
  summary STRUCT<
    start_time_unix_nano: LONG, time_unix_nano: LONG, count: LONG, sum: DOUBLE,
    quantile_values: ARRAY<STRUCT<quantile: DOUBLE, value: DOUBLE>>,
    attributes: MAP<STRING, STRING>, flags: INT
  >,
  metadata MAP<STRING, STRING>,
  resource STRUCT<attributes: MAP<STRING, STRING>, dropped_attributes_count: INT>,
  resource_schema_url STRING,
  instrumentation_scope STRUCT<name: STRING, version: STRING, attributes: MAP<STRING, STRING>, dropped_attributes_count: INT>,
  metric_schema_url STRING
) USING DELTA
TBLPROPERTIES ('otel.schemaVersion' = 'v1')
"""

for label, ddl in [("spans_v2", SPANS_DDL), ("logs_v2", LOGS_DDL), ("metrics", METRICS_DDL)]:
    spark.sql(ddl)
    print(f"  Created {CATALOG}.{SCHEMA}.otel_{label}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Configure OTel Exporters

# COMMAND ----------

import logging
import time

from opentelemetry import _logs as otel_logs
from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import SimpleLogRecordProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor

# Traces & logs use the v2 tracing endpoint; metrics use the v1 otel endpoint
OTLP_TRACING = f"{WORKSPACE_HOST}/api/2.0/tracing/otel"
OTLP_METRICS = f"{WORKSPACE_HOST}/api/2.0/otel"

table_spans = f"{CATALOG}.{SCHEMA}.otel_spans_v2"
table_logs = f"{CATALOG}.{SCHEMA}.otel_logs_v2"
table_metrics = f"{CATALOG}.{SCHEMA}.otel_metrics"

def make_headers(table_name):
    return {
        "Authorization": f"Bearer {TOKEN}",
        "X-Databricks-UC-Table-Name": table_name,
        "X-Databricks-Workspace-Url": WORKSPACE_HOST,
    }

resource = Resource.create({
    "service.name": SERVICE_NAME,
    "service.version": "0.1.0",
    "deployment.environment": "test",
})

# Traces
span_exporter = OTLPSpanExporter(
    endpoint=f"{OTLP_TRACING}/v1/traces",
    headers=make_headers(table_spans),
)
tracer_provider = TracerProvider(resource=resource)
tracer_provider.add_span_processor(SimpleSpanProcessor(span_exporter))
trace.set_tracer_provider(tracer_provider)
tracer = trace.get_tracer(SERVICE_NAME)

# Logs
log_exporter = OTLPLogExporter(
    endpoint=f"{OTLP_TRACING}/v1/logs",
    headers=make_headers(table_logs),
)
logger_provider = LoggerProvider(resource=resource)
logger_provider.add_log_record_processor(SimpleLogRecordProcessor(log_exporter))
otel_logs.set_logger_provider(logger_provider)
otel_handler = LoggingHandler(level=logging.INFO, logger_provider=logger_provider)
otel_logger = logging.getLogger(SERVICE_NAME)
otel_logger.addHandler(otel_handler)
otel_logger.setLevel(logging.INFO)

# Metrics — uses /api/2.0/otel/v1/metrics (v1 schema)
metric_exporter = OTLPMetricExporter(
    endpoint=f"{OTLP_METRICS}/v1/metrics",
    headers=make_headers(table_metrics),
)
metric_reader = PeriodicExportingMetricReader(metric_exporter, export_interval_millis=5000)
meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
metrics.set_meter_provider(meter_provider)
meter = metrics.get_meter(SERVICE_NAME)

request_counter = meter.create_counter("http.server.request_count", description="Total HTTP requests", unit="requests")
request_duration = meter.create_histogram("http.server.duration", description="HTTP request duration", unit="ms")

print("  OTel exporters configured")
print(f"  Traces/Logs endpoint: {OTLP_TRACING}")
print(f"  Metrics endpoint:     {OTLP_METRICS}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Emit Sample Telemetry

# COMMAND ----------

# Traces
print("Emitting traces...")
with tracer.start_as_current_span(
    "GET /api/v1/queries",
    attributes={"http.method": "GET", "http.url": "/api/v1/queries", "http.status_code": 200},
) as parent:
    parent.add_event("query.parse", attributes={"query.length": 142})
    time.sleep(0.05)
    with tracer.start_as_current_span(
        "db.execute",
        attributes={"db.system": "databricks", "db.statement": "SELECT * FROM main.default.test LIMIT 10"},
    ) as child:
        child.add_event("rows.fetched", attributes={"row.count": 10})
        time.sleep(0.02)
print(f"  Trace emitted (trace_id={format(parent.get_span_context().trace_id, '032x')})")

# Logs
print("Emitting logs...")
otel_logger.info("Query completed successfully", extra={"query_id": "q-test-v2", "rows_returned": 42})
print("  Log emitted")

# Metrics
print("Emitting metrics...")
request_counter.add(1, {"http.method": "GET", "http.route": "/api/v1/queries"})
request_duration.record(45.3, {"http.method": "GET", "http.route": "/api/v1/queries"})
request_counter.add(1, {"http.method": "POST", "http.route": "/api/v1/analysis"})
request_duration.record(230.7, {"http.method": "POST", "http.route": "/api/v1/analysis"})
print("  Metrics recorded, waiting for periodic export cycle...")
time.sleep(6)  # wait longer than the 5s export interval

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. Flush & Verify

# COMMAND ----------

for name, provider in [("Traces", tracer_provider), ("Logs", logger_provider), ("Metrics", meter_provider)]:
    provider.force_flush(timeout_millis=10000)
    print(f"  {name} flushed")
    time.sleep(1)

tracer_provider.shutdown()
logger_provider.shutdown()
meter_provider.shutdown()

# COMMAND ----------

# Quick verification — count rows written
import time
time.sleep(5)  # allow ingestion lag

for label, tbl in [("spans", table_spans), ("logs", table_logs), ("metrics", table_metrics)]:
    count = spark.sql(f"SELECT count(*) FROM {tbl}").first()[0]
    print(f"  {tbl}: {count} rows")

print(f"\nDone! View your tables at {WORKSPACE_HOST}/explore/data/{CATALOG}/{SCHEMA}")