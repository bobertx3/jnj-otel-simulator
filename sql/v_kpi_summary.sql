-- View: Rolling KPI summary (last 30 minutes)
-- Usage: SELECT * FROM bx3.otel_demo.v_kpi_summary

CREATE OR REPLACE VIEW bx3.otel_demo.v_kpi_summary AS
SELECT
  COUNT(*) AS total_spans,
  COUNT(DISTINCT attributes:['app.incident.id']::STRING) AS active_incidents,
  SUM(CASE WHEN attributes:['app.incident.severity']::STRING = 'critical' THEN 1 ELSE 0 END) AS critical_alerts,
  ROUND(COUNT(*) / GREATEST(TIMESTAMPDIFF(SECOND, MIN(time), MAX(time)) / 60.0, 1), 1) AS events_per_min,
  ROUND(SUM(CAST(attributes:['app.impact.revenue_usd']::STRING AS DOUBLE)), 2) AS total_revenue_impact,
  ROUND(SUM(CAST(attributes:['app.impact.users_affected']::STRING AS DOUBLE)), 0) AS total_users_affected,
  SUM(CASE WHEN attributes:['app.impact.sla_breach']::STRING = 'true' THEN 1 ELSE 0 END) AS sla_breaches,
  ROUND(AVG(CAST(attributes:['app.impact.mttr_minutes']::STRING AS DOUBLE)), 1) AS avg_mttr_minutes
FROM bx3.otel_demo.otel_spans_v2
WHERE time >= current_timestamp() - INTERVAL 30 MINUTES;
