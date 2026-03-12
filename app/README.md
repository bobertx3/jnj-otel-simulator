# OTel Simulator App (Local First)

This app provides an executive-friendly telemetry simulator UI and emits real OTEL traces/logs/metrics to Databricks Unity Catalog tables through a secure backend.

## Architecture

- **Frontend:** static HTML/CSS/JS dashboard
- **Backend:** FastAPI service with OTEL emitters
- **Security:** Databricks PAT stays server-side in `.env`

## Prerequisites

- Python 3.11+
- Existing root `.env` configured with:
  - `DATABRICKS_HOST`
  - `DATABRICKS_TOKEN`
  - `OTEL_SERVICE_NAME`
  - `OTEL_SPANS_TABLE`
  - `OTEL_LOGS_TABLE`
  - `OTEL_METRICS_TABLE`
  - `DATABRICKS_WAREHOUSE_ID` (required for Telemetry Summary tab)
  - `GENIE_SPACE_ID` (required for Ask Genie tab)

## Install

From repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

From repository root:

```bash
source .venv/bin/activate
uvicorn app.backend.server:app --reload --host 127.0.0.1 --port 8000
```

Open:

- `http://127.0.0.1:8000`

## Demo Flow

1. Confirm top-right status pill says `API Connected`.
2. In **Simulator** tab, click one event in each domain card:
   - Infrastructure
   - Networking
   - Applications
3. Watch right-side event log update in real time.
4. In **Telemetry Summary** tab, refresh counts and run a SELECT query to inspect table data.
5. In **Ask Genie** tab, ask a natural language question over OTEL data.
6. Query your UC tables (or run your notebook verification cell) to confirm rows were ingested.

## API Endpoints

- `GET /api/health`
- `GET /api/events`
- `POST /api/emit/{domain}/{event_key}`
- `GET /api/summary`
- `POST /api/summary/query`
- `POST /api/genie/ask`

## Notes

- Fixed OTLP endpoints are used:
  - traces: `/api/2.0/tracing/otel/v1/traces`
  - logs: `/api/2.0/tracing/otel/v1/logs`
  - metrics: `/api/2.0/otel/v1/metrics`
- Backend flushes providers after each emit action so demo clicks appear quickly in downstream tables.
