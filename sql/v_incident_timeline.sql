-- View: Incident timeline with impact details
-- Usage: SELECT * FROM bx3.otel_demo.v_incident_timeline ORDER BY first_seen DESC

CREATE OR REPLACE VIEW bx3.otel_demo.v_incident_timeline AS
SELECT
  attributes:['app.incident.id']::STRING AS incident_id,
  attributes:['app.incident.severity']::STRING AS severity,
  attributes:['app.incident.priority']::STRING AS priority,
  attributes:['app.triplet.id']::STRING AS triplet_id,
  attributes:['app.incident.root_cause']::STRING AS root_cause,
  MIN(time) AS first_seen,
  MAX(time) AS last_seen,
  COUNT(*) AS event_count,
  COUNT(DISTINCT attributes:['app.component.id']::STRING) AS components_affected,
  MAX(CAST(attributes:['app.impact.revenue_usd']::STRING AS DOUBLE)) AS max_revenue_impact,
  MAX(CAST(attributes:['app.impact.users_affected']::STRING AS DOUBLE)) AS max_users_affected,
  MAX(CAST(attributes:['app.impact.mttr_minutes']::STRING AS DOUBLE)) AS mttr_minutes,
  MAX(attributes:['app.impact.sla_breach']::STRING) AS sla_breach
FROM bx3.otel_demo.otel_spans_v2
WHERE time >= current_timestamp() - INTERVAL 1 HOUR
  AND attributes:['app.incident.id'] IS NOT NULL
GROUP BY 1, 2, 3, 4, 5;
