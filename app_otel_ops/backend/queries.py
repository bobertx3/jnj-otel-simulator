"""SQL queries for the EO Operational Dashboard."""

from __future__ import annotations

RANGE_MAP = {
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "all": 525600,
    "6h": 360,
    "24h": 1440,
}

# Derive domain from component type since app.domain is set to the first step's
# domain (always 'applications') rather than per-component.
DOMAIN_CASE = """
CASE
  WHEN attributes:['app.component.type']::STRING IN ('k8s-pod') THEN 'infrastructure'
  WHEN attributes:['app.component.type']::STRING IN ('subnet', 'switch') THEN 'networking'
  ELSE 'applications'
END
"""


def parse_range(range_str: str) -> int:
    """Convert a range string like '30m' to minutes. Default 30."""
    return RANGE_MAP.get(range_str, 30)


def kpi_query(spans_table: str, minutes: int) -> str:
    return f"""
SELECT
  COUNT(*) AS total_spans,
  COUNT(DISTINCT attributes:['app.incident.id']::STRING) AS active_incidents,
  SUM(CASE WHEN attributes:['app.incident.severity']::STRING = 'critical' THEN 1 ELSE 0 END) AS critical_alerts,
  ROUND(COUNT(*) / GREATEST(TIMESTAMPDIFF(SECOND, MIN(time), MAX(time)) / 60.0, 1), 1) AS events_per_min
FROM {spans_table}
WHERE time >= current_timestamp() - INTERVAL {minutes} MINUTES
"""


def domain_overview_query(spans_table: str, minutes: int) -> str:
    return f"""
SELECT
  attributes:['app.component.id']::STRING AS component_id,
  {DOMAIN_CASE} AS domain,
  attributes:['app.triplet.id']::STRING AS triplet_id,
  attributes:['app.component.type']::STRING AS component_type,
  MAX(attributes:['app.incident.severity']::STRING) AS worst_severity,
  COUNT(*) AS event_count,
  COUNT(DISTINCT attributes:['app.incident.id']::STRING) AS incident_count,
  MAX(attributes:['app.incident.priority']::STRING) AS worst_priority,
  ROUND(AVG(CAST(attributes:['app.impact.revenue_usd']::STRING AS DOUBLE)), 0) AS avg_revenue_impact,
  ROUND(AVG(CAST(attributes:['app.impact.users_affected']::STRING AS DOUBLE)), 0) AS avg_users_affected,
  MAX(time) AS last_seen
FROM {spans_table}
WHERE time >= current_timestamp() - INTERVAL {minutes} MINUTES
  AND attributes:['app.component.id'] IS NOT NULL
GROUP BY 1, 2, 3, 4
ORDER BY
  CASE MAX(attributes:['app.incident.severity']::STRING)
    WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
  COUNT(*) DESC
"""


def component_detail_query(spans_table: str, component_id: str, minutes: int) -> str:
    safe_id = component_id.replace("'", "''")
    return f"""
SELECT
  time,
  name AS span_name,
  attributes:['app.incident.id']::STRING AS incident_id,
  attributes:['app.incident.severity']::STRING AS severity,
  attributes:['app.incident.priority']::STRING AS priority,
  attributes:['app.incident.root_cause']::STRING AS root_cause,
  attributes:['app.impact.users_affected']::STRING AS users_affected,
  attributes:['app.impact.revenue_usd']::STRING AS revenue_usd,
  attributes:['app.impact.sla_breach']::STRING AS sla_breach,
  attributes:['app.impact.mttr_minutes']::STRING AS mttr_minutes
FROM {spans_table}
WHERE attributes:['app.component.id']::STRING = '{safe_id}'
  AND time >= current_timestamp() - INTERVAL {minutes} MINUTES
ORDER BY time DESC
LIMIT 50
"""


def recent_events_query(spans_table: str, minutes: int, limit: int = 50) -> str:
    return f"""
SELECT
  time,
  name AS span_name,
  {DOMAIN_CASE} AS domain,
  attributes:['app.component.id']::STRING AS component_id,
  attributes:['app.incident.id']::STRING AS incident_id,
  attributes:['app.incident.severity']::STRING AS severity,
  attributes:['app.incident.priority']::STRING AS priority
FROM {spans_table}
WHERE time >= current_timestamp() - INTERVAL {minutes} MINUTES
ORDER BY time DESC
LIMIT {limit}
"""
