---
name: Local OTel Emitter Notebook
overview: Create a local Jupyter notebook and environment configuration that emit OpenTelemetry traces/logs/metrics into Unity Catalog tables in your Databricks workspace using the zerobus-compatible OTLP endpoints.
todos:
  - id: create-local-notebook
    content: Create notebooks/local_otel_emitter.ipynb with local Mac env loading, mandatory UC table headers, and signal-driven emission flow
    status: pending
  - id: create-env-files
    content: Create .env.example and .env with required Databricks + mandatory table routing vars only
    status: pending
  - id: add-telemetry-config
    content: Add config/telemetry.emit.yaml defining traces/logs/metrics dictionaries, timing, and emit toggles
    status: pending
  - id: add-dependencies
    content: Add requirements.txt for local Jupyter Mac execution and required OpenTelemetry/Databricks packages
    status: pending
  - id: verify-notebook-flow
    content: Validate notebook behavior against zerobus endpoints, mandatory table headers, and YAML-driven signal emission
    status: pending
isProject: false
---

# Build Local OTEL Notebook + Env

## Scope

Implement a local, runnable notebook for macOS that mirrors your reference emitter behavior but separates connection/routing config (`.env`) from signal payload/timing config (`config/telemetry.emit.yaml`).

## Files To Create

- [notebooks/local_otel_emitter.ipynb](/Users/robert.leach/dev/vibe/jnj-otel-quick-app/notebooks/local_otel_emitter.ipynb)
- [.env.example](/Users/robert.leach/dev/vibe/jnj-otel-quick-app/.env.example)
- [.env](/Users/robert.leach/dev/vibe/jnj-otel-quick-app/.env)
- [config/telemetry.emit.yaml](/Users/robert.leach/dev/vibe/jnj-otel-quick-app/config/telemetry.emit.yaml)
- [requirements.txt](/Users/robert.leach/dev/vibe/jnj-otel-quick-app/requirements.txt)

## Implementation Details

- Port the logic from [reference/emit_otel_v2.py](/Users/robert.leach/dev/vibe/jnj-otel-quick-app/reference/emit_otel_v2.py) into notebook cells for local execution.
- Use PAT auth from `.env` (`DATABRICKS_TOKEN`) and workspace URL (`DATABRICKS_HOST`) to build OTLP headers.
- Require explicit target tables and fail fast if missing:
  - `OTEL_SPANS_TABLE`
  - `OTEL_LOGS_TABLE`
  - `OTEL_METRICS_TABLE`
- Always include required headers per export request:
  - `Authorization: Bearer <token>`
  - `X-Databricks-Workspace-Url: <host>`
  - `X-Databricks-UC-Table-Name: <catalog>.<schema>.<table>`
- Keep endpoint behavior aligned with current Databricks ingestion:
  - traces/logs: `${DATABRICKS_HOST}/api/2.0/tracing/otel/v1/{traces|logs}`
  - metrics: `${DATABRICKS_HOST}/api/2.0/otel/v1/metrics`
- Add cells that optionally create/ensure UC schema and OTEL tables (`otel_spans_v2`, `otel_logs_v2`, `otel_metrics`) via Databricks SQL connector/SDK using env-specified catalog/schema.
- Add YAML-driven emission cells that map signal configs to OpenTelemetry dictionaries (attributes/body/events/measurement definitions), with per-signal toggles and timing controls in YAML instead of `.env`.
- Add local-run guidance cells for macOS (`python3 -m venv`, `pip install -r requirements.txt`, kernel selection), then flush/shutdown and verification query section.

## `.env` Variables

Keep `.env` minimal and required for local routing/auth:

- `DATABRICKS_HOST`
- `DATABRICKS_TOKEN`
- `DATABRICKS_CATALOG`
- `DATABRICKS_SCHEMA`
- `OTEL_SERVICE_NAME`
- `OTEL_SPANS_TABLE`
- `OTEL_LOGS_TABLE`
- `OTEL_METRICS_TABLE`

## Telemetry YAML Config

Define signal-specific emission behavior in `config/telemetry.emit.yaml`, including:

- `traces.enabled`, span names, attributes, events, and repeat count
- `logs.enabled`, severity/body/attributes and repeat count
- `metrics.enabled`, instruments (counter/histogram), labels, sample values, export interval, and post-emit wait
- global defaults for `service.version` and `deployment.environment` if provided

## Validation

- Ensure the notebook can run start-to-finish on local macOS with `.env` + YAML config only.
- Verify emitted rows appear in Unity Catalog for all three tables.
- Confirm mandatory table header routing is present for traces/logs/metrics exporters.
- Confirm YAML controls telemetry type and payload dictionaries without requiring notebook code changes.

