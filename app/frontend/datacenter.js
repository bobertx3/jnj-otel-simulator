/**
 * datacenter.js — Data center visualization with hotspot overlays
 */

const hotspotEls = {};
let onHotspotClick = null;

const SEVERITY_COLORS = {
  normal: "#66bb6a",
  warning: "#ffa726",
  critical: "#ef5350",
  idle: "#4dd0e1",
};

const DOMAIN_COLORS = {
  infrastructure: "#ffb566",
  networking: "#be85ff",
  applications: "#35d6ff",
};

function renderDataCenter(triplets, container, clickHandler) {
  onHotspotClick = clickHandler;
  container.innerHTML = "";

  // Image wrapper
  const wrapper = document.createElement("div");
  wrapper.className = "dc-wrapper";

  // Try loading the PNG image, fall back to SVG
  const img = new Image();
  img.src = "/static/img/data-center.png";
  img.alt = "Data Center Floor Plan";
  img.className = "dc-image";

  img.onload = () => {
    wrapper.appendChild(img);
    addHotspots(wrapper, triplets);
  };
  img.onerror = () => {
    wrapper.appendChild(createFallbackSVG());
    addHotspots(wrapper, triplets);
  };

  container.appendChild(wrapper);

  // Legend
  const legend = document.createElement("div");
  legend.className = "dc-legend";
  legend.innerHTML = `
    <span class="legend-item"><span class="legend-dot" style="background:${DOMAIN_COLORS.infrastructure}"></span> Infrastructure</span>
    <span class="legend-item"><span class="legend-dot" style="background:${DOMAIN_COLORS.networking}"></span> Networking</span>
    <span class="legend-item"><span class="legend-dot" style="background:${DOMAIN_COLORS.applications}"></span> Applications</span>
    <span class="legend-sep">|</span>
    <span class="legend-item"><span class="legend-dot" style="background:${SEVERITY_COLORS.normal}"></span> Normal</span>
    <span class="legend-item"><span class="legend-dot" style="background:${SEVERITY_COLORS.warning}"></span> Warning</span>
    <span class="legend-item"><span class="legend-dot" style="background:${SEVERITY_COLORS.critical}"></span> Critical</span>
  `;
  container.appendChild(legend);
}

function createFallbackSVG() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 1000 600");
  svg.setAttribute("class", "dc-image dc-fallback-svg");
  svg.innerHTML = `
    <defs>
      <linearGradient id="rack-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1a2a4d"/>
        <stop offset="100%" stop-color="#0d1730"/>
      </linearGradient>
      <linearGradient id="floor-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0a1225"/>
        <stop offset="100%" stop-color="#060d1d"/>
      </linearGradient>
    </defs>
    <!-- Floor -->
    <rect width="1000" height="600" fill="url(#floor-grad)" rx="8"/>
    <!-- Grid lines -->
    <g stroke="#152040" stroke-width="0.5" opacity="0.4">
      ${Array.from({length: 20}, (_, i) => `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="600"/>`).join("")}
      ${Array.from({length: 12}, (_, i) => `<line x1="0" y1="${i * 50}" x2="1000" y2="${i * 50}"/>`).join("")}
    </g>
    <!-- Zone labels -->
    <text x="110" y="45" fill="#ffb566" font-size="14" font-weight="600" opacity="0.8">COMPUTE RACKS</text>
    <text x="430" y="45" fill="#be85ff" font-size="14" font-weight="600" opacity="0.8">NETWORK CORE</text>
    <text x="730" y="45" fill="#35d6ff" font-size="14" font-weight="600" opacity="0.8">APP SERVICES</text>
    <!-- Infrastructure racks (left) -->
    <g>
      <rect x="30" y="70" width="180" height="90" rx="6" fill="url(#rack-grad)" stroke="#2a3b63" stroke-width="1"/>
      <rect x="40" y="80" width="160" height="12" rx="2" fill="#1e3050"/>
      <rect x="40" y="96" width="160" height="12" rx="2" fill="#1e3050"/>
      <rect x="40" y="112" width="160" height="12" rx="2" fill="#1e3050"/>
      <rect x="40" y="128" width="160" height="12" rx="2" fill="#1e3050"/>
      <rect x="40" y="144" width="60" height="8" rx="2" fill="#253658"/>
      <text x="120" y="155" fill="#4a5a80" font-size="8" text-anchor="middle">RACK A</text>
    </g>
    <g>
      <rect x="30" y="180" width="180" height="90" rx="6" fill="url(#rack-grad)" stroke="#2a3b63" stroke-width="1"/>
      <rect x="40" y="190" width="160" height="12" rx="2" fill="#1e3050"/>
      <rect x="40" y="206" width="160" height="12" rx="2" fill="#1e3050"/>
      <rect x="40" y="222" width="160" height="12" rx="2" fill="#1e3050"/>
      <rect x="40" y="238" width="160" height="12" rx="2" fill="#1e3050"/>
      <text x="120" y="265" fill="#4a5a80" font-size="8" text-anchor="middle">RACK B</text>
    </g>
    <g>
      <rect x="30" y="290" width="180" height="90" rx="6" fill="url(#rack-grad)" stroke="#2a3b63" stroke-width="1"/>
      <rect x="40" y="300" width="160" height="12" rx="2" fill="#1e3050"/>
      <rect x="40" y="316" width="160" height="12" rx="2" fill="#1e3050"/>
      <rect x="40" y="332" width="160" height="12" rx="2" fill="#1e3050"/>
      <rect x="40" y="348" width="160" height="12" rx="2" fill="#1e3050"/>
      <text x="120" y="375" fill="#4a5a80" font-size="8" text-anchor="middle">RACK C</text>
    </g>
    <!-- Network core (center) -->
    <g>
      <rect x="370" y="200" width="260" height="80" rx="8" fill="url(#rack-grad)" stroke="#4a3a78" stroke-width="1"/>
      <text x="500" y="245" fill="#be85ff" font-size="12" text-anchor="middle" opacity="0.7">CORE SWITCH</text>
    </g>
    <!-- Network subnets (bottom) -->
    <g>
      <rect x="280" y="400" width="140" height="50" rx="6" fill="url(#rack-grad)" stroke="#3a3068" stroke-width="1"/>
      <text x="350" y="430" fill="#9070c0" font-size="10" text-anchor="middle">Subnet 10.0.1.0/24</text>
    </g>
    <g>
      <rect x="430" y="400" width="140" height="50" rx="6" fill="url(#rack-grad)" stroke="#3a3068" stroke-width="1"/>
      <text x="500" y="430" fill="#9070c0" font-size="10" text-anchor="middle">Subnet 10.0.2.0/24</text>
    </g>
    <g>
      <rect x="580" y="400" width="140" height="50" rx="6" fill="url(#rack-grad)" stroke="#3a3068" stroke-width="1"/>
      <text x="650" y="430" fill="#9070c0" font-size="10" text-anchor="middle">Subnet 10.0.3.0/24</text>
    </g>
    <!-- App services (right) -->
    <g>
      <rect x="770" y="70" width="200" height="55" rx="6" fill="url(#rack-grad)" stroke="#1a4a6a" stroke-width="1"/>
      <text x="870" y="102" fill="#35d6ff" font-size="10" text-anchor="middle" opacity="0.7">Order Mgmt API</text>
    </g>
    <g>
      <rect x="770" y="140" width="200" height="55" rx="6" fill="url(#rack-grad)" stroke="#1a4a6a" stroke-width="1"/>
      <text x="870" y="172" fill="#35d6ff" font-size="10" text-anchor="middle" opacity="0.7">SAP Batch Proc</text>
    </g>
    <g>
      <rect x="770" y="210" width="200" height="55" rx="6" fill="url(#rack-grad)" stroke="#1a4a6a" stroke-width="1"/>
      <text x="870" y="242" fill="#35d6ff" font-size="10" text-anchor="middle" opacity="0.7">Customer Portal</text>
    </g>
    <g>
      <rect x="770" y="280" width="200" height="55" rx="6" fill="url(#rack-grad)" stroke="#1a4a6a" stroke-width="1"/>
      <text x="870" y="312" fill="#35d6ff" font-size="10" text-anchor="middle" opacity="0.7">Payment Gateway</text>
    </g>
    <g>
      <rect x="770" y="350" width="200" height="55" rx="6" fill="url(#rack-grad)" stroke="#1a4a6a" stroke-width="1"/>
      <text x="870" y="382" fill="#35d6ff" font-size="10" text-anchor="middle" opacity="0.7">ERP Hub</text>
    </g>
    <g>
      <rect x="770" y="420" width="200" height="55" rx="6" fill="url(#rack-grad)" stroke="#1a4a6a" stroke-width="1"/>
      <text x="870" y="452" fill="#35d6ff" font-size="10" text-anchor="middle" opacity="0.7">Inventory Sync</text>
    </g>
    <!-- Connection lines -->
    <g stroke="#2a3b63" stroke-width="1" stroke-dasharray="4,4" opacity="0.3">
      <line x1="210" y1="115" x2="770" y2="97"/>
      <line x1="210" y1="225" x2="770" y2="167"/>
      <line x1="210" y1="335" x2="770" y2="312"/>
      <line x1="500" y1="280" x2="350" y2="400"/>
      <line x1="500" y1="280" x2="500" y2="400"/>
      <line x1="500" y1="280" x2="650" y2="400"/>
    </g>
  `;
  return svg;
}

function addHotspots(wrapper, triplets) {
  // Clear existing hotspots
  Object.keys(hotspotEls).forEach((k) => delete hotspotEls[k]);

  triplets.forEach((triplet) => {
    [triplet.application, triplet.infrastructure, triplet.network].forEach((comp) => {
      const dot = document.createElement("div");
      dot.className = "hotspot";
      dot.style.left = `${comp.x}%`;
      dot.style.top = `${comp.y}%`;
      dot.dataset.componentId = comp.id;
      dot.dataset.domain = comp.domain;
      dot.dataset.tripletId = triplet.id;

      const domainColor = DOMAIN_COLORS[comp.domain] || "#4dd0e1";
      dot.style.setProperty("--dot-color", domainColor);

      // Pulse rings + dot + label
      dot.innerHTML = `
        <div class="pulse-ring ring-1"></div>
        <div class="pulse-ring ring-2"></div>
        <div class="hotspot-dot"></div>
        <div class="hotspot-label">${comp.label}</div>
      `;

      // Tooltip on hover
      const anchorX = comp.x > 70 ? " anchor-right" : comp.x < 15 ? " anchor-left" : "";
      const anchorY = comp.y < 15 ? " anchor-bottom" : "";
      const tooltip = document.createElement("div");
      tooltip.className = `hotspot-tooltip${anchorX}${anchorY}`;
      tooltip.innerHTML = `
        <div class="tooltip-header">${comp.label}</div>
        <div class="tooltip-meta">${comp.component_type} &middot; <span style="color:${domainColor}">${comp.domain}</span></div>
        <div class="tooltip-triplet">${triplet.label}</div>
      `;
      dot.appendChild(tooltip);

      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        if (onHotspotClick) {
          onHotspotClick(triplet.id, comp);
        }
      });

      wrapper.appendChild(dot);
      hotspotEls[comp.id] = dot;
    });
  });
}

function pulseHotspot(componentId, severity, durationMs = 3000) {
  const el = hotspotEls[componentId];
  if (!el) return;

  const color = SEVERITY_COLORS[severity] || SEVERITY_COLORS.idle;
  el.style.setProperty("--pulse-color", color);
  el.classList.add("pulsing", `severity-${severity}`);

  // Auto-clear after duration
  setTimeout(() => {
    el.classList.remove("pulsing", "severity-normal", "severity-warning", "severity-critical");
  }, durationMs);
}

function pulseEvents(events) {
  events.forEach((evt) => {
    pulseHotspot(evt.component_id, evt.severity);
  });
}

function clearAllPulses() {
  Object.values(hotspotEls).forEach((el) => {
    el.classList.remove("pulsing", "severity-normal", "severity-warning", "severity-critical");
  });
}
