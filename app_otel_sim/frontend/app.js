/**
 * app.js — Main orchestrator for the OTel Data Center Simulator
 */

// DOM refs
const healthPillEl = document.getElementById("health-pill");
const clearBtn = document.getElementById("clear-log");
const modalEl = document.getElementById("event-modal");
const closeModalBtn = document.getElementById("close-modal");
const modalTitleEl = document.getElementById("modal-title");
const modalTimeEl = document.getElementById("modal-time");
const modalChipsEl = document.getElementById("modal-chips");
const panelImpactEl = document.getElementById("panel-impact");
const panelRawEl = document.getElementById("panel-raw");
const modalTabButtons = document.querySelectorAll(".modal .tabs .tab-btn");
const dcContainer = document.getElementById("datacenter-container");
const settingsContainer = document.getElementById("settings-container");
const mainTabs = document.querySelectorAll(".main-tab");
const btnManual = document.getElementById("btn-manual");
const btnStreaming = document.getElementById("btn-streaming");
const streamingControls = document.getElementById("streaming-controls");
const btnStartStream = document.getElementById("btn-start-stream");
const btnStopStream = document.getElementById("btn-stop-stream");
const streamSpeedInput = document.getElementById("stream-speed");
const streamSpeedValue = document.getElementById("stream-speed-value");
const statTotalEl = document.getElementById("stat-total");
const statRpsEl = document.getElementById("stat-rps");
const statIncidentsEl = document.getElementById("stat-incidents");
const statConnectionEl = document.getElementById("stat-connection");
const eventStreamEl = document.getElementById("event-stream");
const eventCountEl = document.getElementById("event-count");
const streamEmptyEl = document.getElementById("stream-empty");

// State
const emittedEvents = [];
let triplets = [];
let config = loadConfig();
let statusResetTimer = null;
let currentMode = "manual";
let totalIncidents = 0;
let totalEventsSent = 0;
const _manualRpsWindow = [];

// Streaming engine
const streamer = new StreamingEngine({
  onEvent: (data) => {
    addEvent(data);
    pulseEvents(data.events || []);
  },
  onError: (msg) => {
    setStatusPill(`Stream error: ${msg}`, true);
  },
  onStatsUpdate: (stats) => {
    statTotalEl.textContent = stats.totalEmitted;
    statRpsEl.textContent = stats.eventsPerSecond;
  },
});

// ---- Helpers ----

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 1,
  });
}

function setStatusPill(message, isError = false) {
  if (!healthPillEl) return;
  healthPillEl.textContent = message;
  healthPillEl.style.color = isError ? "#ff8ca9" : "#9cf6b5";
  healthPillEl.style.borderColor = isError ? "#6a3550" : "#315f48";
  if (statusResetTimer) clearTimeout(statusResetTimer);
  statusResetTimer = setTimeout(() => {
    healthPillEl.textContent = "API Connected";
    healthPillEl.style.color = "";
    healthPillEl.style.borderColor = "";
  }, 2000);
}

function makeChip(text, className = "") {
  const span = document.createElement("span");
  span.className = `chip${className ? ` ${className}` : ""}`;
  span.textContent = text;
  return span;
}

function severityClass(severity) {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warn";
  return "normal";
}

// ---- Event Stream (bottom of page) ----

function updateManualStats() {
  const now = Date.now();
  // Clean window to last 5 seconds
  while (_manualRpsWindow.length && _manualRpsWindow[0] < now - 5000) _manualRpsWindow.shift();
  let rps = 0;
  if (_manualRpsWindow.length > 1) {
    const elapsed = (now - _manualRpsWindow[0]) / 1000;
    rps = elapsed > 0 ? _manualRpsWindow.length / elapsed : 0;
  }
  statTotalEl.textContent = totalEventsSent;
  statRpsEl.textContent = Math.round(rps * 10) / 10;
}

function addEvent(data) {
  emittedEvents.unshift(data);
  if (emittedEvents.length > 200) emittedEvents.pop();
  totalIncidents++;
  totalEventsSent++;
  _manualRpsWindow.push(Date.now());
  statIncidentsEl.textContent = totalIncidents;
  updateManualStats();

  // Hide empty state
  if (streamEmptyEl) streamEmptyEl.style.display = "none";

  // Create new event row and prepend (newest at top)
  const row = createEventRow(data, 0);
  row.classList.add("newest");

  // Insert at top of stream
  if (eventStreamEl.firstChild) {
    eventStreamEl.insertBefore(row, eventStreamEl.firstChild);
  } else {
    eventStreamEl.appendChild(row);
  }

  // Keep DOM size limited (remove old rows)
  while (eventStreamEl.children.length > 201) {
    eventStreamEl.removeChild(eventStreamEl.lastChild);
  }

  // Scroll to top (newest)
  eventStreamEl.scrollTop = 0;

  // Update count
  eventCountEl.textContent = `${emittedEvents.length} events`;
}

function createEventRow(data, index) {
  const row = document.createElement("div");
  const sevClass = severityClass(data.severity);
  row.className = `event-row ${sevClass}`;
  row.dataset.index = index;

  const eventLabels = (data.events || []).map((e) => e.event_label).join(" → ");

  row.innerHTML = `
    <span class="ev-time">${formatTime(data.timestamp)}</span>
    <span class="ev-level-dot ${sevClass}"></span>
    <span class="ev-label">${data.scenario_label}</span>
    <span class="ev-detail">${eventLabels}</span>
    <span class="ev-tags">
      <span class="ev-tag priority">${data.priority}</span>
      ${data.sla_breach ? '<span class="ev-tag sla">SLA</span>' : ""}
      <span class="ev-tag triplet">${data.triplet_id}</span>
    </span>
  `;

  row.addEventListener("click", () => {
    const idx = emittedEvents.findIndex((e) => e.incident_id === data.incident_id);
    if (idx >= 0) openModal(idx);
  });

  return row;
}

function clearStream() {
  emittedEvents.length = 0;
  totalIncidents = 0;
  statIncidentsEl.textContent = "0";
  eventStreamEl.innerHTML = "";
  eventCountEl.textContent = "0 events";
  if (streamEmptyEl) {
    eventStreamEl.appendChild(streamEmptyEl);
    streamEmptyEl.style.display = "";
  }
}

// ---- Modal ----

function openModal(index) {
  const item = emittedEvents[index];
  if (!item) return;

  modalTitleEl.textContent = item.scenario_label;
  modalTimeEl.textContent = item.timestamp;
  modalChipsEl.innerHTML = "";
  modalChipsEl.appendChild(makeChip(item.severity, severityClass(item.severity)));
  modalChipsEl.appendChild(makeChip(item.priority));
  if (item.sla_breach) modalChipsEl.appendChild(makeChip("SLA BREACH", "sla"));

  document.getElementById("impact-incident").textContent = item.incident_id;
  document.getElementById("impact-scenario").textContent = `${item.scenario_id} (${item.triplet_id})`;
  document.getElementById("impact-severity").textContent = `${item.severity} / ${item.priority}`;
  document.getElementById("impact-root-cause").textContent = item.root_cause || "N/A";
  document.getElementById("impact-blast").textContent = `${item.blast_radius} components`;
  document.getElementById("impact-users").textContent = item.users_affected.toLocaleString();
  document.getElementById("impact-revenue").textContent = `$${item.revenue_impact_usd.toLocaleString()}`;
  document.getElementById("impact-mttr").textContent = `${item.mttr_minutes} min`;
  document.getElementById("impact-sla").textContent = item.sla_breach ? "YES" : "No";
  document.getElementById("impact-snow").textContent = `${item.servicenow_tickets} (${item.duplicate_ticket_pct}% duplicates)`;
  document.getElementById("impact-events").textContent = (item.events || []).map((e) => `${e.event_label} [${e.domain}]`).join(" → ");

  panelRawEl.textContent = JSON.stringify(item, null, 2);
  activateModalPanel("impact");
  modalEl.classList.remove("hidden");
  modalEl.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modalEl.classList.add("hidden");
  modalEl.setAttribute("aria-hidden", "true");
}

function activateModalPanel(panelName) {
  modalTabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.panel === panelName));
  panelImpactEl.classList.toggle("active", panelName === "impact");
  panelRawEl.classList.toggle("active", panelName === "raw");
}

// ---- Tabs ----

function switchTab(tabName) {
  mainTabs.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabName));
  document.querySelectorAll(".tab-content").forEach((el) => {
    el.classList.toggle("active", el.id === `tab-${tabName}`);
  });
}

// ---- Mode switching ----

function setMode(mode) {
  currentMode = mode;
  btnManual.classList.toggle("active", mode === "manual");
  btnStreaming.classList.toggle("active", mode === "streaming");
  streamingControls.classList.toggle("hidden", mode !== "streaming");

  if (mode === "manual") {
    streamer.stop();
    btnStartStream.classList.remove("hidden");
    btnStopStream.classList.add("hidden");
    statConnectionEl.innerHTML = '<span class="conn-dot idle"></span> Manual';
  } else {
    statConnectionEl.innerHTML = '<span class="conn-dot idle"></span> Streaming (Ready)';
  }
}

function updateStreamingState(running) {
  btnStartStream.classList.toggle("hidden", running);
  btnStopStream.classList.toggle("hidden", !running);
  if (running) {
    statConnectionEl.innerHTML = '<span class="conn-dot connected"></span> Streaming';
  } else {
    statConnectionEl.innerHTML = '<span class="conn-dot idle"></span> Streaming (Ready)';
  }
}

// ---- Hotspot click handler (manual mode) ----

async function handleHotspotClick(tripletId, component) {
  if (currentMode !== "manual") return;

  setStatusPill(`Emitting for ${component.label}...`);
  try {
    const res = await fetch(`/api/emit-random?triplet_id=${encodeURIComponent(tripletId)}`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `${res.status}`);
    }
    const data = await res.json();
    addEvent(data);
    pulseEvents(data.events || []);
    setStatusPill(`${data.scenario_label}`);
  } catch (err) {
    setStatusPill(`Emit failed: ${err.message}`, true);
  }
}

// ---- Initialization ----

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    healthPillEl.textContent = res.ok ? "API Connected" : "API Error";
  } catch (_) {
    healthPillEl.textContent = "API Unreachable";
  }
}

async function loadTriplets() {
  const res = await fetch("/api/triplets");
  if (!res.ok) throw new Error("Failed to load triplets");
  triplets = await res.json();
  renderDataCenter(triplets, dcContainer, handleHotspotClick);
}

function initSettings() {
  renderSettings(settingsContainer, triplets, config, (updatedConfig) => {
    config = updatedConfig;
    if (streamer.running) {
      streamer.updateInterval(config.interval_ms);
    }
  });
}

// ---- Data Flow Modal ----

const dataflowModal = document.getElementById("dataflow-modal");
const btnDataflow = document.getElementById("btn-dataflow");
const closeDataflow = document.getElementById("close-dataflow");

btnDataflow.addEventListener("click", () => {
  dataflowModal.classList.remove("hidden");
  dataflowModal.setAttribute("aria-hidden", "false");
});

// Expand/Collapse all stages
const btnExpandAll = document.getElementById("btn-expand-all");
const dfStages = document.querySelectorAll(".df-stage");
let dfExpanded = false;

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
    const res = await fetch("/api/config-info");
    if (!res.ok) return;
    const info = await res.json();
    const spansEl = document.getElementById("df-spans-table");
    const logsEl = document.getElementById("df-logs-table");
    const metricsEl = document.getElementById("df-metrics-table");
    if (spansEl) spansEl.textContent = info.spans_table;
    if (logsEl) logsEl.textContent = info.logs_table;
    if (metricsEl) metricsEl.textContent = info.metrics_table;
  } catch (_) {}
}

// ---- Legend Modal ----

const legendModal = document.getElementById("legend-modal");
const btnLegend = document.getElementById("btn-legend");
const closeLegend = document.getElementById("close-legend");

btnLegend.addEventListener("click", () => {
  legendModal.classList.remove("hidden");
  legendModal.setAttribute("aria-hidden", "false");
});
closeLegend.addEventListener("click", () => {
  legendModal.classList.add("hidden");
  legendModal.setAttribute("aria-hidden", "true");
});
legendModal.addEventListener("click", (e) => {
  if (e.target === legendModal) {
    legendModal.classList.add("hidden");
    legendModal.setAttribute("aria-hidden", "true");
  }
});

// ---- Refresh Demo Modal ----

const refreshModal = document.getElementById("refresh-modal");
const btnRefreshDemo = document.getElementById("btn-refresh-demo");
const closeRefresh = document.getElementById("close-refresh");
const btnCancelRefresh = document.getElementById("btn-cancel-refresh");
const btnConfirmRefresh = document.getElementById("btn-confirm-refresh");
const refreshLoading = document.getElementById("refresh-loading");
const refreshCounts = document.getElementById("refresh-counts");
const refreshTableBody = document.getElementById("refresh-table-body");
const refreshTotalCount = document.getElementById("refresh-total-count");
const refreshResult = document.getElementById("refresh-result");
const refreshActions = document.getElementById("refresh-actions");

function openRefreshModal() {
  // Reset state
  refreshLoading.style.display = "";
  refreshCounts.style.display = "none";
  refreshResult.style.display = "none";
  refreshResult.className = "refresh-result";
  refreshResult.textContent = "";
  refreshActions.style.display = "flex";
  btnConfirmRefresh.disabled = false;
  btnConfirmRefresh.textContent = "Truncate All Tables";

  refreshModal.classList.remove("hidden");
  refreshModal.setAttribute("aria-hidden", "false");

  // Fetch counts (read body once; gateways may return HTML e.g. "Error during request to server")
  fetch("/api/table-counts")
    .then(async (r) => {
      const text = await r.text();
      if (!r.ok) {
        let detail;
        try {
          const body = JSON.parse(text);
          detail = body.detail ?? r.statusText;
          if (Array.isArray(detail)) {
            detail = detail.map((d) => (d && d.msg) || JSON.stringify(d)).join("; ");
          } else if (detail && typeof detail !== "string") {
            detail = JSON.stringify(detail);
          }
        } catch {
          detail =
            text.trim().slice(0, 800) || `HTTP ${r.status} ${r.statusText || ""}`.trim();
        }
        throw new Error(detail || "Failed to load table counts");
      }
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error(`Invalid JSON from /api/table-counts: ${text.slice(0, 200)}`);
      }
    })
    .then((data) => {
      refreshLoading.style.display = "none";
      refreshCounts.style.display = "";
      refreshTableBody.innerHTML = "";
      let total = 0;
      const tables = [
        { key: "spans", name: data.spans_table },
        { key: "logs", name: data.logs_table },
        { key: "metrics", name: data.metrics_table },
      ];
      tables.forEach(({ key, name }) => {
        const count = data.counts[key] || 0;
        total += count;
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${name}</td><td>${count.toLocaleString()}</td>`;
        refreshTableBody.appendChild(tr);
      });
      refreshTotalCount.textContent = total.toLocaleString();
    })
    .catch((err) => {
      refreshLoading.style.display = "none";
      refreshResult.style.display = "";
      refreshResult.className = "refresh-result error";
      const msg =
        err && err.message
          ? err.message
          : "Network error — check browser devtools Network tab for /api/table-counts";
      refreshResult.textContent = msg;
      btnConfirmRefresh.disabled = true;
    });
}

function closeRefreshModal() {
  refreshModal.classList.add("hidden");
  refreshModal.setAttribute("aria-hidden", "true");
}

async function confirmTruncate() {
  btnConfirmRefresh.disabled = true;
  btnConfirmRefresh.textContent = "Truncating...";

  try {
    const res = await fetch("/api/truncate-tables", { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `${res.status}`);
    }
    const data = await res.json();
    refreshCounts.style.display = "none";
    refreshActions.style.display = "none";
    refreshResult.style.display = "";
    refreshResult.className = "refresh-result success";

    const lines = [];
    if (data.deleted.spans) lines.push(`Spans: ${data.deleted.spans.toLocaleString()} rows deleted`);
    if (data.deleted.logs) lines.push(`Logs: ${data.deleted.logs.toLocaleString()} rows deleted`);
    if (data.deleted.metrics) lines.push(`Metrics: ${data.deleted.metrics.toLocaleString()} rows deleted`);
    refreshResult.innerHTML = `<strong>${data.total_deleted.toLocaleString()} rows deleted</strong><br><br>${lines.join("<br>")}`;

    // Also reset local counters
    clearStream();
  } catch (err) {
    refreshResult.style.display = "";
    refreshResult.className = "refresh-result error";
    refreshResult.textContent = `Error: ${err.message}`;
    btnConfirmRefresh.disabled = false;
    btnConfirmRefresh.textContent = "Truncate All Tables";
  }
}

btnRefreshDemo.addEventListener("click", openRefreshModal);
closeRefresh.addEventListener("click", closeRefreshModal);
btnCancelRefresh.addEventListener("click", closeRefreshModal);
btnConfirmRefresh.addEventListener("click", confirmTruncate);
refreshModal.addEventListener("click", (e) => {
  if (e.target === refreshModal) closeRefreshModal();
});

// ---- Wire up events ----

clearBtn.addEventListener("click", clearStream);

closeModalBtn.addEventListener("click", closeModal);
modalEl.addEventListener("click", (e) => {
  if (e.target === modalEl) closeModal();
});
modalTabButtons.forEach((btn) => {
  btn.addEventListener("click", () => activateModalPanel(btn.dataset.panel));
});

mainTabs.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

btnManual.addEventListener("click", () => setMode("manual"));
btnStreaming.addEventListener("click", () => setMode("streaming"));

btnStartStream.addEventListener("click", () => {
  streamer.start(config.interval_ms);
  updateStreamingState(true);
});

btnStopStream.addEventListener("click", () => {
  streamer.stop();
  updateStreamingState(false);
});

streamSpeedInput.addEventListener("input", (e) => {
  const ms = parseInt(e.target.value, 10);
  streamSpeedValue.textContent = `${ms}ms`;
  config.interval_ms = ms;
  saveConfig(config);
  if (streamer.running) {
    streamer.updateInterval(ms);
  }
});

// ---- Boot ----

(async () => {
  try {
    await checkHealth();
    await loadTriplets();
    // Sync speed slider to persisted interval_ms (default 2000ms in settings.js).
    // This does not slow streaming — it fixes a prior bug where the UI showed 500ms
    // while the engine used 2000ms. streaming.js tick/stagger logic was not changed.
    if (streamSpeedInput && streamSpeedValue) {
      streamSpeedInput.value = String(config.interval_ms);
      streamSpeedValue.textContent = `${config.interval_ms}ms`;
    }
    initSettings();
    loadDataflowInfo();
  } catch (err) {
    healthPillEl.textContent = "API Unreachable";
    console.error("Init error:", err);
  }
})();
