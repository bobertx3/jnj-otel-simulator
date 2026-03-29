/**
 * app.js — Main orchestrator for EO Operational Dashboard
 *
 * Polls every 5 seconds. Each poll fetches KPIs and domain overview
 * independently (async). Changed values flash to signal fresh data.
 */

let currentRange = "all";
let selectedComponentId = null;
let refreshTimer = null;
const REFRESH_INTERVAL = 5000; // 5 seconds

// Previous values for change detection
let _prevKPIs = {};
let _prevDomainData = null;

// ---- Boot ----
document.addEventListener("DOMContentLoaded", () => {
  checkHealth();
  loadData();
  startAutoRefresh();
  wireTimeRange();
});

// ---- Health Check ----
async function checkHealth() {
  const pill = document.getElementById("health-pill");
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    if (data.status === "ok") {
      pill.textContent = "Connected";
      pill.className = "status-pill ok";
    } else {
      pill.textContent = "Misconfigured";
      pill.className = "status-pill error";
    }
  } catch {
    pill.textContent = "Offline";
    pill.className = "status-pill error";
  }
}

// ---- Data Loading (all async, no full-page refresh) ----
function loadData() {
  // Fire all fetches independently — don't await sequentially
  loadKPIs();
  loadDomainOverview();
  if (selectedComponentId) {
    loadComponentDetails(selectedComponentId);
  }
}

async function loadKPIs() {
  try {
    const res = await fetch(`/api/kpis?range=${currentRange}`);
    const data = await res.json();
    renderKPIsWithFlash(data);
    updateTimestamp();
  } catch (err) {
    console.error("KPI load error:", err);
  }
}

async function loadDomainOverview() {
  try {
    const res = await fetch(`/api/domain-overview?range=${currentRange}`);
    const data = await res.json();
    renderDomainOverviewWithFlash(data, selectedComponentId);
  } catch (err) {
    console.error("Domain overview error:", err);
  }
}

async function loadComponentDetails(componentId) {
  try {
    const res = await fetch(`/api/component/${encodeURIComponent(componentId)}/details?range=${currentRange}`);
    const data = await res.json();
    renderDetailPanel(data);
    flashElement(document.getElementById("detail-panel"));
  } catch (err) {
    console.error("Component detail error:", err);
  }
}

// ---- Render with change detection + flash ----

function renderKPIsWithFlash(data) {
  const fields = [
    { key: "total_spans", id: "kpi-spans", format: formatNumber },
    { key: "active_incidents", id: "kpi-incidents", format: formatNumber },
    { key: "critical_alerts", id: "kpi-critical", format: formatNumber },
    { key: "events_per_min", id: "kpi-rate", format: (v) => v.toFixed(1) },
  ];

  for (const f of fields) {
    const newVal = data[f.key] ?? 0;
    const el = document.getElementById(f.id);
    if (!el) continue;

    const changed = _prevKPIs[f.key] !== undefined && _prevKPIs[f.key] !== newVal;
    el.textContent = f.format(newVal);

    if (changed) {
      flashElement(el.closest(".kpi-card"));
    }
    _prevKPIs[f.key] = newVal;
  }
}

function renderDomainOverviewWithFlash(data, selectedId) {
  // Detect which components changed severity
  const changedIds = new Set();
  if (_prevDomainData) {
    const prevMap = {};
    for (const comps of Object.values(_prevDomainData.domains || {})) {
      for (const c of comps) prevMap[c.component_id] = c;
    }
    for (const comps of Object.values(data.domains || {})) {
      for (const c of comps) {
        const prev = prevMap[c.component_id];
        if (prev && (prev.worst_severity !== c.worst_severity || prev.event_count !== c.event_count)) {
          changedIds.add(c.component_id);
        }
      }
    }
  }

  renderDomainOverview(data, selectedId);
  _prevDomainData = data;

  // Flash changed cards
  if (changedIds.size > 0) {
    document.querySelectorAll(".comp-card").forEach((card) => {
      if (changedIds.has(card.dataset.id)) {
        flashElement(card);
      }
    });
  }
}

// ---- Flash animation ----
function flashElement(el) {
  if (!el) return;
  el.classList.remove("data-flash");
  // Force reflow so re-adding the class triggers the animation
  void el.offsetWidth;
  el.classList.add("data-flash");
}

// ---- Component Selection ----
window.selectComponent = function (componentId) {
  selectedComponentId = componentId;
  loadDomainOverview();
  loadComponentDetails(componentId);
};

// ---- Time Range ----
function wireTimeRange() {
  document.querySelectorAll(".range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".range-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentRange = btn.dataset.range;
      selectedComponentId = null;
      _prevKPIs = {};
      _prevDomainData = null;
      resetDetailPanel();
      document.getElementById("domain-container").innerHTML =
        `<div class="loading">Loading telemetry data...</div>`;
      loadData();
    });
  });
}

// ---- Auto Refresh ----
function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    loadData();
  }, REFRESH_INTERVAL);
}

function updateTimestamp() {
  const now = new Date();
  document.getElementById("last-update-time").textContent =
    now.toLocaleTimeString("en-US", { hour12: false });
}

// ---- Data Flow Modal ----

const dataflowModal = document.getElementById("dataflow-modal");
const btnDataflow = document.getElementById("btn-dataflow");
const closeDataflow = document.getElementById("close-dataflow");
const dfStages = document.querySelectorAll(".df-stage");
const btnExpandAll = document.getElementById("btn-expand-all");
let dfExpanded = false;

btnDataflow.addEventListener("click", () => {
  dataflowModal.classList.remove("hidden");
  dataflowModal.setAttribute("aria-hidden", "false");
  loadDataflowInfo();
});

btnExpandAll.addEventListener("click", () => {
  dfExpanded = !dfExpanded;
  dfStages.forEach((s) => s.classList.toggle("expanded", dfExpanded));
  btnExpandAll.textContent = dfExpanded ? "Collapse" : "Expand";
});

closeDataflow.addEventListener("click", () => {
  dataflowModal.classList.add("hidden");
  dataflowModal.setAttribute("aria-hidden", "true");
});

dataflowModal.addEventListener("click", (e) => {
  if (e.target === dataflowModal) {
    dataflowModal.classList.add("hidden");
    dataflowModal.setAttribute("aria-hidden", "true");
  }
});

async function loadDataflowInfo() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    const el = (id, val) => {
      const node = document.getElementById(id);
      if (node) node.textContent = val || "—";
    };
    el("df-spans-table", data.spans_table);
    el("df-logs-table", data.logs_table);
    el("df-metrics-table", data.metrics_table);
  } catch (err) {
    console.error("Dataflow info error:", err);
  }
}
