from __future__ import annotations

import logging
import os
from dataclasses import dataclass

from opentelemetry import _logs as otel_logs
from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import SimpleLogRecordProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor


@dataclass(frozen=True)
class EmitterConfig:
    databricks_host: str
    databricks_token: str
    service_name: str
    spans_table: str
    logs_table: str
    metrics_table: str

    @classmethod
    def from_env(cls) -> "EmitterConfig":
        import logging
        logger = logging.getLogger(__name__)

        # Try explicit token, then SDK default auth (Databricks Apps runtime)
        token = os.getenv("DATABRICKS_TOKEN", "")
        if not token:
            try:
                from databricks.sdk import WorkspaceClient
                w = WorkspaceClient()
                # Use the SDK's token provider for Apps SP auth
                header = w.config.authenticate()
                if header and "Authorization" in header:
                    token = header["Authorization"].replace("Bearer ", "")
                logger.info(f"Got token from Databricks SDK: {bool(token)}")
            except Exception as e:
                logger.warning(f"SDK auth fallback failed: {e}")

        required = {
            "DATABRICKS_HOST": os.getenv("DATABRICKS_HOST", ""),
            "OTEL_SERVICE_NAME": os.getenv("OTEL_SERVICE_NAME", ""),
            "OTEL_SPANS_TABLE": os.getenv("OTEL_SPANS_TABLE", ""),
            "OTEL_LOGS_TABLE": os.getenv("OTEL_LOGS_TABLE", ""),
            "OTEL_METRICS_TABLE": os.getenv("OTEL_METRICS_TABLE", ""),
        }
        missing = [k for k, v in required.items() if not v]
        if not token:
            missing.insert(0, "DATABRICKS_TOKEN")
        if missing:
            raise ValueError(f"Missing required .env keys: {', '.join(missing)}")

        return cls(
            databricks_host=required["DATABRICKS_HOST"].rstrip("/"),
            databricks_token=token,
            service_name=required["OTEL_SERVICE_NAME"],
            spans_table=required["OTEL_SPANS_TABLE"],
            logs_table=required["OTEL_LOGS_TABLE"],
            metrics_table=required["OTEL_METRICS_TABLE"],
        )


class OTelEmitter:
    def __init__(self, cfg: EmitterConfig) -> None:
        self.cfg = cfg
        self.traces_endpoint = f"{cfg.databricks_host}/api/2.0/tracing/otel/v1/traces"
        self.logs_endpoint = f"{cfg.databricks_host}/api/2.0/tracing/otel/v1/logs"
        self.metrics_endpoint = f"{cfg.databricks_host}/api/2.0/otel/v1/metrics"

        resource = Resource.create(
            {
                "service.name": cfg.service_name,
                "service.version": "0.1.0",
                "deployment.environment": "local-simulator",
            }
        )

        span_exporter = OTLPSpanExporter(
            endpoint=self.traces_endpoint, headers=self._headers(cfg.spans_table)
        )
        self.tracer_provider = TracerProvider(resource=resource)
        self.tracer_provider.add_span_processor(SimpleSpanProcessor(span_exporter))
        self.tracer = self.tracer_provider.get_tracer(cfg.service_name)

        log_exporter = OTLPLogExporter(
            endpoint=self.logs_endpoint, headers=self._headers(cfg.logs_table)
        )
        self.logger_provider = LoggerProvider(resource=resource)
        self.logger_provider.add_log_record_processor(SimpleLogRecordProcessor(log_exporter))
        self.otel_handler = LoggingHandler(
            level=logging.INFO, logger_provider=self.logger_provider
        )
        self.logger = logging.getLogger(f"{cfg.service_name}.simulator")
        self.logger.handlers = []
        self.logger.addHandler(self.otel_handler)
        self.logger.setLevel(logging.INFO)

        metric_exporter = OTLPMetricExporter(
            endpoint=self.metrics_endpoint, headers=self._headers(cfg.metrics_table)
        )
        # Keep periodic export effectively disabled; metrics are exported on interaction
        # when flush() is called from the simulator emit endpoint.
        self.metric_reader = PeriodicExportingMetricReader(
            metric_exporter, export_interval_millis=86_400_000
        )
        self.meter_provider = MeterProvider(
            resource=resource, metric_readers=[self.metric_reader]
        )
        self.meter = self.meter_provider.get_meter(cfg.service_name)

        self.error_counter = self.meter.create_counter(
            "app.error_count", description="Total simulated errors", unit="errors"
        )
        self.latency_hist = self.meter.create_histogram(
            "app.request_latency_ms",
            description="Simulated request latency",
            unit="ms",
        )
        self.incident_counter = self.meter.create_counter(
            "app.incident.count", description="Total incidents", unit="incidents"
        )
        self.mttr_hist = self.meter.create_histogram(
            "app.incident.mttr_minutes",
            description="Mean time to resolve",
            unit="min",
        )
        self.revenue_hist = self.meter.create_histogram(
            "app.incident.revenue_impact_usd",
            description="Revenue impact per incident",
            unit="USD",
        )
        self.users_hist = self.meter.create_histogram(
            "app.incident.users_affected",
            description="Users affected per incident",
            unit="users",
        )

    def _headers(self, table_name: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.cfg.databricks_token}",
            "X-Databricks-UC-Table-Name": table_name,
            "X-Databricks-Workspace-Url": self.cfg.databricks_host,
        }

    def emit_trace(
        self,
        *,
        domain: str,
        event: str,
        label: str,
        attributes: dict[str, object],
        child_name: str | None = None,
    ) -> None:
        with self.tracer.start_as_current_span(
            name=label,
            attributes={"domain": domain, "event": event, **attributes},
        ) as parent:
            parent.add_event("simulator.triggered", {"event.label": label})
            if child_name:
                with self.tracer.start_as_current_span(
                    child_name, attributes={"component": child_name, **attributes}
                ) as child:
                    child.add_event("simulator.child_step")

    def emit_log(
        self,
        *,
        level: int,
        message: str,
        domain: str,
        event: str,
        extra: dict[str, object] | None = None,
    ) -> None:
        payload = {"domain": domain, "event": event}
        if extra:
            payload.update(extra)
        self.logger.log(level, message, extra=payload)

    def emit_metrics(
        self,
        *,
        domain: str,
        route: str,
        latency_ms: float,
        error: bool = False,
    ) -> None:
        attrs = {"domain": domain, "route": route}
        self.latency_hist.record(latency_ms, attrs)
        if error:
            self.error_counter.add(1, attrs)

    def emit_incident_trace(
        self,
        *,
        domain: str,
        event: str,
        label: str,
        attributes: dict[str, object],
        incident_attrs: dict[str, object],
        child_name: str | None = None,
    ) -> None:
        merged = {**attributes, **incident_attrs}
        self.emit_trace(
            domain=domain,
            event=event,
            label=label,
            attributes=merged,
            child_name=child_name,
        )

    def emit_incident_metrics(
        self,
        *,
        domain: str,
        severity: str,
        priority: str,
        service_name: str,
        mttr_minutes: float,
        revenue_impact_usd: float,
        users_affected: int,
    ) -> None:
        attrs = {
            "app.domain": domain,
            "app.incident.severity": severity,
            "app.incident.priority": priority,
            "service.name": service_name,
        }
        self.incident_counter.add(1, attrs)
        if mttr_minutes > 0:
            self.mttr_hist.record(mttr_minutes, attrs)
        if revenue_impact_usd > 0:
            self.revenue_hist.record(revenue_impact_usd, attrs)
        if users_affected > 0:
            self.users_hist.record(float(users_affected), attrs)

    def flush(self) -> None:
        self.tracer_provider.force_flush(timeout_millis=10000)
        self.logger_provider.force_flush(timeout_millis=10000)
        self.metric_reader.collect(timeout_millis=10000)
        self.meter_provider.force_flush(timeout_millis=10000)

