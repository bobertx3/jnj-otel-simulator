/**
 * settings.js — Settings panel with localStorage persistence
 */

const CONFIG_KEY = "otel-sim-config";

const DEFAULT_CONFIG = {
  interval_ms: 2000,
  blast_radius: 2,
  severity_weights: { normal: 0.75, warning: 0.15, critical: 0.10 },
  active_triplet_ids: [],
};

function loadConfig() {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
    }
  } catch (_) {}
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

async function syncConfigToBackend(config) {
  try {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
  } catch (_) {}
}

function renderSettings(container, triplets, config, onChange) {
  container.innerHTML = "";

  const html = `
    <div class="settings-grid">
      <div class="settings-section">
        <h3>Streaming Controls</h3>
        <div class="setting-row">
          <label for="interval-slider">Streaming Interval</label>
          <div class="slider-group">
            <input type="range" id="interval-slider" min="500" max="10000" step="500" value="${config.interval_ms}">
            <span id="interval-value">${config.interval_ms}ms</span>
          </div>
        </div>
        <div class="setting-row">
          <label for="blast-slider">Blast Radius</label>
          <div class="slider-group">
            <input type="range" id="blast-slider" min="1" max="5" step="1" value="${config.blast_radius}">
            <span id="blast-value">${config.blast_radius}</span>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Severity Weights</h3>
        <p class="settings-hint">Controls probability distribution in streaming mode</p>
        <div class="setting-row">
          <label for="weight-normal">Normal</label>
          <div class="slider-group">
            <input type="range" id="weight-normal" min="0" max="100" step="5" value="${Math.round(config.severity_weights.normal * 100)}">
            <span id="weight-normal-value">${Math.round(config.severity_weights.normal * 100)}%</span>
          </div>
        </div>
        <div class="setting-row">
          <label for="weight-warning">Warning</label>
          <div class="slider-group">
            <input type="range" id="weight-warning" min="0" max="100" step="5" value="${Math.round(config.severity_weights.warning * 100)}">
            <span id="weight-warning-value">${Math.round(config.severity_weights.warning * 100)}%</span>
          </div>
        </div>
        <div class="setting-row">
          <label for="weight-critical">Critical</label>
          <div class="slider-group">
            <input type="range" id="weight-critical" min="0" max="100" step="5" value="${Math.round(config.severity_weights.critical * 100)}">
            <span id="weight-critical-value">${Math.round(config.severity_weights.critical * 100)}%</span>
          </div>
        </div>
      </div>

      <div class="settings-section triplet-section">
        <h3>Application Triplets</h3>
        <p class="settings-hint">Enable/disable which application chains are active</p>
        <div id="triplet-toggles" class="triplet-list"></div>
      </div>
    </div>
  `;
  container.innerHTML = html;

  // Triplet toggles
  const toggleContainer = container.querySelector("#triplet-toggles");
  const allActive = config.active_triplet_ids.length === 0; // empty = all active
  triplets.forEach((t) => {
    const isActive = allActive || config.active_triplet_ids.includes(t.id);
    const card = document.createElement("div");
    card.className = `triplet-card${isActive ? " active" : ""}`;
    card.innerHTML = `
      <div class="triplet-toggle">
        <input type="checkbox" id="trip-${t.id}" ${isActive ? "checked" : ""} data-triplet-id="${t.id}">
        <label for="trip-${t.id}">${t.label}</label>
      </div>
      <div class="triplet-chain">
        <span class="chain-node app-node">${t.application.label}</span>
        <span class="chain-arrow">&rarr;</span>
        <span class="chain-node infra-node">${t.infrastructure.label}</span>
        <span class="chain-arrow">&rarr;</span>
        <span class="chain-node net-node">${t.network.label}</span>
      </div>
    `;
    toggleContainer.appendChild(card);
  });

  // Wire up event handlers
  function emitChange() {
    const updated = readConfigFromUI(triplets);
    saveConfig(updated);
    syncConfigToBackend(updated);
    onChange(updated);
  }

  container.querySelector("#interval-slider").addEventListener("input", (e) => {
    container.querySelector("#interval-value").textContent = `${e.target.value}ms`;
    emitChange();
  });
  container.querySelector("#blast-slider").addEventListener("input", (e) => {
    container.querySelector("#blast-value").textContent = e.target.value;
    emitChange();
  });
  ["normal", "warning", "critical"].forEach((sev) => {
    container.querySelector(`#weight-${sev}`).addEventListener("input", (e) => {
      container.querySelector(`#weight-${sev}-value`).textContent = `${e.target.value}%`;
      emitChange();
    });
  });
  toggleContainer.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      cb.closest(".triplet-card").classList.toggle("active", cb.checked);
      emitChange();
    });
  });
}

function readConfigFromUI(triplets) {
  const intervalEl = document.getElementById("interval-slider");
  const blastEl = document.getElementById("blast-slider");
  const wNormal = document.getElementById("weight-normal");
  const wWarning = document.getElementById("weight-warning");
  const wCritical = document.getElementById("weight-critical");

  const activeIds = [];
  document.querySelectorAll("#triplet-toggles input[type=checkbox]").forEach((cb) => {
    if (cb.checked) activeIds.push(cb.dataset.tripletId);
  });

  // If all are checked, store empty (= all active)
  const allChecked = activeIds.length === triplets.length;

  return {
    interval_ms: parseInt(intervalEl.value, 10),
    blast_radius: parseInt(blastEl.value, 10),
    severity_weights: {
      normal: parseInt(wNormal.value, 10) / 100,
      warning: parseInt(wWarning.value, 10) / 100,
      critical: parseInt(wCritical.value, 10) / 100,
    },
    active_triplet_ids: allChecked ? [] : activeIds,
  };
}
