-- View: Component status rollup
-- Derives domain from component type (since app.domain is set per-incident, not per-step)
-- Usage: SELECT * FROM bx3.otel_demo.v_component_status

CREATE OR REPLACE VIEW bx3.otel_demo.v_component_status AS
SELECT
  attributes:['app.component.id']::STRING AS component_id,
  CASE
    WHEN attributes:['app.component.type']::STRING IN ('k8s-pod') THEN 'infrastructure'
    WHEN attributes:['app.component.type']::STRING IN ('subnet', 'switch') THEN 'networking'
    ELSE 'applications'
  END AS domain,
  attributes:['app.component.type']::STRING AS component_type,
  attributes:['app.triplet.id']::STRING AS triplet_id,
  MAX(attributes:['app.incident.severity']::STRING) AS worst_severity,
  MAX(attributes:['app.incident.priority']::STRING) AS worst_priority,
  COUNT(*) AS event_count,
  COUNT(DISTINCT attributes:['app.incident.id']::STRING) AS incident_count,
  SUM(CASE WHEN attributes:['app.incident.severity']::STRING = 'critical' THEN 1 ELSE 0 END) AS critical_count,
  SUM(CASE WHEN attributes:['app.incident.severity']::STRING = 'warning' THEN 1 ELSE 0 END) AS warning_count,
  ROUND(AVG(CAST(attributes:['app.impact.revenue_usd']::STRING AS DOUBLE)), 2) AS avg_revenue_impact,
  ROUND(AVG(CAST(attributes:['app.impact.users_affected']::STRING AS DOUBLE)), 0) AS avg_users_affected,
  ROUND(AVG(CAST(attributes:['app.impact.mttr_minutes']::STRING AS DOUBLE)), 1) AS avg_mttr_minutes,
  SUM(CASE WHEN attributes:['app.impact.sla_breach']::STRING = 'true' THEN 1 ELSE 0 END) AS sla_breaches,
  MAX(time) AS last_event_time
FROM bx3.otel_demo.otel_spans_v2
WHERE time >= current_timestamp() - INTERVAL 1 HOUR
  AND attributes:['app.component.id'] IS NOT NULL
GROUP BY 1, 2, 3, 4;
