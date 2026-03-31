/**
 * components.js — Rendering functions for the Operational Dashboard
 */

const DOMAIN_ORDER = ["applications", "infrastructure", "networking"];
const DOMAIN_LABELS = {
  applications: "Applications",
  infrastructure: "Infrastructure",
  networking: "Networking",
};

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

function renderKPIs(data) {
  document.getElementById("kpi-spans").textContent = formatNumber(data.total_spans);
  document.getElementById("kpi-incidents").textContent = formatNumber(data.active_incidents);
  document.getElementById("kpi-critical").textContent = formatNumber(data.critical_alerts);
  document.getElementById("kpi-rate").textContent = data.events_per_min.toFixed(1);
}

function renderDomainOverview(data, selectedId) {
  const container = document.getElementById("domain-container");
  const domains = data.domains || {};

  let totalComponents = 0;
  let html = "";

  for (const domain of DOMAIN_ORDER) {
    const components = domains[domain];
    if (!components || components.length === 0) continue;
    totalComponents += components.length;

    html += `<div class="domain-group">`;
    html += `<div class="domain-group-header">`;
    html += `<span class="domain-name"><span class="domain-dot ${domain}"></span>${DOMAIN_LABELS[domain] || domain}</span>`;
    html += `<span class="domain-count">${components.length}</span>`;
    html += `</div>`;
    html += `<div class="domain-cards">`;

    for (const c of components) {
      const sev = c.worst_severity || "normal";
      const isSelected = c.component_id === selectedId;
      html += `<div class="comp-card${isSelected ? " selected" : ""}" data-id="${c.component_id}">`;
      html += `<div class="comp-card-top">`;
      html += `<span class="comp-name" title="${c.component_id}">${formatComponentName(c.component_id)}</span>`;
      html += `<span class="severity-badge ${sev}">${sev}</span>`;
      html += `</div>`;
      html += `<div class="comp-metric">${formatNumber(c.event_count)}<small style="font-size:12px;color:var(--muted);font-weight:400"> events</small></div>`;
      html += `<div class="comp-meta">`;
      html += `<span>${c.component_id}</span>`;
      html += `<span>${c.incident_count} incident${c.incident_count !== 1 ? "s" : ""}</span>`;
      html += `</div>`;
      html += `</div>`;
    }

    html += `</div></div>`;
  }

  // Include any unknown domains
  for (const domain of Object.keys(domains)) {
    if (!DOMAIN_ORDER.includes(domain)) {
      const components = domains[domain];
      if (!components || components.length === 0) continue;
      totalComponents += components.length;

      html += `<div class="domain-group">`;
      html += `<div class="domain-group-header">`;
      html += `<span class="domain-name"><span class="domain-dot"></span>${domain}</span>`;
      html += `<span class="domain-count">${components.length}</span>`;
      html += `</div>`;
      html += `<div class="domain-cards">`;

      for (const c of components) {
        const sev = c.worst_severity || "normal";
        const isSelected = c.component_id === selectedId;
        html += `<div class="comp-card${isSelected ? " selected" : ""}" data-id="${c.component_id}">`;
        html += `<div class="comp-card-top">`;
        html += `<span class="comp-name" title="${c.component_id}">${formatComponentName(c.component_id)}</span>`;
        html += `<span class="severity-badge ${sev}">${sev}</span>`;
        html += `</div>`;
        html += `<div class="comp-metric">${formatNumber(c.event_count)}<small style="font-size:12px;color:var(--muted);font-weight:400"> events</small></div>`;
        html += `<div class="comp-meta">`;
        html += `<span>${c.component_id}</span>`;
        html += `<span>${c.incident_count} incident${c.incident_count !== 1 ? "s" : ""}</span>`;
        html += `</div>`;
        html += `</div>`;
      }

      html += `</div></div>`;
    }
  }

  if (!html) {
    html = `<div class="loading">No telemetry data found in this time range</div>`;
  }

  container.innerHTML = html;
  document.getElementById("component-count").textContent = `${totalComponents} components`;

  // Attach click handlers
  container.querySelectorAll(".comp-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.id;
      if (typeof window.selectComponent === "function") {
        window.selectComponent(id);
      }
    });
  });
}

function formatComponentName(id) {
  if (!id) return "Unknown";
  return id
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderDetailPanel(data) {
  const panel = document.getElementById("detail-panel");
  const events = data.events || [];

  if (events.length === 0) {
    panel.innerHTML = `
      <div class="detail-header">
        <h3>${formatComponentName(data.component_id)}</h3>
        <div class="detail-id">${data.component_id}</div>
      </div>
      <div class="loading">No events in this time range</div>`;
    return;
  }

  // Compute summary stats
  let criticalCount = 0;
  let warningCount = 0;
  let normalCount = 0;
  let totalRevenue = 0;
  let totalUsers = 0;
  let slaBreaches = 0;
  const rootCauses = new Set();

  for (const e of events) {
    if (e.severity === "critical") criticalCount++;
    else if (e.severity === "warning") warningCount++;
    else normalCount++;
    if (e.revenue_usd) totalRevenue += parseFloat(e.revenue_usd) || 0;
    if (e.users_affected) totalUsers += parseInt(e.users_affected) || 0;
    if (e.sla_breach === "true" || e.sla_breach === "True") slaBreaches++;
    if (e.root_cause) rootCauses.add(e.root_cause);
  }

  let html = `
    <div class="detail-header">
      <h3>${formatComponentName(data.component_id)}</h3>
      <div class="detail-id">${data.component_id}</div>
    </div>

    <div class="detail-section">
      <h4>Summary</h4>
      <div class="detail-kv"><span class="label">Total Events</span><span class="value">${events.length}</span></div>
      <div class="detail-kv"><span class="label">Critical</span><span class="value" style="color:var(--critical-color)">${criticalCount}</span></div>
      <div class="detail-kv"><span class="label">Warning</span><span class="value" style="color:var(--warning-color)">${warningCount}</span></div>
      <div class="detail-kv"><span class="label">Normal</span><span class="value" style="color:var(--normal-color)">${normalCount}</span></div>
      ${totalRevenue > 0 ? `<div class="detail-kv"><span class="label">Revenue Impact</span><span class="value">$${formatNumber(Math.round(totalRevenue))}</span></div>` : ""}
      ${totalUsers > 0 ? `<div class="detail-kv"><span class="label">Users Affected</span><span class="value">${formatNumber(totalUsers)}</span></div>` : ""}
      ${slaBreaches > 0 ? `<div class="detail-kv"><span class="label">SLA Breaches</span><span class="value" style="color:var(--critical-color)">${slaBreaches}</span></div>` : ""}
    </div>`;

  if (rootCauses.size > 0) {
    html += `<div class="detail-section"><h4>Root Causes</h4>`;
    for (const rc of rootCauses) {
      html += `<div style="font-size:12px;color:var(--text);padding:4px 0;border-bottom:1px solid rgba(38,54,91,0.3)">${rc}</div>`;
    }
    html += `</div>`;
  }

  html += `<div class="detail-section"><h4>Recent Events</h4><div class="detail-events">`;
  for (const e of events.slice(0, 30)) {
    const sev = e.severity || "normal";
    const time = e.time ? new Date(e.time).toLocaleTimeString() : "";
    html += `<div class="detail-event-row">`;
    html += `<span class="detail-severity-dot ${sev}"></span>`;
    html += `<span class="detail-event-time">${time}</span>`;
    html += `<span class="detail-event-name">${e.span_name || "—"}</span>`;
    if (e.priority) html += `<span style="font-size:10px;color:var(--muted)">${e.priority}</span>`;
    html += `</div>`;
  }
  html += `</div></div>`;

  panel.innerHTML = html;
}

function resetDetailPanel() {
  document.getElementById("detail-panel").innerHTML = `
    <div class="detail-empty">
      <div class="icon">&#9881;</div>
      <p><strong>Select a component to view details</strong></p>
      <p>Click any component card on the left</p>
    </div>`;
}
