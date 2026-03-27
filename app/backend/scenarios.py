from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any

from .models import Domain


@dataclass(frozen=True)
class Component:
    id: str
    label: str
    domain: Domain
    component_type: str
    x: float  # hotspot percentage 0-100
    y: float  # hotspot percentage 0-100
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Triplet:
    id: str
    label: str
    application: Component
    infrastructure: Component
    network: Component

    @property
    def components(self) -> list[Component]:
        return [self.application, self.infrastructure, self.network]

    def component_for_domain(self, domain: Domain) -> Component:
        return {
            Domain.applications: self.application,
            Domain.infrastructure: self.infrastructure,
            Domain.networking: self.network,
        }[domain]


@dataclass(frozen=True)
class EventStep:
    domain: Domain
    event_key: str
    event_label: str
    delay_ms: int = 0
    attributes: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Scenario:
    id: str
    label: str
    description: str
    triplet_id: str
    severity: str  # normal, warning, critical
    priority: str  # P1, P2, P3, P4
    event_sequence: list[EventStep] = field(default_factory=list)
    estimated_user_impact_range: tuple[int, int] = (0, 0)
    estimated_revenue_impact_range: tuple[float, float] = (0.0, 0.0)
    sla_breach: bool = False
    blast_radius: int = 1
    servicenow_ticket_range: tuple[int, int] = (1, 5)
    duplicate_ticket_pct_range: tuple[float, float] = (0.0, 30.0)
    mttr_minutes_range: tuple[float, float] = (5.0, 30.0)
    root_cause: str = ""


# ---------------------------------------------------------------------------
# Default triplets — 6 enterprise applications
# ---------------------------------------------------------------------------

# Hotspot coordinates — percentages of SVG viewBox (1000 x 600)
# CSS transform is translate(0, -50%) so x is the left edge of the dot, y is vertical center.
# No SVG text inside boxes — hotspot labels are the only component names.
#
# Rack A (y=55..195): pods at y-centers 80,120,155 → 13.3%, 20%, 25.8%
# Rack B (y=215..340): pods at y-centers 250,285 → 41.7%, 47.5%
# Rack C (y=365..460): pod at y-center 410 → 68.3%
# App boxes (y=55,128,201,274,347,420, each h=65): centers 87,160,233,306,379,452 → 14.5%,26.7%,38.8%,51%,63.2%,75.3%
# Core switch (y=170..240): center 205 → 34.2%
# Subnet boxes: (345,340)→center 365→60.8%  (510,340)→center 365→60.8%  (425,440)→center 465→77.5%

DEFAULT_TRIPLETS: list[Triplet] = [
    Triplet(
        id="order-mgmt-chain",
        label="Order Management System",
        application=Component(
            id="order-mgmt-api",
            label="Order Management API",
            domain=Domain.applications,
            component_type="api-service",
            x=73.5, y=14.5,
            metadata={"port": 8080, "protocol": "REST"},
        ),
        infrastructure=Component(
            id="k8s-pod-a3",
            label="cluster-a-pod-3",
            domain=Domain.infrastructure,
            component_type="k8s-pod",
            x=4.5, y=13.3,
            metadata={"cluster": "cluster-a", "namespace": "orders"},
        ),
        network=Component(
            id="subnet-1",
            label="10.0.1.0/24",
            domain=Domain.networking,
            component_type="subnet",
            x=35.5, y=60.8,
            metadata={"cidr": "10.0.1.0/24", "vlan": 101},
        ),
    ),
    Triplet(
        id="sap-batch-chain",
        label="SAP Batch Processor",
        application=Component(
            id="sap-batch-proc",
            label="SAP Batch Processor",
            domain=Domain.applications,
            component_type="batch-service",
            x=73.5, y=26.7,
            metadata={"schedule": "*/15 * * * *", "protocol": "IDOC"},
        ),
        infrastructure=Component(
            id="k8s-pod-b7",
            label="cluster-b-pod-7",
            domain=Domain.infrastructure,
            component_type="k8s-pod",
            x=4.5, y=41.7,
            metadata={"cluster": "cluster-b", "namespace": "sap"},
        ),
        network=Component(
            id="subnet-2",
            label="10.0.2.0/24",
            domain=Domain.networking,
            component_type="subnet",
            x=52, y=60.8,
            metadata={"cidr": "10.0.2.0/24", "vlan": 102},
        ),
    ),
    Triplet(
        id="customer-portal-chain",
        label="Customer Portal",
        application=Component(
            id="customer-portal",
            label="Customer Portal",
            domain=Domain.applications,
            component_type="web-app",
            x=73.5, y=38.8,
            metadata={"port": 443, "protocol": "HTTPS"},
        ),
        infrastructure=Component(
            id="k8s-pod-a1",
            label="cluster-a-pod-1",
            domain=Domain.infrastructure,
            component_type="k8s-pod",
            x=4.5, y=20,
            metadata={"cluster": "cluster-a", "namespace": "portal"},
        ),
        network=Component(
            id="switch-core-1",
            label="Core Switch sw-core-01",
            domain=Domain.networking,
            component_type="switch",
            x=38, y=34.2,
            metadata={"model": "Nexus 9300", "ports": 48},
        ),
    ),
    Triplet(
        id="payment-gw-chain",
        label="Payment Gateway",
        application=Component(
            id="payment-gateway",
            label="Payment Gateway",
            domain=Domain.applications,
            component_type="transaction-service",
            x=73.5, y=51,
            metadata={"port": 8443, "protocol": "REST/TLS"},
        ),
        infrastructure=Component(
            id="k8s-pod-c2",
            label="cluster-c-pod-2",
            domain=Domain.infrastructure,
            component_type="k8s-pod",
            x=4.5, y=68.3,
            metadata={"cluster": "cluster-c", "namespace": "payments"},
        ),
        network=Component(
            id="subnet-3",
            label="10.0.3.0/24",
            domain=Domain.networking,
            component_type="subnet",
            x=43.5, y=77.5,
            metadata={"cidr": "10.0.3.0/24", "vlan": 103},
        ),
    ),
    Triplet(
        id="erp-hub-chain",
        label="ERP Integration Hub",
        application=Component(
            id="erp-integration-hub",
            label="ERP Integration Hub",
            domain=Domain.applications,
            component_type="integration-service",
            x=73.5, y=63.2,
            metadata={"protocol": "SOAP/REST", "connectors": 12},
        ),
        infrastructure=Component(
            id="k8s-pod-b2",
            label="cluster-b-pod-2",
            domain=Domain.infrastructure,
            component_type="k8s-pod",
            x=4.5, y=47.5,
            metadata={"cluster": "cluster-b", "namespace": "erp"},
        ),
        network=Component(
            id="subnet-2-erp",
            label="10.0.2.0/24",
            domain=Domain.networking,
            component_type="subnet",
            x=52, y=60.8,
            metadata={"cidr": "10.0.2.0/24", "vlan": 102},
        ),
    ),
    Triplet(
        id="inventory-sync-chain",
        label="Inventory Sync Service",
        application=Component(
            id="inventory-sync",
            label="Inventory Sync",
            domain=Domain.applications,
            component_type="sync-service",
            x=73.5, y=75.3,
            metadata={"protocol": "CDC/Kafka", "lag_threshold_ms": 5000},
        ),
        infrastructure=Component(
            id="k8s-pod-a5",
            label="cluster-a-pod-5",
            domain=Domain.infrastructure,
            component_type="k8s-pod",
            x=4.5, y=25.8,
            metadata={"cluster": "cluster-a", "namespace": "inventory"},
        ),
        network=Component(
            id="subnet-1-inv",
            label="10.0.1.0/24",
            domain=Domain.networking,
            component_type="subnet",
            x=35.5, y=60.8,
            metadata={"cidr": "10.0.1.0/24", "vlan": 101},
        ),
    ),
]

# ---------------------------------------------------------------------------
# Default scenarios — 3 per app (normal / warning / critical)
# ---------------------------------------------------------------------------

DEFAULT_SCENARIOS: list[Scenario] = [
    # --- Order Management API ---
    Scenario(
        id="order-api-normal",
        label="Order API Request",
        description="Normal order processing request through the API.",
        triplet_id="order-mgmt-chain",
        severity="normal",
        priority="P4",
        event_sequence=[
            EventStep(Domain.applications, "api_request", "GET /api/v1/orders", attributes={"http.method": "GET", "http.route": "/api/v1/orders"}),
        ],
        estimated_user_impact_range=(0, 0),
        estimated_revenue_impact_range=(0.0, 0.0),
        mttr_minutes_range=(0.0, 0.0),
        servicenow_ticket_range=(0, 0),
    ),
    Scenario(
        id="order-api-warning",
        label="Order API Slow Response",
        description="Order API experiencing elevated latency due to infrastructure pressure.",
        triplet_id="order-mgmt-chain",
        severity="warning",
        priority="P3",
        event_sequence=[
            EventStep(Domain.applications, "slow_response", "Order API Timeout", attributes={"http.status_code": 504}),
            EventStep(Domain.infrastructure, "node_resource_pressure", "Node CPU Pressure", delay_ms=200, attributes={"resource": "cpu", "utilization_pct": 92}),
        ],
        estimated_user_impact_range=(100, 500),
        estimated_revenue_impact_range=(5000.0, 25000.0),
        mttr_minutes_range=(15.0, 45.0),
        servicenow_ticket_range=(5, 15),
        duplicate_ticket_pct_range=(40.0, 60.0),
        root_cause="Database connection pool exhaustion under peak order volume.",
    ),
    Scenario(
        id="order-api-critical",
        label="Order API 5xx Cascade",
        description="Order API returning 500s, cascading through infrastructure and network.",
        triplet_id="order-mgmt-chain",
        severity="critical",
        priority="P1",
        event_sequence=[
            EventStep(Domain.applications, "api_error", "Order API 500 Error", attributes={"http.status_code": 500}),
            EventStep(Domain.infrastructure, "pod_lifecycle", "Pod CrashLoopBackOff", delay_ms=500, attributes={"restart_count": 5}),
            EventStep(Domain.networking, "packet_loss_alert", "Packet Loss on Order Subnet", delay_ms=800, attributes={"loss_pct": 12.5}),
        ],
        estimated_user_impact_range=(5000, 25000),
        estimated_revenue_impact_range=(100000.0, 500000.0),
        sla_breach=True,
        blast_radius=3,
        servicenow_ticket_range=(30, 50),
        duplicate_ticket_pct_range=(70.0, 90.0),
        mttr_minutes_range=(45.0, 180.0),
        root_cause="Order database primary failover triggered by disk I/O saturation. Connection pool exhausted across all replicas.",
    ),

    # --- SAP Batch Processor ---
    Scenario(
        id="sap-batch-normal",
        label="SAP Batch Job Success",
        description="Scheduled SAP IDOC batch processing completed normally.",
        triplet_id="sap-batch-chain",
        severity="normal",
        priority="P4",
        event_sequence=[
            EventStep(Domain.applications, "api_request", "SAP Batch Execute", attributes={"batch.type": "IDOC", "batch.record_count": 1250}),
        ],
        estimated_user_impact_range=(0, 0),
        estimated_revenue_impact_range=(0.0, 0.0),
        mttr_minutes_range=(0.0, 0.0),
        servicenow_ticket_range=(0, 0),
    ),
    Scenario(
        id="sap-batch-warning",
        label="SAP Batch Queue Delay",
        description="SAP batch queue building up due to infrastructure resource contention.",
        triplet_id="sap-batch-chain",
        severity="warning",
        priority="P2",
        event_sequence=[
            EventStep(Domain.applications, "slow_response", "SAP Batch Queue Delay", attributes={"queue_depth": 450, "batch.type": "IDOC"}),
            EventStep(Domain.infrastructure, "node_resource_pressure", "Memory Pressure on SAP Node", delay_ms=300, attributes={"resource": "memory", "utilization_pct": 88}),
        ],
        estimated_user_impact_range=(200, 800),
        estimated_revenue_impact_range=(10000.0, 50000.0),
        mttr_minutes_range=(20.0, 60.0),
        servicenow_ticket_range=(10, 20),
        duplicate_ticket_pct_range=(50.0, 70.0),
        root_cause="SAP IDOC processing queue backed up due to memory pressure on batch node.",
    ),
    Scenario(
        id="sap-batch-critical",
        label="ERP SAP Connector Batch Sync Overload",
        description="SAP batch sync completely stalled, IDOC queue saturated across all layers.",
        triplet_id="sap-batch-chain",
        severity="critical",
        priority="P1",
        event_sequence=[
            EventStep(Domain.applications, "api_error", "SAP Batch Sync Failure", attributes={"batch.type": "IDOC", "error": "queue_saturated"}),
            EventStep(Domain.infrastructure, "pod_lifecycle", "SAP Pod OOMKilled", delay_ms=400, attributes={"reason": "OOMKilled", "restart_count": 8}),
            EventStep(Domain.networking, "subnet_latency_spike", "SAP Subnet Latency Spike", delay_ms=700, attributes={"latency_ms": 850}),
        ],
        estimated_user_impact_range=(800, 5000),
        estimated_revenue_impact_range=(50000.0, 250000.0),
        sla_breach=True,
        blast_radius=4,
        servicenow_ticket_range=(15, 30),
        duplicate_ticket_pct_range=(60.0, 85.0),
        mttr_minutes_range=(60.0, 240.0),
        root_cause="SAP IDOC processing queue saturated during nightly batch sync overlap with incoming order intake. Connection pool exhausted on erp-sap-connector.",
    ),

    # --- Customer Portal ---
    Scenario(
        id="portal-normal",
        label="Portal Page Load",
        description="Normal customer portal page load and session creation.",
        triplet_id="customer-portal-chain",
        severity="normal",
        priority="P4",
        event_sequence=[
            EventStep(Domain.applications, "api_request", "Portal Page Load", attributes={"http.method": "GET", "http.route": "/portal/dashboard"}),
        ],
        estimated_user_impact_range=(0, 0),
        estimated_revenue_impact_range=(0.0, 0.0),
        mttr_minutes_range=(0.0, 0.0),
        servicenow_ticket_range=(0, 0),
    ),
    Scenario(
        id="portal-warning",
        label="Portal Session Errors",
        description="Customer portal experiencing session timeout issues.",
        triplet_id="customer-portal-chain",
        severity="warning",
        priority="P3",
        event_sequence=[
            EventStep(Domain.applications, "frontend_exception", "Portal Session Timeout", attributes={"error.type": "SessionExpired"}),
            EventStep(Domain.infrastructure, "deployment_rollout", "Portal Pod Rolling Update", delay_ms=250, attributes={"rollout.strategy": "rolling"}),
        ],
        estimated_user_impact_range=(300, 1200),
        estimated_revenue_impact_range=(8000.0, 40000.0),
        mttr_minutes_range=(10.0, 30.0),
        servicenow_ticket_range=(8, 18),
        duplicate_ticket_pct_range=(45.0, 65.0),
        root_cause="Session store Redis instance hit max memory, evicting active sessions.",
    ),
    Scenario(
        id="portal-critical",
        label="Portal Complete Outage",
        description="Customer portal fully unreachable, DNS and infrastructure failure.",
        triplet_id="customer-portal-chain",
        severity="critical",
        priority="P1",
        event_sequence=[
            EventStep(Domain.applications, "frontend_exception", "Portal Unreachable", attributes={"error.type": "NetworkError"}),
            EventStep(Domain.infrastructure, "pod_lifecycle", "Portal Pods Evicted", delay_ms=300, attributes={"reason": "Evicted", "restart_count": 0}),
            EventStep(Domain.networking, "dns_failure", "Portal DNS Failure", delay_ms=600, attributes={"dns.query": "portal.internal.corp"}),
        ],
        estimated_user_impact_range=(10000, 50000),
        estimated_revenue_impact_range=(200000.0, 800000.0),
        sla_breach=True,
        blast_radius=5,
        servicenow_ticket_range=(40, 60),
        duplicate_ticket_pct_range=(75.0, 92.0),
        mttr_minutes_range=(30.0, 120.0),
        root_cause="DNS resolver cache poisoning caused portal.internal.corp to resolve to stale IP. All portal pods evicted during node drain.",
    ),

    # --- Payment Gateway ---
    Scenario(
        id="payment-normal",
        label="Payment Transaction",
        description="Normal payment authorization and settlement.",
        triplet_id="payment-gw-chain",
        severity="normal",
        priority="P4",
        event_sequence=[
            EventStep(Domain.applications, "api_request", "Payment Authorization", attributes={"http.method": "POST", "http.route": "/api/v1/payments/authorize"}),
        ],
        estimated_user_impact_range=(0, 0),
        estimated_revenue_impact_range=(0.0, 0.0),
        mttr_minutes_range=(0.0, 0.0),
        servicenow_ticket_range=(0, 0),
    ),
    Scenario(
        id="payment-warning",
        label="Payment Auth Timeout",
        description="Payment authorization timeouts increasing, infrastructure under pressure.",
        triplet_id="payment-gw-chain",
        severity="warning",
        priority="P2",
        event_sequence=[
            EventStep(Domain.applications, "slow_response", "Payment Auth Timeout", attributes={"http.status_code": 504, "timeout_ms": 30000}),
            EventStep(Domain.infrastructure, "node_resource_pressure", "Payment Node CPU Spike", delay_ms=200, attributes={"resource": "cpu", "utilization_pct": 95}),
        ],
        estimated_user_impact_range=(500, 2000),
        estimated_revenue_impact_range=(25000.0, 100000.0),
        mttr_minutes_range=(15.0, 45.0),
        servicenow_ticket_range=(12, 25),
        duplicate_ticket_pct_range=(55.0, 75.0),
        root_cause="Payment processor upstream rate limiting triggered by burst traffic during flash sale.",
    ),
    Scenario(
        id="payment-critical",
        label="Payment Gateway Down",
        description="Complete payment processing failure across all channels.",
        triplet_id="payment-gw-chain",
        severity="critical",
        priority="P1",
        event_sequence=[
            EventStep(Domain.applications, "api_error", "Payment Processing Failure", attributes={"http.status_code": 503, "error": "circuit_breaker_open"}),
            EventStep(Domain.infrastructure, "cluster_autoscaler", "Payment Cluster Scale Failure", delay_ms=400, attributes={"scale_action": "up", "error": "insufficient_capacity"}),
            EventStep(Domain.networking, "packet_loss_alert", "Payment Network Partition", delay_ms=700, attributes={"loss_pct": 35.0}),
        ],
        estimated_user_impact_range=(15000, 50000),
        estimated_revenue_impact_range=(300000.0, 1000000.0),
        sla_breach=True,
        blast_radius=5,
        servicenow_ticket_range=(35, 55),
        duplicate_ticket_pct_range=(80.0, 95.0),
        mttr_minutes_range=(60.0, 180.0),
        root_cause="Payment HSM cluster lost quorum after network partition. All payment authorization requests failing with circuit breaker open.",
    ),

    # --- ERP Integration Hub ---
    Scenario(
        id="erp-hub-normal",
        label="ERP Connector Sync",
        description="Normal ERP data synchronization via integration hub.",
        triplet_id="erp-hub-chain",
        severity="normal",
        priority="P4",
        event_sequence=[
            EventStep(Domain.applications, "api_request", "ERP Data Sync", attributes={"connector": "sap-s4", "sync.type": "incremental"}),
        ],
        estimated_user_impact_range=(0, 0),
        estimated_revenue_impact_range=(0.0, 0.0),
        mttr_minutes_range=(0.0, 0.0),
        servicenow_ticket_range=(0, 0),
    ),
    Scenario(
        id="erp-hub-warning",
        label="ERP Connector Timeout",
        description="ERP integration hub connector experiencing timeouts.",
        triplet_id="erp-hub-chain",
        severity="warning",
        priority="P3",
        event_sequence=[
            EventStep(Domain.applications, "slow_response", "ERP Connector Timeout", attributes={"connector": "sap-s4", "timeout_ms": 60000}),
            EventStep(Domain.infrastructure, "node_resource_pressure", "ERP Hub Memory Pressure", delay_ms=300, attributes={"resource": "memory", "utilization_pct": 85}),
        ],
        estimated_user_impact_range=(50, 300),
        estimated_revenue_impact_range=(5000.0, 30000.0),
        mttr_minutes_range=(10.0, 40.0),
        servicenow_ticket_range=(5, 12),
        duplicate_ticket_pct_range=(30.0, 50.0),
        root_cause="ERP S/4HANA connector thread pool exhausted due to large batch materialization.",
    ),
    Scenario(
        id="erp-hub-critical",
        label="Contract Pricing Engine Calculation Timeout",
        description="ERP pricing engine completely unresponsive, blocking all order processing.",
        triplet_id="erp-hub-chain",
        severity="critical",
        priority="P1",
        event_sequence=[
            EventStep(Domain.applications, "api_error", "Pricing Engine Failure", attributes={"connector": "pricing-engine", "error": "calculation_timeout"}),
            EventStep(Domain.infrastructure, "pod_lifecycle", "ERP Hub Pod Restart Storm", delay_ms=500, attributes={"restart_count": 12, "reason": "CrashLoopBackOff"}),
            EventStep(Domain.networking, "dns_failure", "ERP DNS Resolution Failure", delay_ms=800, attributes={"dns.query": "erp-pricing.internal.corp"}),
        ],
        estimated_user_impact_range=(2000, 10000),
        estimated_revenue_impact_range=(100000.0, 400000.0),
        sla_breach=True,
        blast_radius=4,
        servicenow_ticket_range=(20, 40),
        duplicate_ticket_pct_range=(65.0, 85.0),
        mttr_minutes_range=(45.0, 150.0),
        root_cause="Contract pricing calculation engine deadlock on concurrent materialized view refresh. All downstream pricing requests timing out.",
    ),

    # --- Inventory Sync Service ---
    Scenario(
        id="inv-sync-normal",
        label="Inventory CDC Event",
        description="Normal CDC replication event for inventory data.",
        triplet_id="inventory-sync-chain",
        severity="normal",
        priority="P4",
        event_sequence=[
            EventStep(Domain.applications, "api_request", "Inventory CDC Replicate", attributes={"cdc.source": "inventory_db", "cdc.events": 85}),
        ],
        estimated_user_impact_range=(0, 0),
        estimated_revenue_impact_range=(0.0, 0.0),
        mttr_minutes_range=(0.0, 0.0),
        servicenow_ticket_range=(0, 0),
    ),
    Scenario(
        id="inv-sync-warning",
        label="Inventory Sync Lag",
        description="CDC replication lag increasing, inventory data becoming stale.",
        triplet_id="inventory-sync-chain",
        severity="warning",
        priority="P3",
        event_sequence=[
            EventStep(Domain.applications, "slow_response", "Inventory Sync Lag", attributes={"cdc.lag_ms": 12000, "cdc.source": "inventory_db"}),
            EventStep(Domain.infrastructure, "cluster_autoscaler", "Inventory Node Scale-Up", delay_ms=200, attributes={"scale_action": "up", "target_nodes": 3}),
        ],
        estimated_user_impact_range=(100, 600),
        estimated_revenue_impact_range=(3000.0, 20000.0),
        mttr_minutes_range=(10.0, 35.0),
        servicenow_ticket_range=(3, 10),
        duplicate_ticket_pct_range=(25.0, 45.0),
        root_cause="Kafka consumer group rebalancing caused CDC lag spike during partition reassignment.",
    ),
    Scenario(
        id="inv-sync-critical",
        label="Inventory Replication Failure",
        description="Complete inventory CDC failure, data divergence between systems.",
        triplet_id="inventory-sync-chain",
        severity="critical",
        priority="P2",
        event_sequence=[
            EventStep(Domain.applications, "api_error", "Inventory Replication Failure", attributes={"cdc.source": "inventory_db", "error": "replication_broken"}),
            EventStep(Domain.infrastructure, "pod_lifecycle", "Inventory Sync Pod Failed", delay_ms=300, attributes={"reason": "Error", "restart_count": 3}),
            EventStep(Domain.networking, "subnet_latency_spike", "Inventory Network Congestion", delay_ms=600, attributes={"latency_ms": 450}),
        ],
        estimated_user_impact_range=(1000, 5000),
        estimated_revenue_impact_range=(50000.0, 200000.0),
        sla_breach=True,
        blast_radius=3,
        servicenow_ticket_range=(15, 25),
        duplicate_ticket_pct_range=(55.0, 75.0),
        mttr_minutes_range=(30.0, 90.0),
        root_cause="Kafka broker disk full caused CDC offset commit failure. Inventory data divergence between source and target systems.",
    ),
]


class ScenarioCatalog:
    def __init__(
        self,
        triplets: list[Triplet] | None = None,
        scenarios: list[Scenario] | None = None,
    ) -> None:
        self.triplets = triplets or list(DEFAULT_TRIPLETS)
        self.scenarios = scenarios or list(DEFAULT_SCENARIOS)
        self._triplet_map = {t.id: t for t in self.triplets}
        self._scenario_map = {s.id: s for s in self.scenarios}
        self._by_triplet: dict[str, list[Scenario]] = {}
        for s in self.scenarios:
            self._by_triplet.setdefault(s.triplet_id, []).append(s)

    def get_triplet(self, triplet_id: str) -> Triplet | None:
        return self._triplet_map.get(triplet_id)

    def scenarios_for_triplet(self, triplet_id: str) -> list[Scenario]:
        return self._by_triplet.get(triplet_id, [])

    def random_scenario(
        self,
        severity_weights: dict[str, float] | None = None,
        active_triplet_ids: list[str] | None = None,
    ) -> Scenario:
        weights = severity_weights or {"normal": 0.75, "warning": 0.15, "critical": 0.10}
        active_ids = set(active_triplet_ids) if active_triplet_ids else {t.id for t in self.triplets}

        # Pick severity
        severities = list(weights.keys())
        probs = [weights[s] for s in severities]
        chosen_severity = random.choices(severities, weights=probs, k=1)[0]

        # Filter matching scenarios
        candidates = [
            s for s in self.scenarios
            if s.severity == chosen_severity and s.triplet_id in active_ids
        ]
        if not candidates:
            candidates = [s for s in self.scenarios if s.triplet_id in active_ids]

        return random.choice(candidates)

    def adjacent_triplets(self, triplet_id: str, count: int = 1) -> list[Triplet]:
        ids = [t.id for t in self.triplets]
        if triplet_id not in ids:
            return []
        idx = ids.index(triplet_id)
        adjacent = []
        for offset in [1, -1, 2, -2]:
            adj_idx = (idx + offset) % len(ids)
            if ids[adj_idx] != triplet_id:
                adjacent.append(self.triplets[adj_idx])
            if len(adjacent) >= count:
                break
        return adjacent

    def all_components(self) -> list[Component]:
        seen: set[str] = set()
        result: list[Component] = []
        for t in self.triplets:
            for c in t.components:
                if c.id not in seen:
                    seen.add(c.id)
                    result.append(c)
        return result
