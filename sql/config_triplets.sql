-- Config table for triplet definitions (app → infra → network mappings)
-- Each row defines one triplet chain used by the simulator

CREATE TABLE IF NOT EXISTS bx3.otel_demo.config_triplets (
  triplet_id      STRING NOT NULL,
  label           STRING NOT NULL,
  -- Application component
  app_id          STRING NOT NULL,
  app_label       STRING NOT NULL,
  app_type        STRING NOT NULL,
  app_x           DOUBLE NOT NULL,
  app_y           DOUBLE NOT NULL,
  -- Infrastructure component
  infra_id        STRING NOT NULL,
  infra_label     STRING NOT NULL,
  infra_type      STRING NOT NULL,
  infra_x         DOUBLE NOT NULL,
  infra_y         DOUBLE NOT NULL,
  -- Network component
  net_id          STRING NOT NULL,
  net_label       STRING NOT NULL,
  net_type        STRING NOT NULL,
  net_x           DOUBLE NOT NULL,
  net_y           DOUBLE NOT NULL,
  -- Metadata
  enabled         BOOLEAN DEFAULT true,
  updated_at      TIMESTAMP DEFAULT current_timestamp()
);

-- Seed defaults
TRUNCATE TABLE bx3.otel_demo.config_triplets;

INSERT INTO bx3.otel_demo.config_triplets VALUES
('order-mgmt-chain', 'Order Management System',
 'order-mgmt-api', 'Order Management API', 'api-service', 73.5, 14.5,
 'k8s-pod-a3', 'cluster-a-pod-3', 'k8s-pod', 4.5, 13.3,
 'subnet-1', '10.0.1.0/24', 'subnet', 35.5, 60.8,
 true, current_timestamp()),

('sap-batch-chain', 'SAP Batch Processor',
 'sap-batch-proc', 'SAP Batch Processor', 'batch-service', 73.5, 26.7,
 'k8s-pod-b7', 'cluster-b-pod-7', 'k8s-pod', 4.5, 41.7,
 'subnet-2', '10.0.2.0/24', 'subnet', 52, 60.8,
 true, current_timestamp()),

('customer-portal-chain', 'Customer Portal',
 'customer-portal', 'Customer Portal', 'web-app', 73.5, 38.8,
 'k8s-pod-a1', 'cluster-a-pod-1', 'k8s-pod', 4.5, 20,
 'switch-core-1', 'Core Switch sw-core-01', 'switch', 38, 34.2,
 true, current_timestamp()),

('payment-gw-chain', 'Payment Gateway',
 'payment-gateway', 'Payment Gateway', 'transaction-service', 73.5, 51,
 'k8s-pod-c2', 'cluster-c-pod-2', 'k8s-pod', 4.5, 68.3,
 'subnet-3', '10.0.3.0/24', 'subnet', 43.5, 77.5,
 true, current_timestamp()),

('erp-hub-chain', 'ERP Integration Hub',
 'erp-integration-hub', 'ERP Integration Hub', 'integration-service', 73.5, 63.2,
 'k8s-pod-b2', 'cluster-b-pod-2', 'k8s-pod', 4.5, 47.5,
 'subnet-2-erp', '10.0.2.0/24', 'subnet', 52, 60.8,
 true, current_timestamp()),

('inventory-sync-chain', 'Inventory Sync Service',
 'inventory-sync', 'Inventory Sync', 'sync-service', 73.5, 75.3,
 'k8s-pod-a5', 'cluster-a-pod-5', 'k8s-pod', 4.5, 25.8,
 'subnet-1-inv', '10.0.1.0/24', 'subnet', 35.5, 60.8,
 true, current_timestamp());
