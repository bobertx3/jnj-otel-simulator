from __future__ import annotations

import logging
import os
import random
import time
import urllib.error
import urllib.request
import json
import uuid
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from databricks import sql

from .emitter import EmitterConfig, OTelEmitter
from .models import (
    Domain, EmitResponse, EmitRandomResponse, EventDefinition,
    GenieAskRequest, GenieAskResponse, IncidentEvent,
    StreamingConfig, TripletResponse, ComponentResponse,
)
from .scenarios import ScenarioCatalog

ROOT_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIR = ROOT_DIR / "app" / "frontend"

load_dotenv(ROOT_DIR / ".env")
cfg = EmitterConfig.from_env()
emitter = OTelEmitter(cfg)
GENIE_SPACE_ID = os.getenv("GENIE_SPACE_ID", "01f11cbdc1b21b06b17d10fa4f58a5f1")
WAREHOUSE_ID = os.getenv("DATABRICKS_WAREHOUSE_ID", "")
catalog = ScenarioCatalog()
streaming_config = StreamingConfig()

app = FastAPI(title="OTel Simulator App", version="0.1.0")
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


EVENT_CATALOG: dict[Domain, list[EventDefinition]] = {
    Domain.infrastructure: [
        EventDefinition(
            key="pod_lifecycle",
            label="Pod Lifecycle Event",
            description="Container pod restart and scheduling event.",
            business_impact="Usually low impact unless restart storms increase request failures.",
        ),
        EventDefinition(
            key="node_resource_pressure",
            label="Node Resource Pressure",
            description="CPU/memory pressure on compute nodes.",
            business_impact="Can increase response times and create app instability.",
        ),
        EventDefinition(
            key="deployment_rollout",
            label="Deployment Rollout",
            description="New service version rolling through environment.",
            business_impact="Good release hygiene signal; watch for temporary error spikes.",
        ),
        EventDefinition(
            key="cluster_autoscaler",
            label="Cluster Autoscaler Event",
            description="Cluster scales up/down based on demand.",
            business_impact="Shows cost/performance balancing under load.",
        ),
    ],
    Domain.networking: [
        EventDefinition(
            key="flow_log_entry",
            label="VPC Flow Log Entry",
            description="Baseline network traffic telemetry event.",
            business_impact="Used for security and traffic baselining.",
        ),
        EventDefinition(
            key="subnet_latency_spike",
            label="Subnet Latency Spike",
            description="Increased network delay between components.",
            business_impact="Degrades user experience and API completion time.",
        ),
        EventDefinition(
            key="packet_loss_alert",
            label="Packet Loss Alert",
            description="Dropped packets on critical paths.",
            business_impact="Drives retries, timeouts, and error-rate increases.",
        ),
        EventDefinition(
            key="dns_failure",
            label="DNS Resolution Failure",
            description="Service discovery lookup failure.",
            business_impact="Can cascade into broad downstream failures.",
        ),
    ],
    Domain.applications: [
        EventDefinition(
            key="api_request",
            label="API Request Trace",
            description="Normal customer request through frontend and API.",
            business_impact="Healthy baseline for throughput and latency KPIs.",
        ),
        EventDefinition(
            key="api_error",
            label="API Error (4xx/5xx)",
            description="Request fails in application or downstream dependency.",
            business_impact="Direct reliability issue visible to customers and support.",
        ),
        EventDefinition(
            key="slow_response",
            label="Slow Response / Timeout",
            description="Request exceeds latency threshold.",
            business_impact="Impacts conversion and customer satisfaction.",
        ),
        EventDefinition(
            key="frontend_exception",
            label="Frontend Exception",
            description="Unhandled client-side application exception.",
            business_impact="UI breakages and lower task completion rates.",
        ),
    ],
}


def _emit_for_event(domain: Domain, event_key: str, event_label: str) -> tuple[dict[str, Any], dict[str, Any]]:
    base_route = f"/sim/{domain.value}/{event_key}"
    error_event = event_key in {"api_error", "frontend_exception", "dns_failure", "packet_loss_alert"}
    severity = "WARN" if error_event else "INFO"
    event_id = str(uuid.uuid4())
    correlation_id = str(uuid.uuid4())
    trace_id = uuid.uuid4().hex
    source_component = f"{domain.value}.simulator"
    timestamp_ns = int(time.time() * 1_000_000_000)
    common_attrs = {
        "event_id": event_id,
        "correlation_id": correlation_id,
        "trace_id": trace_id,
        "source_component": source_component,
        "simulator.route": base_route,
        "simulator.severity": "high" if error_event else "normal",
    }

    emitter.emit_trace(
        domain=domain.value,
        event=event_key,
        label=event_label,
        attributes=common_attrs,
        child_name="downstream.call",
    )
    emitter.emit_log(
        level=logging.ERROR if error_event else logging.INFO,
        message=f"{domain.value}::{event_key} triggered",
        domain=domain.value,
        event=event_key,
        extra={"route": base_route, "label": event_label, **common_attrs},
    )
    # Simulate enterprise-style latency and error metrics by event type.
    latency_ms = 140.0
    if domain == Domain.applications:
        latency_ms = 2200.0 if event_key == "slow_response" else 420.0 if error_event else 180.0
    elif domain == Domain.networking:
        latency_ms = 360.0 if error_event else 210.0
    elif domain == Domain.infrastructure:
        latency_ms = 280.0 if event_key == "node_resource_pressure" else 170.0

    emitter.emit_metrics(
        domain=domain.value,
        route=base_route,
        latency_ms=latency_ms,
        error=error_event,
    )
    emitter.flush()

    telemetry_summary = {
        "trace": event_label,
        "log": f"{domain.value}::{event_key}",
        "error_signal": error_event,
        "severity": severity,
        "source_component": source_component,
        "route": base_route,
    }
    raw_telemetry = {
        "event_id": event_id,
        "correlation_id": correlation_id,
        "trace_id": trace_id,
        "timestamp_unix_nano": timestamp_ns,
        "domain": domain.value,
        "event_type": event_key,
        "event_label": event_label,
        "severity": severity,
        "source_component": source_component,
        "signal_types": ["trace", "log", "metric"],
        "resource": {
            "service.name": cfg.service_name,
            "deployment.environment": "local-simulator",
        },
        "trace": {
            "name": event_label,
            "attributes": common_attrs,
            "child_span": "downstream.call",
        },
        "log": {
            "message": f"{domain.value}::{event_key} triggered",
            "level": severity,
            "attributes": {
                "route": base_route,
                "label": event_label,
                **common_attrs,
            },
        },
    }
    return telemetry_summary, raw_telemetry


def _run_sql(query: str) -> tuple[list[str], list[tuple[Any, ...]]]:
    if not WAREHOUSE_ID:
        raise HTTPException(
            status_code=400, detail="DATABRICKS_WAREHOUSE_ID is required for summary queries"
        )
    with sql.connect(
        server_hostname=cfg.databricks_host.replace("https://", ""),
        http_path=f"/sql/1.0/warehouses/{WAREHOUSE_ID}",
        access_token=cfg.databricks_token,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute(query)
            cols = [c[0] for c in cur.description] if cur.description else []
            rows = cur.fetchall()
            return cols, rows


def _rows_to_dicts(columns: list[str], rows: list[tuple[Any, ...]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        mapped: dict[str, Any] = {}
        for i, col in enumerate(columns):
            value = row[i] if i < len(row) else None
            if isinstance(value, (dict, list)):
                mapped[col] = json.dumps(value)
            else:
                mapped[col] = str(value) if value is not None else None
        out.append(mapped)
    return out


def _genie_request(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{cfg.databricks_host}{path}"
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url=url,
        method=method,
        data=data,
        headers={
            "Authorization": f"Bearer {cfg.databricks_token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")
        raise HTTPException(status_code=e.code, detail=detail) from e


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/events")
def list_events() -> dict[str, list[EventDefinition]]:
    return {domain.value: definitions for domain, definitions in EVENT_CATALOG.items()}


@app.post("/api/emit/{domain}/{event_key}", response_model=EmitResponse)
def emit_event(domain: Domain, event_key: str) -> EmitResponse:
    match = next((e for e in EVENT_CATALOG[domain] if e.key == event_key), None)
    if not match:
        raise HTTPException(status_code=404, detail="Unknown event")

    telemetry_summary, raw_telemetry = _emit_for_event(domain, event_key, match.label)
    severity = raw_telemetry["severity"]
    source_component = raw_telemetry["source_component"]
    correlation_id = raw_telemetry["correlation_id"]
    trace_id = raw_telemetry["trace_id"]
    signal_types = raw_telemetry["signal_types"]
    return EmitResponse(
        domain=domain,
        event=event_key,
        label=match.label,
        severity=severity,
        source_component=source_component,
        correlation_id=correlation_id,
        trace_id=trace_id,
        signal_types=signal_types,
        telemetry_summary=telemetry_summary,
        raw_telemetry=raw_telemetry,
    )


@app.get("/api/summary")
def telemetry_summary() -> dict[str, Any]:
    count_query = f"""
    SELECT 'spans' AS table_name, COUNT(*) AS record_count FROM {cfg.spans_table}
    UNION ALL
    SELECT 'logs' AS table_name, COUNT(*) AS record_count FROM {cfg.logs_table}
    """
    cols, rows = _run_sql(count_query)
    counts = _rows_to_dicts(cols, rows)

    preview_query = f"""
    SELECT * FROM (
      SELECT 'spans' AS source, time, service_name, name AS item_name, NULL AS severity, NULL AS metric_type
      FROM {cfg.spans_table}
      UNION ALL
      SELECT 'logs' AS source, time, service_name, severity_text AS item_name, severity_text AS severity, NULL AS metric_type
      FROM {cfg.logs_table}
    ) q
    ORDER BY time DESC NULLS LAST
    LIMIT 100
    """
    pcols, prows = _run_sql(preview_query)
    return {"counts": counts, "columns": pcols, "rows": _rows_to_dicts(pcols, prows)}


@app.post("/api/summary/query")
def telemetry_query(body: dict[str, str]) -> dict[str, Any]:
    query = (body.get("query") or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")
    normalized = query.lower().lstrip()
    if not normalized.startswith("select"):
        raise HTTPException(status_code=400, detail="Only SELECT queries are allowed")
    cols, rows = _run_sql(query)
    return {"columns": cols, "rows": _rows_to_dicts(cols, rows)}


@app.post("/api/genie/ask", response_model=GenieAskResponse)
def ask_genie(req: GenieAskRequest) -> GenieAskResponse:
    if not GENIE_SPACE_ID:
        raise HTTPException(status_code=400, detail="GENIE_SPACE_ID is not configured")

    if req.conversation_id:
        start_resp = _genie_request(
            "POST",
            f"/api/2.0/genie/spaces/{GENIE_SPACE_ID}/conversations/{req.conversation_id}/messages",
            {"content": req.question},
        )
        conversation_id = req.conversation_id
        message = start_resp.get("message", {})
        message_id = message.get("id")
    else:
        start_resp = _genie_request(
            "POST",
            f"/api/2.0/genie/spaces/{GENIE_SPACE_ID}/start-conversation",
            {"content": req.question},
        )
        conversation_id = start_resp.get("conversation", {}).get("id")
        message_id = start_resp.get("message", {}).get("id")

    if not conversation_id or not message_id:
        raise HTTPException(status_code=502, detail="Genie did not return conversation/message IDs")

    final_msg: dict[str, Any] = {}
    for _ in range(30):
        msg = _genie_request(
            "GET",
            f"/api/2.0/genie/spaces/{GENIE_SPACE_ID}/conversations/{conversation_id}/messages/{message_id}",
        )
        status = msg.get("status", "")
        if status in {"COMPLETED", "FAILED", "CANCELLED"}:
            final_msg = msg
            break
        time.sleep(1.0)
    else:
        raise HTTPException(status_code=504, detail="Timed out waiting for Genie response")

    if final_msg.get("status") != "COMPLETED":
        raise HTTPException(status_code=502, detail=final_msg.get("error") or "Genie request failed")

    text_response = None
    sql_query = None
    rows: list[dict[str, Any]] = []

    attachments = final_msg.get("attachments") or []
    for item in attachments:
        if item.get("text"):
            text_response = item.get("text", {}).get("content")
        if item.get("query"):
            sql_query = item.get("query", {}).get("query")
            attachment_id = item.get("attachment_id")
            if attachment_id:
                qres = _genie_request(
                    "GET",
                    f"/api/2.0/genie/spaces/{GENIE_SPACE_ID}/conversations/{conversation_id}/messages/{message_id}/attachments/{attachment_id}/query-result",
                )
                rows_data = (
                    qres.get("statement_response", {})
                    .get("result", {})
                    .get("data_array", [])
                )
                if rows_data and isinstance(rows_data, list):
                    rows = [{"values": row} for row in rows_data[:100]]
            break

    return GenieAskResponse(
        status="COMPLETED",
        question=req.question,
        conversation_id=conversation_id,
        message_id=message_id,
        text_response=text_response,
        sql_query=sql_query,
        rows=rows,
    )


def _component_to_response(c: Any) -> ComponentResponse:
    return ComponentResponse(
        id=c.id, label=c.label, domain=c.domain,
        component_type=c.component_type, x=c.x, y=c.y,
        metadata=c.metadata,
    )


@app.get("/api/triplets")
def list_triplets() -> list[TripletResponse]:
    return [
        TripletResponse(
            id=t.id, label=t.label,
            application=_component_to_response(t.application),
            infrastructure=_component_to_response(t.infrastructure),
            network=_component_to_response(t.network),
        )
        for t in catalog.triplets
    ]


@app.get("/api/scenarios")
def list_scenarios() -> list[dict[str, Any]]:
    return [
        {
            "id": s.id,
            "label": s.label,
            "description": s.description,
            "triplet_id": s.triplet_id,
            "severity": s.severity,
            "priority": s.priority,
            "blast_radius": s.blast_radius,
            "sla_breach": s.sla_breach,
            "root_cause": s.root_cause,
        }
        for s in catalog.scenarios
    ]


@app.get("/api/config")
def get_config() -> StreamingConfig:
    return streaming_config


@app.post("/api/config")
def update_config(body: StreamingConfig) -> StreamingConfig:
    global streaming_config
    streaming_config = body
    return streaming_config


def _random_in_range(r: tuple[float, float]) -> float:
    return random.uniform(r[0], r[1]) if r[1] > r[0] else r[0]


def _random_int_in_range(r: tuple[int, int]) -> int:
    return random.randint(r[0], r[1]) if r[1] > r[0] else r[0]


@app.post("/api/emit-random", response_model=EmitRandomResponse)
def emit_random(
    triplet_id: str | None = None,
    severity: str | None = None,
) -> EmitRandomResponse:
    import random as _rand

    active_ids = streaming_config.active_triplet_ids or [t.id for t in catalog.triplets]

    if triplet_id and severity:
        # Manual mode: specific triplet + severity
        candidates = [
            s for s in catalog.scenarios
            if s.triplet_id == triplet_id and s.severity == severity
        ]
        if not candidates:
            raise HTTPException(status_code=404, detail=f"No scenario for {triplet_id}/{severity}")
        scenario = _rand.choice(candidates)
    elif triplet_id:
        # Click on specific triplet, random severity
        scenario = catalog.random_scenario(
            severity_weights=streaming_config.severity_weights,
            active_triplet_ids=[triplet_id],
        )
    else:
        # Full random (streaming mode)
        scenario = catalog.random_scenario(
            severity_weights=streaming_config.severity_weights,
            active_triplet_ids=active_ids,
        )

    triplet = catalog.get_triplet(scenario.triplet_id)
    if not triplet:
        raise HTTPException(status_code=500, detail="Triplet not found")

    incident_id = f"INC-{uuid.uuid4().hex[:8].upper()}"
    correlation_id = str(uuid.uuid4())
    trace_id = uuid.uuid4().hex

    # Randomize impact values within scenario ranges
    users_affected = _random_int_in_range(scenario.estimated_user_impact_range)
    revenue_usd = round(_random_in_range(scenario.estimated_revenue_impact_range), 2)
    mttr_min = round(_random_in_range(scenario.mttr_minutes_range), 1)
    snow_tickets = _random_int_in_range(scenario.servicenow_ticket_range)
    dup_pct = round(_random_in_range(scenario.duplicate_ticket_pct_range), 1)

    # Build shared incident attributes
    incident_attrs: dict[str, object] = {
        "app.domain": triplet.component_for_domain(Domain(scenario.event_sequence[0].domain)).domain.value,
        "app.incident.id": incident_id,
        "app.incident.priority": scenario.priority,
        "app.incident.severity": scenario.severity,
        "app.incident.blast_radius": scenario.blast_radius,
        "app.impact.users_affected": users_affected,
        "app.impact.revenue_usd": revenue_usd,
        "app.impact.sla_breach": scenario.sla_breach,
        "app.impact.mttr_minutes": mttr_min,
        "app.servicenow.ticket_count": snow_tickets,
        "app.servicenow.duplicate_pct": dup_pct,
        "app.triplet.id": scenario.triplet_id,
        "app.incident.root_cause": scenario.root_cause,
        "correlation_id": correlation_id,
    }

    events_emitted: list[IncidentEvent] = []

    for step in scenario.event_sequence:
        component = triplet.component_for_domain(step.domain)
        step_attrs = {
            **incident_attrs,
            "app.component.id": component.id,
            "app.component.type": component.component_type,
            **step.attributes,
        }

        error_event = step.event_key in {"api_error", "frontend_exception", "dns_failure", "packet_loss_alert"}
        base_route = f"/sim/{step.domain.value}/{step.event_key}"

        emitter.emit_incident_trace(
            domain=step.domain.value,
            event=step.event_key,
            label=step.event_label,
            attributes={"trace_id": trace_id, "source_component": f"{step.domain.value}.simulator", "simulator.route": base_route},
            incident_attrs=step_attrs,
            child_name="downstream.call" if error_event else None,
        )
        emitter.emit_log(
            level=logging.ERROR if error_event else logging.INFO,
            message=f"{step.domain.value}::{step.event_key} triggered [{incident_id}]",
            domain=step.domain.value,
            event=step.event_key,
            extra={"route": base_route, **step_attrs},
        )

        latency_ms = 140.0
        if step.domain == Domain.applications:
            latency_ms = 2200.0 if step.event_key == "slow_response" else 420.0 if error_event else 180.0
        elif step.domain == Domain.networking:
            latency_ms = 360.0 if error_event else 210.0
        elif step.domain == Domain.infrastructure:
            latency_ms = 280.0 if step.event_key == "node_resource_pressure" else 170.0

        emitter.emit_metrics(domain=step.domain.value, route=base_route, latency_ms=latency_ms, error=error_event)

        events_emitted.append(IncidentEvent(
            domain=step.domain,
            event_key=step.event_key,
            event_label=step.event_label,
            component_id=component.id,
            severity=scenario.severity,
            trace_id=trace_id,
            correlation_id=correlation_id,
        ))

    # Emit incident-level metrics
    emitter.emit_incident_metrics(
        domain=scenario.event_sequence[0].domain.value,
        severity=scenario.severity,
        priority=scenario.priority,
        service_name=triplet.application.label,
        mttr_minutes=mttr_min,
        revenue_impact_usd=revenue_usd,
        users_affected=users_affected,
    )

    # Blast radius: trigger adjacent triplets with warning events
    effective_blast = max(scenario.blast_radius, streaming_config.blast_radius)
    if effective_blast > 1 and scenario.severity == "critical":
        adjacent = catalog.adjacent_triplets(scenario.triplet_id, count=effective_blast - 1)
        for adj_triplet in adjacent:
            adj_scenarios = [s for s in catalog.scenarios_for_triplet(adj_triplet.id) if s.severity == "warning"]
            if adj_scenarios:
                adj_scenario = _rand.choice(adj_scenarios)
                # Emit just the first step of the adjacent warning scenario
                adj_step = adj_scenario.event_sequence[0]
                adj_component = adj_triplet.component_for_domain(adj_step.domain)
                adj_route = f"/sim/{adj_step.domain.value}/{adj_step.event_key}"
                adj_error = adj_step.event_key in {"api_error", "frontend_exception", "dns_failure", "packet_loss_alert"}
                emitter.emit_incident_trace(
                    domain=adj_step.domain.value,
                    event=adj_step.event_key,
                    label=f"[Blast Radius] {adj_step.event_label}",
                    attributes={"trace_id": trace_id, "source_component": f"{adj_step.domain.value}.simulator", "simulator.route": adj_route},
                    incident_attrs={**incident_attrs, "app.component.id": adj_component.id, "app.component.type": adj_component.component_type},
                )
                emitter.emit_log(
                    level=logging.WARNING,
                    message=f"[Blast Radius] {adj_step.domain.value}::{adj_step.event_key} [{incident_id}]",
                    domain=adj_step.domain.value,
                    event=adj_step.event_key,
                    extra={"route": adj_route, "app.incident.id": incident_id, "blast_radius_source": scenario.triplet_id},
                )
                emitter.emit_metrics(domain=adj_step.domain.value, route=adj_route, latency_ms=250.0, error=adj_error)
                events_emitted.append(IncidentEvent(
                    domain=adj_step.domain,
                    event_key=adj_step.event_key,
                    event_label=f"[Blast Radius] {adj_step.event_label}",
                    component_id=adj_component.id,
                    severity="warning",
                    trace_id=trace_id,
                    correlation_id=correlation_id,
                ))

    emitter.flush()

    return EmitRandomResponse(
        scenario_id=scenario.id,
        scenario_label=scenario.label,
        triplet_id=scenario.triplet_id,
        severity=scenario.severity,
        priority=scenario.priority,
        incident_id=incident_id,
        blast_radius=effective_blast,
        sla_breach=scenario.sla_breach,
        users_affected=users_affected,
        revenue_impact_usd=revenue_usd,
        mttr_minutes=mttr_min,
        root_cause=scenario.root_cause,
        servicenow_tickets=snow_tickets,
        duplicate_ticket_pct=dup_pct,
        events=events_emitted,
    )


@app.get("/")
def root() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")

