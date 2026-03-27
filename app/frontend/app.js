/**
 * app.js — Main orchestrator for the OTel Data Center Simulator
 */

// DOM refs
const eventLogEl = document.getElementById("event-log");
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

// State
const emittedEvents = [];
let triplets = [];
let config = loadConfig();
let statusResetTimer = null;
let currentMode = "manual"; // "manual" | "streaming"

// Streaming engine
const streamer = new StreamingEngine({
  onEvent: (data) => {
    addEventToLog(data);
    pulseEvents(data.events || []);
  },
  onError: (msg) => {
    setStatusPill(`Stream error: ${msg}`, true);
  },
  onStatsUpdate: (stats) => {
    statTotalEl.textContent = `${stats.totalEmitted} events`;
    statRpsEl.textContent = `${stats.eventsPerSecond} e/s`;
  },
});

// ---- Helpers ----

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString();
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

function severityChipClass(severity) {
  if (severity === "critical") return "critical";
  if (severity === "warning" || severity === "WARN") return "warn";
  return "";
}

// ---- Event Log ----

function addEventToLog(data) {
  emittedEvents.unshift(data);
  if (emittedEvents.length > 100) emittedEvents.pop();
  renderEventLog();
  setStatusPill(`${data.scenario_label} [${data.severity.toUpperCase()}]`);
}

function renderEventLog() {
  eventLogEl.innerHTML = "";
  emittedEvents.forEach((item, idx) => {
    const li = document.createElement("li");
    const sevClass = item.severity === "critical" ? "border-critical" : item.severity === "warning" ? "border-warning" : "border-normal";
    li.className = `event-item ${sevClass}`;
    const eventCount = (item.events || []).length;
    li.innerHTML = `
      <div class="line1">
        <strong>${item.scenario_label}</strong>
      </div>
      <div class="line2">${formatTime(item.timestamp)} | ${item.priority} | ${eventCount} signals</div>
    `;
    const line1 = li.querySelector(".line1");
    line1.appendChild(makeChip(item.severity, severityChipClass(item.severity)));
    line1.appendChild(makeChip(item.priority));
    if (item.sla_breach) {
      line1.appendChild(makeChip("SLA", "sla"));
    }
    li.addEventListener("click", () => openModal(idx));
    eventLogEl.appendChild(li);
  });
}

// ---- Modal ----

function openModal(index) {
  const item = emittedEvents[index];
  if (!item) return;

  modalTitleEl.textContent = item.scenario_label;
  modalTimeEl.textContent = item.timestamp;
  modalChipsEl.innerHTML = "";
  modalChipsEl.appendChild(makeChip(item.severity, severityChipClass(item.severity)));
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
    addEventToLog(data);
    pulseEvents(data.events || []);
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
    // Update streaming engine interval if running
    if (streamer.running) {
      streamer.updateInterval(config.interval_ms);
    }
  });
}

// Wire up events
clearBtn.addEventListener("click", () => {
  emittedEvents.length = 0;
  renderEventLog();
});

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
  btnStartStream.classList.add("hidden");
  btnStopStream.classList.remove("hidden");
});

btnStopStream.addEventListener("click", () => {
  streamer.stop();
  btnStartStream.classList.remove("hidden");
  btnStopStream.classList.add("hidden");
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

// Boot
(async () => {
  try {
    await checkHealth();
    await loadTriplets();
    initSettings();
    renderEventLog();
  } catch (err) {
    healthPillEl.textContent = "API Unreachable";
    console.error("Init error:", err);
  }
})();
