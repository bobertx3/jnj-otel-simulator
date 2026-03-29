"""EO Operational Dashboard — read-only backend."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from databricks import sql as dbsql

from .queries import (
    parse_range,
    kpi_query,
    domain_summary_query,
    domain_overview_query,
    component_detail_query,
    recent_events_query,
)

APP_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = APP_DIR / "frontend"

load_dotenv(APP_DIR.parent / ".env")

logger = logging.getLogger(__name__)

# Config from env
DATABRICKS_HOST = os.getenv("DATABRICKS_HOST", "")
WAREHOUSE_ID = os.getenv("DATABRICKS_WAREHOUSE_ID", "")
SPANS_TABLE = os.getenv("OTEL_SPANS_TABLE", "")
LOGS_TABLE = os.getenv("OTEL_LOGS_TABLE", "")
METRICS_TABLE = os.getenv("OTEL_METRICS_TABLE", "")


def _resolve_sql_host(cfg: Any) -> str:
    """Workspace hostname for SQL connector (no https://).

    In Databricks Apps, prefer SDK host (matches the deployment workspace). A static
    DATABRICKS_HOST in app.yaml can point at another workspace and break OAuth + SQL.
    """
    env_h = os.getenv("DATABRICKS_HOST", "").strip()
    sdk_h = getattr(cfg, "host", None) or ""
    if os.getenv("DATABRICKS_CLIENT_ID"):
        raw = sdk_h or env_h
    else:
        raw = env_h or sdk_h
    if not raw:
        return ""
    return str(raw).replace("https://", "").split("/")[0].rstrip("/")


def _run_sql(query: str) -> list[dict[str, Any]]:
    """Execute a SQL query and return rows as dicts."""
    from databricks.sdk.core import Config

    cfg = Config()
    host = _resolve_sql_host(cfg)
    if not host:
        raise HTTPException(
            status_code=503,
            detail="No Databricks host (set DATABRICKS_HOST or deploy with workspace config)",
        )
    if not WAREHOUSE_ID:
        raise HTTPException(status_code=503, detail="DATABRICKS_WAREHOUSE_ID not set")
    http_path = f"/sql/1.0/warehouses/{WAREHOUSE_ID}"
    pat = os.getenv("DATABRICKS_TOKEN", "").strip()
    try:
        if pat:
            conn = dbsql.connect(
                server_hostname=host,
                http_path=http_path,
                access_token=pat,
            )
        else:
            # Databricks Apps OAuth (service principal) or local default auth chain
            conn = dbsql.connect(
                server_hostname=host,
                http_path=http_path,
                credentials_provider=cfg.authenticate,
            )
        with conn:
            with conn.cursor() as cursor:
                cursor.execute(query)
                columns = [desc[0] for desc in cursor.description] if cursor.description else []
                rows = cursor.fetchall()
                return [dict(zip(columns, row)) for row in rows]
    except Exception as e:
        logger.error(f"SQL error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


app = FastAPI(title="EO Operational Dashboard", version="0.1.0")
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/")
def index():
    return FileResponse(str(FRONTEND_DIR / "index.html"))


@app.get("/api/health")
def health():
    try:
        from databricks.sdk.core import Config

        cfg = Config()
        resolved = _resolve_sql_host(cfg)
    except Exception:
        resolved = ""
    ok = bool(resolved and WAREHOUSE_ID and SPANS_TABLE)
    return {
        "status": "ok" if ok else "misconfigured",
        "host": DATABRICKS_HOST,
        "resolved_host": resolved,
        "spans_table": SPANS_TABLE,
        "logs_table": LOGS_TABLE,
        "metrics_table": METRICS_TABLE,
    }


@app.get("/api/kpis")
def get_kpis(range: str = Query("30m", alias="range")):
    minutes = parse_range(range)
    rows = _run_sql(kpi_query(SPANS_TABLE, minutes))
    if not rows:
        return {"total_spans": 0, "active_incidents": 0, "critical_alerts": 0, "events_per_min": 0}
    r = rows[0]
    return {
        "total_spans": int(r.get("total_spans") or 0),
        "active_incidents": int(r.get("active_incidents") or 0),
        "critical_alerts": int(r.get("critical_alerts") or 0),
        "events_per_min": float(r.get("events_per_min") or 0),
    }


@app.get("/api/domain-summary")
def get_domain_summary(range: str = Query("all", alias="range")):
    minutes = parse_range(range)
    rows = _run_sql(domain_summary_query(SPANS_TABLE, minutes))
    result = {}
    for r in rows:
        domain = r.get("domain", "unknown")
        result[domain] = {
            "total_events": int(r.get("total_events") or 0),
            "components": int(r.get("components") or 0),
            "incidents": int(r.get("incidents") or 0),
            "critical": int(r.get("critical") or 0),
            "warnings": int(r.get("warnings") or 0),
            "revenue_impact": int(r.get("revenue_impact") or 0),
            "users_affected": int(r.get("users_affected") or 0),
        }
    return result


@app.get("/api/domain-overview")
def get_domain_overview(range: str = Query("30m", alias="range")):
    minutes = parse_range(range)
    rows = _run_sql(domain_overview_query(SPANS_TABLE, minutes))
    # Group by domain
    grouped: dict[str, list] = {}
    for r in rows:
        domain = r.get("domain") or "unknown"
        grouped.setdefault(domain, []).append({
            "component_id": r.get("component_id"),
            "triplet_id": r.get("triplet_id"),
            "component_type": r.get("component_type"),
            "worst_severity": r.get("worst_severity") or "normal",
            "event_count": int(r.get("event_count") or 0),
            "incident_count": int(r.get("incident_count") or 0),
            "worst_priority": r.get("worst_priority"),
            "avg_revenue_impact": float(r.get("avg_revenue_impact") or 0),
            "avg_users_affected": int(r.get("avg_users_affected") or 0),
            "last_seen": str(r.get("last_seen") or ""),
        })
    return {"domains": grouped}


@app.get("/api/component/{component_id}/details")
def get_component_details(component_id: str, range: str = Query("30m", alias="range")):
    minutes = parse_range(range)
    rows = _run_sql(component_detail_query(SPANS_TABLE, component_id, minutes))
    events = []
    for r in rows:
        events.append({
            "time": str(r.get("time") or ""),
            "span_name": r.get("span_name"),
            "incident_id": r.get("incident_id"),
            "severity": r.get("severity"),
            "priority": r.get("priority"),
            "root_cause": r.get("root_cause"),
            "users_affected": r.get("users_affected"),
            "revenue_usd": r.get("revenue_usd"),
            "sla_breach": r.get("sla_breach"),
            "mttr_minutes": r.get("mttr_minutes"),
        })
    return {"component_id": component_id, "events": events}


@app.get("/api/events/recent")
def get_recent_events(
    range: str = Query("30m", alias="range"),
    limit: int = Query(50, ge=1, le=200),
):
    minutes = parse_range(range)
    rows = _run_sql(recent_events_query(SPANS_TABLE, minutes, limit))
    events = []
    for r in rows:
        events.append({
            "time": str(r.get("time") or ""),
            "span_name": r.get("span_name"),
            "domain": r.get("domain"),
            "component_id": r.get("component_id"),
            "incident_id": r.get("incident_id"),
            "severity": r.get("severity"),
            "priority": r.get("priority"),
        })
    return {"events": events}
