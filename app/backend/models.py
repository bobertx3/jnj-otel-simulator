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

