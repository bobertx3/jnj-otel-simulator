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
  // SVG viewBox 1000x600. No text labels inside boxes — hotspot labels provide all names.
  svg.setAttribute("viewBox", "0 0 1000 600");
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
    <rect width="1000" height="600" fill="url(#floor-grad)" rx="8"/>
    <g stroke="#152040" stroke-width="0.5" opacity="0.3">
      ${Array.from({length: 21}, (_, i) => `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="600"/>`).join("")}
      ${Array.from({length: 13}, (_, i) => `<line x1="0" y1="${i * 50}" x2="1000" y2="${i * 50}"/>`).join("")}
    </g>

    <!-- Zone labels -->
    <text x="155" y="38" fill="#ffb566" font-size="13" font-weight="600" opacity="0.7" text-anchor="middle">COMPUTE RACKS</text>
    <text x="500" y="38" fill="#be85ff" font-size="13" font-weight="600" opacity="0.7" text-anchor="middle">NETWORK CORE</text>
    <text x="845" y="38" fill="#35d6ff" font-size="13" font-weight="600" opacity="0.7" text-anchor="middle">APP SERVICES</text>

    <!-- INFRASTRUCTURE RACKS (left) -->
    <!-- Rack A (3 pods stacked): y=55..195 -->
    <g>
      <rect x="30" y="55" width="250" height="140" rx="6" fill="url(#rack-grad)" stroke="#2a3b63"/>
      <rect x="42" y="68" width="226" height="8" rx="2" fill="#1e3050"/>
      <rect x="42" y="100" width="226" height="8" rx="2" fill="#1e3050"/>
      <rect x="42" y="132" width="226" height="8" rx="2" fill="#1e3050"/>
      <rect x="42" y="164" width="226" height="8" rx="2" fill="#1e3050"/>
      <text x="155" y="190" fill="#4a5a80" font-size="8" text-anchor="middle">RACK A — cluster-a</text>
    </g>
    <!-- Rack B (2 pods): y=215..340 -->
    <g>
      <rect x="30" y="215" width="250" height="125" rx="6" fill="url(#rack-grad)" stroke="#2a3b63"/>
      <rect x="42" y="228" width="226" height="8" rx="2" fill="#1e3050"/>
      <rect x="42" y="258" width="226" height="8" rx="2" fill="#1e3050"/>
      <rect x="42" y="288" width="226" height="8" rx="2" fill="#1e3050"/>
      <rect x="42" y="318" width="226" height="8" rx="2" fill="#1e3050"/>
      <text x="155" y="336" fill="#4a5a80" font-size="8" text-anchor="middle">RACK B — cluster-b</text>
    </g>
    <!-- Rack C (1 pod): y=365..460 -->
    <g>
      <rect x="30" y="365" width="250" height="95" rx="6" fill="url(#rack-grad)" stroke="#2a3b63"/>
      <rect x="42" y="378" width="226" height="8" rx="2" fill="#1e3050"/>
      <rect x="42" y="398" width="226" height="8" rx="2" fill="#1e3050"/>
      <rect x="42" y="418" width="226" height="8" rx="2" fill="#1e3050"/>
      <rect x="42" y="438" width="226" height="8" rx="2" fill="#1e3050"/>
      <text x="155" y="456" fill="#4a5a80" font-size="8" text-anchor="middle">RACK C — cluster-c</text>
    </g>

    <!-- NETWORK CORE (center) -->
    <g>
      <rect x="370" y="170" width="260" height="70" rx="8" fill="url(#rack-grad)" stroke="#4a3a78"/>
    </g>
    <g>
      <rect x="345" y="340" width="150" height="50" rx="6" fill="url(#rack-grad)" stroke="#3a3068"/>
    </g>
    <g>
      <rect x="510" y="340" width="150" height="50" rx="6" fill="url(#rack-grad)" stroke="#3a3068"/>
    </g>
    <g>
      <rect x="425" y="440" width="150" height="50" rx="6" fill="url(#rack-grad)" stroke="#3a3068"/>
    </g>

    <!-- APP SERVICES (right, 6 boxes, each 65px tall with 8px gap) -->
    <g><rect x="720" y="55"  width="250" height="65" rx="6" fill="url(#rack-grad)" stroke="#1a4a6a"/></g>
    <g><rect x="720" y="128" width="250" height="65" rx="6" fill="url(#rack-grad)" stroke="#1a4a6a"/></g>
    <g><rect x="720" y="201" width="250" height="65" rx="6" fill="url(#rack-grad)" stroke="#1a4a6a"/></g>
    <g><rect x="720" y="274" width="250" height="65" rx="6" fill="url(#rack-grad)" stroke="#1a4a6a"/></g>
    <g><rect x="720" y="347" width="250" height="65" rx="6" fill="url(#rack-grad)" stroke="#1a4a6a"/></g>
    <g><rect x="720" y="420" width="250" height="65" rx="6" fill="url(#rack-grad)" stroke="#1a4a6a"/></g>

    <!-- CONNECTION LINES -->
    <g stroke="#2a3b63" stroke-width="1" stroke-dasharray="4,4" opacity="0.2">
      <line x1="280" y1="100" x2="720" y2="87"/>
      <line x1="280" y1="130" x2="720" y2="233"/>
      <line x1="280" y1="155" x2="720" y2="452"/>
      <line x1="280" y1="260" x2="720" y2="160"/>
      <line x1="280" y1="290" x2="720" y2="379"/>
      <line x1="280" y1="410" x2="720" y2="306"/>
      <line x1="500" y1="240" x2="420" y2="340"/>
      <line x1="500" y1="240" x2="585" y2="340"/>
      <line x1="500" y1="240" x2="500" y2="440"/>
    </g>
  `;
  return svg;
}

function addHotspots(wrapper, triplets) {
  // Clear existing hotspots
  Object.keys(hotspotEls).forEach((k) => delete hotspotEls[k]);
  const placed = new Set(); // dedupe shared components (e.g. same subnet in multiple triplets)

  triplets.forEach((triplet) => {
    [triplet.application, triplet.infrastructure, triplet.network].forEach((comp) => {
      if (placed.has(comp.id)) return;
      placed.add(comp.id);
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
