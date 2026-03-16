const domains = ["infrastructure", "networking", "applications"];
const eventLogEl = document.getElementById("event-log");
const healthPillEl = document.getElementById("health-pill");
const clearBtn = document.getElementById("clear-log");
const modalEl = document.getElementById("event-modal");
const closeModalBtn = document.getElementById("close-modal");
const modalTitleEl = document.getElementById("modal-title");
const modalTimeEl = document.getElementById("modal-time");
const modalChipsEl = document.getElementById("modal-chips");
const impactSourceEl = document.getElementById("impact-source");
const impactCorrelationEl = document.getElementById("impact-correlation");
const impactTraceEl = document.getElementById("impact-trace");
const impactSignalsEl = document.getElementById("impact-signals");
const panelImpactEl = document.getElementById("panel-impact");
const panelRawEl = document.getElementById("panel-raw");
const modalTabButtons = document.querySelectorAll(".tabs .tab-btn");

const emittedEvents = [];
let statusResetTimer = null;

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

function makeChip(text, isWarn = false) {
  const span = document.createElement("span");
  span.className = `chip${isWarn ? " warn" : ""}`;
  span.textContent = text;
  return span;
}

function renderEventLog() {
  eventLogEl.innerHTML = "";
  emittedEvents.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = "event-item";
    li.innerHTML = `
      <div class="line1">
        <strong>${item.label}</strong>
      </div>
      <div class="line2">${formatTime(item.timestamp)} | ${item.domain} | ${item.severity}</div>
    `;
    const line1 = li.querySelector(".line1");
    line1.appendChild(makeChip(item.severity, item.severity === "WARN"));
    (item.signal_types || []).forEach((signal) => {
      line1.appendChild(makeChip(signal));
    });
    li.addEventListener("click", () => openModal(idx));
    eventLogEl.appendChild(li);
  });
}

function openModal(index) {
  const item = emittedEvents[index];
  if (!item) return;

  modalTitleEl.textContent = item.event;
  modalTimeEl.textContent = item.timestamp;
  modalChipsEl.innerHTML = "";
  modalChipsEl.appendChild(makeChip(item.severity, item.severity === "WARN"));
  (item.signal_types || []).forEach((signal) => {
    modalChipsEl.appendChild(makeChip(signal));
  });
  modalChipsEl.appendChild(makeChip(item.domain));

  impactSourceEl.textContent = item.source_component;
  impactCorrelationEl.textContent = item.correlation_id;
  impactTraceEl.textContent = item.trace_id;
  impactSignalsEl.textContent = item.signal_types.join(", ");
  panelRawEl.textContent = JSON.stringify(item.raw_telemetry, null, 2);

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

async function emitEvent(domain, eventKey) {
  try {
    const res = await fetch(`/api/emit/${domain}/${eventKey}`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.detail || `${res.status} ${res.statusText}`);
    }
    emittedEvents.unshift(body);
    if (emittedEvents.length > 60) emittedEvents.pop();
    renderEventLog();
    setStatusPill(`Emitted ${body.label}`);
  } catch (err) {
    setStatusPill(`Emit failed for ${domain}/${eventKey}`, true);
  }
}

function renderButtons(catalog) {
  domains.forEach((domain) => {
    const container = document.getElementById(`${domain}-buttons`);
    container.innerHTML = "";
    (catalog[domain] || []).forEach((def) => {
      const button = document.createElement("button");
      button.className = "event-btn";
      button.type = "button";
      button.textContent = def.label;
      button.title = def.description;
      button.addEventListener("click", () => emitEvent(domain, def.key));
      container.appendChild(button);
    });
  });
}

async function loadCatalog() {
  const res = await fetch("/api/events");
  if (!res.ok) {
    throw new Error(`Could not load event catalog (${res.status})`);
  }
  const catalog = await res.json();
  renderButtons(catalog);
}

async function checkHealth() {
  const res = await fetch("/api/health");
  healthPillEl.textContent = res.ok ? "API Connected" : "API Error";
}

clearBtn.addEventListener("click", () => {
  emittedEvents.length = 0;
  renderEventLog();
});

closeModalBtn.addEventListener("click", closeModal);
modalEl.addEventListener("click", (event) => {
  if (event.target === modalEl) closeModal();
});
modalTabButtons.forEach((btn) => {
  btn.addEventListener("click", () => activateModalPanel(btn.dataset.panel));
});

(async () => {
  try {
    await checkHealth();
    await loadCatalog();
    renderEventLog();
  } catch (_err) {
    healthPillEl.textContent = "API Unreachable";
  }
})();
