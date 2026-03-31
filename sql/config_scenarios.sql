-- Config table for scenario definitions with impact ranges
-- Each row defines one incident scenario for a triplet at a given severity

CREATE TABLE IF NOT EXISTS bx3.otel_demo.config_scenarios (
  scenario_id       STRING NOT NULL,
  triplet_id        STRING NOT NULL,
  label             STRING NOT NULL,
  description       STRING,
  severity          STRING NOT NULL,   -- normal, warning, critical
  priority          STRING NOT NULL,   -- P1, P2, P3, P4
  -- Impact ranges
  revenue_min       DOUBLE DEFAULT 0,
  revenue_max       DOUBLE DEFAULT 0,
  users_min         INT DEFAULT 0,
  users_max         INT DEFAULT 0,
  mttr_min          DOUBLE DEFAULT 5,
  mttr_max          DOUBLE DEFAULT 30,
  -- Incident properties
  sla_breach        BOOLEAN DEFAULT false,
  blast_radius      INT DEFAULT 1,
  snow_tickets_min  INT DEFAULT 1,
  snow_tickets_max  INT DEFAULT 5,
  root_cause        STRING,
  -- Metadata
  enabled           BOOLEAN DEFAULT true,
  updated_at        TIMESTAMP DEFAULT current_timestamp()
);

-- Seed defaults
TRUNCATE TABLE bx3.otel_demo.config_scenarios;

INSERT INTO bx3.otel_demo.config_scenarios VALUES
-- Order Management
('order-normal', 'order-mgmt-chain', 'Order API Request', 'Normal order processing', 'normal', 'P4',
 0, 0, 0, 0, 5, 15, false, 1, 1, 3, 'N/A', true, current_timestamp()),
('order-warning', 'order-mgmt-chain', 'Order API Slow Response', 'Elevated latency due to infra pressure', 'warning', 'P3',
 5000, 25000, 100, 500, 15, 45, false, 1, 5, 15, 'Database connection pool exhaustion during peak order volume causing cascading timeouts across order processing pipeline.', true, current_timestamp()),
('order-critical', 'order-mgmt-chain', 'Order API Down', 'Order API returning 500s, cascading failure', 'critical', 'P1',
 50000, 250000, 1000, 5000, 45, 120, true, 3, 25, 45, 'Primary database cluster failover triggered by storage subsystem IO errors. All write operations failing with connection reset.', true, current_timestamp()),

-- SAP Batch
('sap-normal', 'sap-batch-chain', 'SAP Batch Execute', 'Normal IDOC batch processing', 'normal', 'P4',
 0, 0, 0, 0, 5, 15, false, 1, 1, 3, 'N/A', true, current_timestamp()),
('sap-warning', 'sap-batch-chain', 'SAP Batch Queue Delay', 'Batch queue building up', 'warning', 'P2',
 10000, 50000, 200, 800, 20, 60, false, 2, 8, 20, 'SAP IDOC processing queue saturated during nightly batch sync window. Memory pressure causing GC pauses.', true, current_timestamp()),
('sap-critical', 'sap-batch-chain', 'SAP Batch Sync Failure', 'Complete batch sync stalled', 'critical', 'P1',
 100000, 500000, 500, 3000, 60, 180, true, 4, 30, 50, 'SAP batch processing OOMKilled after IDOC queue exceeded memory limits. Replication pipeline completely stalled.', true, current_timestamp()),

-- Customer Portal
('portal-normal', 'customer-portal-chain', 'Portal Page Load', 'Normal page load', 'normal', 'P4',
 0, 0, 0, 0, 5, 15, false, 1, 1, 3, 'N/A', true, current_timestamp()),
('portal-warning', 'customer-portal-chain', 'Portal Session Timeout', 'Session timeout issues', 'warning', 'P3',
 3000, 15000, 300, 1200, 15, 45, false, 1, 6, 15, 'Session state store Redis cluster experiencing intermittent connection drops during pod rolling updates.', true, current_timestamp()),
('portal-critical', 'customer-portal-chain', 'Portal Unreachable', 'Portal fully unreachable', 'critical', 'P1',
 75000, 350000, 3000, 10000, 45, 120, true, 5, 30, 50, 'Customer portal DNS resolution failing after core switch firmware update caused ARP table corruption.', true, current_timestamp()),

-- Payment Gateway
('payment-normal', 'payment-gw-chain', 'Payment Authorization', 'Normal payment auth', 'normal', 'P4',
 0, 0, 0, 0, 5, 15, false, 1, 1, 3, 'N/A', true, current_timestamp()),
('payment-warning', 'payment-gw-chain', 'Payment Auth Timeout', 'Auth timeouts increasing', 'warning', 'P2',
 25000, 100000, 500, 2000, 15, 45, false, 1, 12, 25, 'Payment processor upstream rate limiting triggered by burst traffic during flash sale.', true, current_timestamp()),
('payment-critical', 'payment-gw-chain', 'Payment Gateway Down', 'Complete payment failure', 'critical', 'P1',
 300000, 1000000, 5000, 10000, 60, 180, true, 5, 35, 55, 'Payment HSM cluster lost quorum after network partition. All payment authorization requests failing with circuit breaker open.', true, current_timestamp()),

-- ERP Integration Hub
('erp-normal', 'erp-hub-chain', 'ERP Data Sync', 'Normal ERP sync', 'normal', 'P4',
 0, 0, 0, 0, 5, 15, false, 1, 1, 3, 'N/A', true, current_timestamp()),
('erp-warning', 'erp-hub-chain', 'ERP Connector Timeout', 'Connector timeouts', 'warning', 'P3',
 5000, 30000, 50, 300, 15, 60, false, 1, 5, 12, 'ERP S/4HANA connector thread pool exhausted due to concurrent materialized view refresh cycles.', true, current_timestamp()),
('erp-critical', 'erp-hub-chain', 'Pricing Engine Failure', 'Pricing engine unresponsive', 'critical', 'P1',
 150000, 500000, 1000, 5000, 60, 180, true, 3, 25, 45, 'Contract pricing calculation engine deadlock on concurrent materialized view refresh. All downstream pricing requests timing out.', true, current_timestamp()),

-- Inventory Sync
('inventory-normal', 'inventory-sync-chain', 'Inventory CDC Replicate', 'Normal CDC replication', 'normal', 'P4',
 0, 0, 0, 0, 5, 15, false, 1, 1, 3, 'N/A', true, current_timestamp()),
('inventory-warning', 'inventory-sync-chain', 'Inventory Sync Lag', 'CDC replication lag increasing', 'warning', 'P3',
 2000, 15000, 100, 600, 10, 30, false, 1, 4, 10, 'CDC replication lag exceeding threshold due to upstream schema change causing connector restart loop.', true, current_timestamp()),
('inventory-critical', 'inventory-sync-chain', 'Inventory Replication Failure', 'Complete CDC failure', 'critical', 'P2',
 50000, 200000, 1000, 5000, 30, 90, false, 2, 15, 30, 'Inventory CDC connector lost all replication slots after PostgreSQL vacuum froze transaction IDs. Full resync required.', true, current_timestamp());
