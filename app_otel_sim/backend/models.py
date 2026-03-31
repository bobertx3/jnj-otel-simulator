from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class Domain(str, Enum):
    infrastructure = "infrastructure"
    networking = "networking"
    applications = "applications"


class EventDefinition(BaseModel):
    key: str
    label: str
    description: str
    business_impact: str


class EmitResponse(BaseModel):
    status: str = "ok"
    domain: Domain
    event: str
    label: str
    severity: str
    source_component: str
    correlation_id: str
    trace_id: str
    signal_types: list[str]
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    telemetry_summary: dict[str, Any]
    raw_telemetry: dict[str, Any]


class Severity(str, Enum):
    normal = "normal"
    warning = "warning"
    critical = "critical"


class Priority(str, Enum):
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"
    P4 = "P4"


class StreamingConfig(BaseModel):
    interval_ms: int = 2000
    blast_radius: int = 2
    severity_weights: dict[str, float] = Field(
        default_factory=lambda: {"normal": 0.75, "warning": 0.15, "critical": 0.10}
    )
    active_triplet_ids: list[str] = Field(default_factory=list)


class ComponentResponse(BaseModel):
    id: str
    label: str
    domain: Domain
    component_type: str
    x: float
    y: float
    metadata: dict[str, Any] = Field(default_factory=dict)


class TripletResponse(BaseModel):
    id: str
    label: str
    application: ComponentResponse
    infrastructure: ComponentResponse
    network: ComponentResponse


class IncidentEvent(BaseModel):
    domain: Domain
    event_key: str
    event_label: str
    component_id: str
    severity: str
    trace_id: str
    correlation_id: str


class EmitRandomResponse(BaseModel):
    status: str = "ok"
    scenario_id: str
    scenario_label: str
    triplet_id: str
    severity: str
    priority: str
    incident_id: str
    blast_radius: int
    sla_breach: bool
    users_affected: int
    revenue_impact_usd: float
    mttr_minutes: float
    root_cause: str
    servicenow_tickets: int
    duplicate_ticket_pct: float
    events: list[IncidentEvent]
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class GenieAskRequest(BaseModel):
    question: str
    conversation_id: str | None = None


class GenieAskResponse(BaseModel):
    status: str
    question: str
    conversation_id: str
    message_id: str
    text_response: str | None = None
    sql_query: str | None = None
    rows: list[dict[str, Any]] = Field(default_factory=list)

