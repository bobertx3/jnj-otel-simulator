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

      <div class="settings-section scenario-section">
        <div class="scenario-header">
          <div>
            <h3>Scenario Impact Ranges</h3>
            <p class="settings-hint">Configure revenue, user impact, and MTTR ranges per scenario. Stored in <code>bx3.otel_demo.config_scenarios</code></p>
          </div>
          <div class="scenario-actions">
            <button type="button" class="control-btn" id="btn-load-db" title="Load from config tables">Load from DB</button>
            <button type="button" class="control-btn start-btn" id="btn-reload-catalog" title="Apply DB config to running simulator">Apply &amp; Reload</button>
          </div>
        </div>
        <div id="scenario-config-container" class="scenario-config-container">
          <div class="settings-hint" style="padding:16px;text-align:center">Click "Load from DB" to view scenario configurations</div>
        </div>
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

  // Wire up scenario DB buttons
  container.querySelector("#btn-load-db").addEventListener("click", loadScenariosFromDB);
  container.querySelector("#btn-reload-catalog").addEventListener("click", reloadCatalogFromDB);

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

// ---- Scenario DB Config ----

async function loadScenariosFromDB() {
  const container = document.getElementById("scenario-config-container");
  container.innerHTML = `<div class="settings-hint" style="padding:16px;text-align:center">Loading scenarios from DB...</div>`;
  try {
    const res = await fetch("/api/config-db/scenarios");
    const scenarios = await res.json();
    renderScenarioConfig(container, scenarios);
  } catch (err) {
    container.innerHTML = `<div class="settings-hint" style="padding:16px;text-align:center;color:var(--critical-color)">Failed to load: ${err.message}</div>`;
  }
}

async function reloadCatalogFromDB() {
  const btn = document.getElementById("btn-reload-catalog");
  btn.textContent = "Reloading...";
  btn.disabled = true;
  try {
    const res = await fetch("/api/config-db/reload", { method: "POST" });
    const data = await res.json();
    btn.textContent = `Loaded ${data.scenarios} scenarios`;
    setTimeout(() => { btn.textContent = "Apply & Reload"; btn.disabled = false; }, 2000);
  } catch (err) {
    btn.textContent = "Error";
    btn.disabled = false;
  }
}

function renderScenarioConfig(container, scenarios) {
  // Group by triplet
  const grouped = {};
  for (const s of scenarios) {
    if (!grouped[s.triplet_id]) grouped[s.triplet_id] = [];
    grouped[s.triplet_id].push(s);
  }

  let html = "";
  for (const [tripletId, items] of Object.entries(grouped)) {
    html += `<div class="scenario-group">`;
    html += `<div class="scenario-group-header">${tripletId}</div>`;
    html += `<table class="scenario-table"><thead><tr>
      <th>Scenario</th><th>Sev</th><th>Pri</th>
      <th>Revenue Min</th><th>Revenue Max</th>
      <th>Users Min</th><th>Users Max</th>
      <th>MTTR Min</th><th>MTTR Max</th>
      <th>SLA</th><th>Blast</th><th></th>
    </tr></thead><tbody>`;

    for (const s of items) {
      const sevClass = s.severity === "critical" ? "critical" : s.severity === "warning" ? "warning" : "normal";
      html += `<tr class="scenario-row" data-id="${s.scenario_id}">
        <td class="sc-label">${s.label}</td>
        <td><span class="sc-sev ${sevClass}">${s.severity}</span></td>
        <td>${s.priority}</td>
        <td><input type="number" class="sc-input" data-field="revenue_min" value="${s.revenue_min}" step="1000"></td>
        <td><input type="number" class="sc-input" data-field="revenue_max" value="${s.revenue_max}" step="1000"></td>
        <td><input type="number" class="sc-input" data-field="users_min" value="${s.users_min}" step="10"></td>
        <td><input type="number" class="sc-input" data-field="users_max" value="${s.users_max}" step="10"></td>
        <td><input type="number" class="sc-input sc-narrow" data-field="mttr_min" value="${s.mttr_min}" step="5"></td>
        <td><input type="number" class="sc-input sc-narrow" data-field="mttr_max" value="${s.mttr_max}" step="5"></td>
        <td><input type="checkbox" data-field="sla_breach" ${s.sla_breach ? "checked" : ""}></td>
        <td><input type="number" class="sc-input sc-narrow" data-field="blast_radius" value="${s.blast_radius}" min="1" max="6" step="1"></td>
        <td><button type="button" class="sc-save-btn" data-id="${s.scenario_id}">Save</button></td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
  }

  container.innerHTML = html;

  // Wire save buttons
  container.querySelectorAll(".sc-save-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      const scenarioId = btn.dataset.id;
      const body = {};
      row.querySelectorAll(".sc-input").forEach((inp) => {
        body[inp.dataset.field] = parseFloat(inp.value) || 0;
      });
      row.querySelectorAll("input[type=checkbox]").forEach((cb) => {
        body[cb.dataset.field] = cb.checked;
      });
      btn.textContent = "...";
      try {
        await fetch(`/api/config-db/scenarios/${encodeURIComponent(scenarioId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        btn.textContent = "Saved";
        btn.style.color = "var(--normal-color)";
        setTimeout(() => { btn.textContent = "Save"; btn.style.color = ""; }, 1500);
      } catch {
        btn.textContent = "Error";
        setTimeout(() => { btn.textContent = "Save"; }, 1500);
      }
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
