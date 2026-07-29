/**
 * SAB & Deluge Card for Home Assistant
 * Version 0.1.2
 *
 * A focused download-queue card backed by martinargalas/arr-stack-integration.
 * The visual design is inspired by martinargalas/ha-arr-stack-card (MIT).
 *
 * Copyright (c) 2026 martinargalas
 * Copyright (c) 2026 Travis Matzdorf
 * SPDX-License-Identifier: MIT
 */

const SAB_DELUGE_CARD_VERSION = "0.1.2";

const DEFAULT_CONFIG = Object.freeze({
  show_total_speed: true,
  show_sabnzbd: true,
  show_deluge: true,
  show_upload_speed: true,
  allow_controls: true,
  items_per_page: 3,
  refresh_interval: 10,
  application_icons: "real",
});

// Matches the CDN path used by Arr Stack Card. The walkxcode repository was
// transferred to homarr-labs, so only this path is guaranteed to resolve.
const APP_ICONS = Object.freeze({
  sabnzbd: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/sabnzbd.svg",
  deluge: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/deluge.svg",
});

const APP_LABELS = Object.freeze({
  sabnzbd: "SABnzbd",
  deluge: "Deluge",
});

const MDI_ICONS = Object.freeze({
  sabnzbd: "mdi:download-box",
  deluge: "mdi:water",
});

const DELUGE_STATE_PRIORITY = Object.freeze({
  downloading: 0,
  queued: 1,
  checking: 2,
  allocating: 3,
  moving: 4,
  paused: 5,
  error: 6,
});

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const numberValue = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sameConfig = (left, right) => {
  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  for (const key of keys) {
    if (left?.[key] !== right?.[key]) return false;
  }
  return true;
};

class SabDelugeCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = { ...DEFAULT_CONFIG };
    this._rendered = false;
  }

  set hass(hass) {
    this._hass = hass;
  }

  setConfig(config) {
    const next = { ...DEFAULT_CONFIG, ...(config || {}) };
    // Home Assistant echoes every config-changed event straight back into
    // setConfig. Rebuilding the DOM here would tear down the live <select> and
    // number inputs mid-interaction, closing an open dropdown and dropping
    // keyboard focus, so only re-render when a value actually differs.
    const unchanged = this._rendered && sameConfig(next, this._config);
    this._config = next;
    if (unchanged) return;
    this._render();
  }

  connectedCallback() {
    if (!this._rendered) this._render();
  }

  _update(key, value) {
    this._config = { ...this._config, [key]: value };
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _render() {
    if (!this.shadowRoot) return;
    const cfg = this._config;
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          color: var(--primary-text-color);
          font-family: var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
        }
        .section {
          margin: 0 0 20px;
        }
        .section:last-child {
          margin-bottom: 0;
        }
        .title {
          margin: 0 0 10px;
          padding-bottom: 5px;
          border-bottom: 1px solid var(--divider-color);
          color: var(--secondary-text-color);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .row {
          display: flex;
          align-items: center;
          gap: 12px;
          min-height: 34px;
          margin-bottom: 8px;
        }
        .label {
          flex: 1;
          font-size: 13px;
        }
        .hint {
          margin: -4px 0 10px;
          color: var(--secondary-text-color);
          font-size: 11px;
          line-height: 1.4;
        }
        select,
        input[type="number"] {
          box-sizing: border-box;
          width: 150px;
          padding: 6px 8px;
          border: 1px solid var(--divider-color);
          border-radius: 7px;
          background: var(--card-background-color);
          color: var(--primary-text-color);
          font: inherit;
          font-size: 13px;
        }
        .toggle {
          position: relative;
          width: 38px;
          height: 22px;
          flex: 0 0 auto;
        }
        .toggle input {
          position: absolute;
          width: 0;
          height: 0;
          opacity: 0;
        }
        .slider {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: var(--divider-color);
          cursor: pointer;
          transition: background .18s ease;
        }
        .slider::before {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          content: "";
          transition: transform .18s ease;
          box-shadow: 0 1px 3px rgba(0, 0, 0, .28);
        }
        input:checked + .slider {
          background: var(--primary-color);
        }
        input:checked + .slider::before {
          transform: translateX(16px);
        }
      </style>

      <div class="section">
        <div class="title">Download clients</div>
        ${this._toggleRow("show_sabnzbd", "Show SABnzbd")}
        ${this._toggleRow("show_deluge", "Show Deluge")}
      </div>

      <div class="section">
        <div class="title">Display</div>
        ${this._toggleRow("show_total_speed", "Show total speed")}
        ${this._toggleRow("show_upload_speed", "Show Deluge upload speed")}
        ${this._toggleRow("allow_controls", "Allow controls")}
        <div class="hint">Controls include global pause/resume, queue removal, and Deluge item pause/resume.</div>
        <div class="row">
          <span class="label">Items per page</span>
          <input type="number" min="1" max="10" step="1" data-number="items_per_page"
            value="${Number(cfg.items_per_page) || DEFAULT_CONFIG.items_per_page}">
        </div>
        <div class="row">
          <span class="label">Refresh interval</span>
          <input type="number" min="5" max="300" step="5" data-number="refresh_interval"
            value="${Number(cfg.refresh_interval) || DEFAULT_CONFIG.refresh_interval}">
        </div>
        <div class="hint">Seconds between live queue and speed updates. Minimum: 5 seconds.</div>
        <div class="row">
          <span class="label">Application icons</span>
          <select data-select="application_icons">
            <option value="real" ${cfg.application_icons === "real" ? "selected" : ""}>Real logos</option>
            <option value="mdi" ${cfg.application_icons === "mdi" ? "selected" : ""}>Material Design</option>
          </select>
        </div>
      </div>
    `;

    this.shadowRoot.querySelectorAll("[data-toggle]").forEach((input) => {
      input.addEventListener("change", () => this._update(input.dataset.toggle, input.checked));
    });
    this.shadowRoot.querySelectorAll("[data-number]").forEach((input) => {
      input.addEventListener("change", () => {
        const key = input.dataset.number;
        const min = key === "refresh_interval" ? 5 : 1;
        const max = key === "refresh_interval" ? 300 : 10;
        const value = Math.max(min, Math.min(max, Number.parseInt(input.value, 10) || min));
        input.value = String(value);
        this._update(key, value);
      });
    });
    this.shadowRoot.querySelectorAll("[data-select]").forEach((select) => {
      select.addEventListener("change", () => this._update(select.dataset.select, select.value));
    });

    this._rendered = true;
  }

  _toggleRow(key, label) {
    return `
      <div class="row">
        <span class="label">${label}</span>
        <label class="toggle">
          <input type="checkbox" data-toggle="${key}" ${this._config[key] !== false ? "checked" : ""}>
          <span class="slider"></span>
        </label>
      </div>
    `;
  }
}

class SabDelugeCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = { ...DEFAULT_CONFIG };
    this._caps = null;
    this._sab = {};
    this._delugeRaw = [];
    this._delugeStatus = {};
    this._pages = { sabnzbd: 0, deluge: 0 };
    this._delugeSort = "progress_desc";
    this._busy = new Set();
    this._confirm = null;
    this._error = "";
    this._fetching = false;
    this._connected = false;
    this._initialized = false;
    this._interval = null;
    this._root = null;
    this._lastHtml = "";
  }

  set hass(hass) {
    this._hass = hass;
    if (this._connected && !this._initialized) this._start();
  }

  setConfig(config) {
    if (!config) throw new Error("SAB & Deluge Card configuration is required");
    this._config = {
      ...DEFAULT_CONFIG,
      ...config,
      items_per_page: Math.max(1, Math.min(10, Number.parseInt(config.items_per_page, 10) || DEFAULT_CONFIG.items_per_page)),
      refresh_interval: Math.max(5, Math.min(300, Number.parseInt(config.refresh_interval, 10) || DEFAULT_CONFIG.refresh_interval)),
    };
    if (this._connected) {
      this._scheduleRefresh();
      if (this._hass && this._initialized) this._fetchData();
      else this._render();
    }
  }

  connectedCallback() {
    this._connected = true;
    if (!this._hass) {
      this._render();
      return;
    }
    if (this._initialized) {
      // Home Assistant detaches and re-attaches card elements when the user
      // switches dashboard views. disconnectedCallback cleared the timer, and
      // _start() short-circuits once initialized, so polling has to be restarted
      // explicitly or the card would display stale data until a full reload.
      this._render();
      this._fetchData();
      this._scheduleRefresh();
      return;
    }
    this._start();
  }

  disconnectedCallback() {
    this._connected = false;
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  async _start() {
    if (this._initialized || !this._hass) return;
    this._initialized = true;
    this._render();
    await this._fetchData();
    this._scheduleRefresh();
  }

  _scheduleRefresh() {
    if (this._interval) clearInterval(this._interval);
    if (!this._connected) return;
    const milliseconds = this._config.refresh_interval * 1000;
    this._interval = setInterval(() => this._fetchData(), milliseconds);
  }

  async _fetchData() {
    if (this._fetching || !this._hass) return;
    this._fetching = true;

    const failures = [];
    // Each request reports its own failure so one client going down never hides
    // the other's data, and the banner can name which client actually broke.
    const run = async (label, path, apply) => {
      try {
        apply(await this._hass.callApi("GET", path));
      } catch (error) {
        console.error(`SAB & Deluge Card: ${label} request to ${path} failed`, error);
        failures.push(this._describeFailure(label, error));
      }
    };

    try {
      if (!this._caps) {
        await run("Arr Stack Integration", "arr_stack/capabilities/info", (data) => {
          this._caps = data;
        });
      }

      const tasks = [];
      if (this._caps?.sabnzbd && this._config.show_sabnzbd !== false) {
        tasks.push(
          run("SABnzbd", "arr_stack/sabnzbd/queue", (data) => {
            if (data?.status === false) throw new Error(data.error || "SABnzbd returned an error");
            this._sab = data?.queue || {};
          }),
        );
      } else {
        this._sab = {};
      }

      if (this._caps?.deluge && this._config.show_deluge !== false) {
        tasks.push(
          run("Deluge", "arr_stack/deluge/queue", (data) => {
            this._delugeRaw = Array.isArray(data) ? data : [];
          }),
          run("Deluge", "arr_stack/deluge/status", (data) => {
            this._delugeStatus = data || {};
          }),
        );
      } else {
        this._delugeRaw = [];
        this._delugeStatus = {};
      }

      await Promise.all(tasks);

      const silent = this._delugeSilentFailure();
      if (silent) failures.push(silent);

      // Both Deluge calls fail together, so collapse the duplicate message.
      this._error = [...new Set(failures)].join(" ");
    } finally {
      this._fetching = false;
      this._clampPages();
      this._render();
    }
  }

  /**
   * Arr Stack Integration does not check Deluge's auth.login result. A wrong
   * Deluge password therefore returns HTTP 200 with an empty torrent list and
   * an empty transfer status instead of an error, which is indistinguishable
   * from an idle daemon unless the missing transfer fields are checked.
   */
  _delugeSilentFailure() {
    if (!this._caps?.deluge || this._config.show_deluge === false) return "";
    const status = this._delugeStatus;
    const answered = status && typeof status === "object" && "download_rate" in status;
    if (answered || this._delugeRaw.length > 0) return "";
    return "Deluge returned no data. If it has active torrents, check the Deluge password in Arr Stack Integration.";
  }

  _describeFailure(label, error) {
    const status = error?.status_code ?? error?.status ?? 0;
    const raw = this._errorText(error);

    if (status === 404) {
      return `${label}: the arr_stack endpoint was not found. Update Arr Stack Integration and restart Home Assistant.`;
    }
    // Only the literal "not configured" body means the service is missing from
    // the config entry. The integration also returns 503 for a failed TCP
    // connection, with a localised message ("Nelze se pripojit" = cannot
    // connect), and reporting that as "not configured" points at the wrong fix.
    if (/not configured/i.test(raw)) {
      return `${label} is not configured in Arr Stack Integration.`;
    }
    if (status === 503 || /nelze se p\W?ipojit|cannot connect|connect(ion)? (refused|error|timeout)/i.test(raw)) {
      return `${label} is configured, but Home Assistant could not connect to it. Check its URL, port, and credentials in Arr Stack Integration.`;
    }

    const detail = raw.replace(/\s+/g, " ").trim();
    if (!detail) return `${label}: request failed${status ? ` with status ${status}` : ""}.`;
    return `${label}: ${detail.length > 140 ? `${detail.slice(0, 137)}...` : detail}`;
  }

  _errorText(error) {
    if (!error) return "";
    if (typeof error === "string") return error;

    const body = error.body;
    // Prefer the integration's own message over Home Assistant's generic
    // "Response error: <status>" wrapper.
    if (body && typeof body === "object" && typeof body.error === "string") return body.error;
    if (typeof body === "string" && body) return body;
    if (typeof error.message === "string" && error.message) return error.message;
    if (typeof error.error === "string" && error.error) return error.error;
    if (body && typeof body === "object") {
      try {
        const json = JSON.stringify(body);
        return json === "{}" ? "" : json;
      } catch {
        return "";
      }
    }
    // Never fall back to String(object): "[object Object]" tells nobody
    // anything, and the caller reports the status code instead.
    return "";
  }

  _sabSlots() {
    return Array.isArray(this._sab?.slots) ? this._sab.slots : [];
  }

  _sabPaused() {
    // SABnzbd exposes an authoritative `paused` boolean. `status` is only a
    // display string and reads "Idle" for a paused but empty queue, which would
    // otherwise leave the global button offering Pause on an already-paused SAB.
    const queue = this._sab || {};
    if (typeof queue.paused === "boolean") return queue.paused;
    return String(queue.status || "").toLowerCase() === "paused";
  }

  _filterDeluge(torrents = this._delugeRaw) {
    return (Array.isArray(torrents) ? torrents : [])
      .filter((torrent) => {
        const progress = numberValue(torrent?.progress);
        const state = String(torrent?.state || "").toLowerCase();
        // Deluge has no separate history endpoint here. Completed and seeding
        // torrents are live daemon records, but they are intentionally hidden
        // so the card represents only the current incomplete queue.
        return progress < 100 && state !== "seeding";
      })
      .sort((a, b) => {
        const [field, direction] = this._delugeSort.split("_");
        let left;
        let right;
        if (field === "speed") {
          left = numberValue(a.download_payload_rate);
          right = numberValue(b.download_payload_rate);
        } else if (field === "state") {
          left = DELUGE_STATE_PRIORITY[String(a.state || "").toLowerCase()] ?? 99;
          right = DELUGE_STATE_PRIORITY[String(b.state || "").toLowerCase()] ?? 99;
        } else {
          left = numberValue(a.progress);
          right = numberValue(b.progress);
        }
        return direction === "asc" ? left - right : right - left;
      });
  }

  _clampPages() {
    const perPage = this._config.items_per_page;
    const slots = this._sabSlots();
    const torrents = this._filterDeluge();
    const counts = {
      sabnzbd: slots.length,
      deluge: torrents.length,
    };
    Object.entries(counts).forEach(([section, count]) => {
      const lastPage = Math.max(0, Math.ceil(count / perPage) - 1);
      this._pages[section] = Math.min(this._pages[section] || 0, lastPage);
    });

    // Drop a pending removal confirmation if its target finished or was removed
    // elsewhere, so the prompt can never outlive the row it belongs to.
    if (this._confirm) {
      const ids = this._confirm.type === "sab"
        ? slots.map((slot) => String(slot?.nzo_id || ""))
        : torrents.map((torrent) => String(torrent?.hash || ""));
      if (!ids.includes(String(this._confirm.id))) this._confirm = null;
    }
  }

  _page(items, section) {
    const perPage = this._config.items_per_page;
    const totalPages = Math.max(1, Math.ceil(items.length / perPage));
    const page = Math.min(this._pages[section] || 0, totalPages - 1);
    const start = page * perPage;
    return {
      page,
      totalPages,
      start,
      items: items.slice(start, start + perPage),
    };
  }

  _render() {
    if (!this.shadowRoot) return;
    const capsReady = this._caps !== null;
    const sabConfigured = this._caps?.sabnzbd === true;
    const delugeConfigured = this._caps?.deluge === true;
    const showSab = this._config.show_sabnzbd !== false && (!capsReady || sabConfigured);
    const showDeluge = this._config.show_deluge !== false && (!capsReady || delugeConfigured);

    const content = !this._hass
      ? this._loadingHtml("Waiting for Home Assistant")
      : !capsReady
        ? this._loadingHtml("Loading download queues")
        : !showSab && !showDeluge
          ? this._emptyCardHtml(sabConfigured, delugeConfigured)
          : `
            ${this._config.show_total_speed !== false ? this._renderSpeedCard(showSab, showDeluge) : ""}
            <div class="section-stack">
              ${showSab ? this._renderSabSection() : ""}
              ${showDeluge ? this._renderDelugeSection() : ""}
            </div>
          `;

    const html = `
      <ha-card>
        <div class="card-content">
          ${this._error ? `<div class="error-banner"><ha-icon icon="mdi:alert-circle-outline"></ha-icon><span>${escapeHtml(this._error)}</span></div>` : ""}
          ${content}
        </div>
      </ha-card>
    `;

    // A poll tick on an idle or paused queue produces byte-identical markup.
    // Skipping those leaves the live DOM alone instead of destroying and
    // re-upgrading every ha-icon, which is what made refreshes visibly flash.
    if (this._root && html === this._lastHtml) return;
    this._lastHtml = html;

    if (!this._root) {
      // Mount the stylesheet once so refreshes never re-parse it.
      const style = document.createElement("style");
      style.textContent = this._styles();
      const root = document.createElement("div");
      root.className = "sd-root";
      this.shadowRoot.replaceChildren(style, root);
      this._root = root;
    }

    this._root.innerHTML = html;
    this._wireEvents();
  }

  _loadingHtml(label) {
    return `
      <div class="loading">
        <span class="spinner"></span>
        <span>${label}</span>
      </div>
    `;
  }

  _emptyCardHtml(sabConfigured, delugeConfigured) {
    const details = !sabConfigured && !delugeConfigured
      ? "Configure SABnzbd and/or Deluge in Arr Stack Integration."
      : "Both download sections are disabled in the card editor.";
    return `
      <div class="empty-card">
        <ha-icon icon="mdi:download-off-outline"></ha-icon>
        <strong>No download clients to display</strong>
        <span>${details}</span>
      </div>
    `;
  }

  _renderSpeedCard(showSab, showDeluge) {
    const sabBytes = showSab ? numberValue(this._sab?.kbpersec) * 1024 : 0;
    const delugeDown = showDeluge ? numberValue(this._delugeStatus?.download_rate) : 0;
    const delugeUp = showDeluge ? numberValue(this._delugeStatus?.upload_rate) : 0;
    const download = sabBytes + delugeDown;
    const pieces = [];
    if (showDeluge) pieces.push(`Deluge ${this._fmtSpeed(delugeDown)}`);
    if (showSab) pieces.push(`SABnzbd ${this._fmtSpeed(sabBytes)}`);

    return `
      <section class="speed-card">
        <div class="speed-title">TOTAL SPEED</div>
        <div class="speed-pills">
          <span class="speed-pill download">
            <ha-icon icon="mdi:download"></ha-icon>
            <b>${this._fmtSpeed(download)}</b>
          </span>
          ${showDeluge && this._config.show_upload_speed !== false ? `
            <span class="speed-pill upload">
              <ha-icon icon="mdi:upload"></ha-icon>
              <b>${this._fmtSpeed(delugeUp)}</b>
            </span>
          ` : ""}
        </div>
        <div class="speed-subtitle">${pieces.join(" · ") || "No download clients"}</div>
      </section>
    `;
  }

  _renderSabSection() {
    const slots = this._sabSlots();
    const pageData = this._page(slots, "sabnzbd");
    const isPaused = this._sabPaused();
    const items = pageData.items.length
      ? pageData.items.map((slot, index) => this._renderSabItem(slot, pageData.start + index)).join("")
      : this._queueEmpty("No active or queued SABnzbd downloads");

    return `
      <section class="client-section sab-section">
        <div class="client-header">
          ${this._appIcon("sabnzbd")}
          <span class="client-name">SABnzbd</span>
          <span class="header-line"></span>
          ${this._config.allow_controls !== false ? `
            <button class="round-btn global-btn ${isPaused ? "resume" : ""}" data-sab-global="${isPaused ? "resume" : "pause"}"
              title="${isPaused ? "Resume SABnzbd" : "Pause SABnzbd"}" aria-label="${isPaused ? "Resume SABnzbd" : "Pause SABnzbd"}"
              ${this._busy.has("sab:global") ? "disabled" : ""}>
              ${this._busy.has("sab:global") ? '<span class="spinner small"></span>' : `<ha-icon icon="${isPaused ? "mdi:play" : "mdi:pause"}"></ha-icon>`}
            </button>
          ` : ""}
        </div>
        ${this._pager("sabnzbd", pageData, items)}
      </section>
    `;
  }

  _renderSabItem(slot, absoluteIndex) {
    const id = String(slot?.nzo_id || "");
    const name = escapeHtml(slot?.filename || slot?.name || "Unknown download");
    const percent = Math.max(0, Math.min(100, Math.round(numberValue(slot?.percentage))));
    const totalMb = numberValue(slot?.mb);
    const leftMb = numberValue(slot?.mbleft);
    const doneMb = Math.max(0, totalMb - leftMb);
    const statusRaw = String(slot?.status || "Queued");
    const status = statusRaw.toLowerCase();
    const globalSpeed = numberValue(this._sab?.kbpersec) * 1024;
    const downloading = status.includes("download") || (absoluteIndex === 0 && globalSpeed > 0 && leftMb > 0);
    const globallyPaused = this._sabPaused();
    const displayedStatus = globallyPaused && (downloading || status === "queued") ? "Paused" : statusRaw;
    const statusStyle = this._sabStatus(displayedStatus, downloading && !globallyPaused);
    const eta = slot?.timeleft && slot.timeleft !== "0:00:00" ? escapeHtml(slot.timeleft) : "—";
    const confirm = this._confirm?.type === "sab" && this._confirm.id === id;
    const busy = this._busy.has(`sab:${id}`);

    let controls = "";
    if (this._config.allow_controls !== false) {
      if (busy) {
        controls = '<span class="spinner small"></span>';
      } else if (confirm) {
        controls = `
          <button class="tiny-btn cancel" data-cancel title="Cancel"><ha-icon icon="mdi:close"></ha-icon></button>
          <button class="tiny-btn danger" data-sab-delete="${escapeHtml(id)}" title="Remove from SABnzbd queue"><ha-icon icon="mdi:delete"></ha-icon></button>
        `;
      } else {
        controls = `
          <button class="tiny-btn" data-confirm-sab="${escapeHtml(id)}" title="Remove from SABnzbd queue"><ha-icon icon="mdi:delete-outline"></ha-icon></button>
        `;
      }
    }

    const pill = downloading && !globallyPaused
      ? `<span class="metric live"><ha-icon icon="mdi:download"></ha-icon><b>${this._fmtSpeed(globalSpeed)}</b></span>`
      : `<span class="status-pill ${statusStyle.className}"><ha-icon icon="${statusStyle.icon}"></ha-icon>${escapeHtml(statusStyle.label)}</span>`;

    return `
      <article class="queue-item">
        <div class="item-top">
          <span class="item-name" title="${name}">${name}</span>
          <span class="item-percent">${percent}%</span>
          <span class="item-controls">${controls}</span>
        </div>
        <div class="item-meta">
          ${pill}
          ${downloading && !globallyPaused ? `<span class="metric"><ha-icon icon="mdi:clock-outline"></ha-icon><b>${eta}</b></span>` : ""}
          <span class="metric"><ha-icon icon="mdi:harddisk"></ha-icon><b>${this._fmtSize(doneMb * 1024 * 1024)} / ${this._fmtSize(totalMb * 1024 * 1024)}</b></span>
        </div>
        <div class="progress-track"><div class="progress-fill ${statusStyle.barClass}" style="width:${percent}%"></div></div>
      </article>
    `;
  }

  _sabStatus(statusValue, downloading) {
    if (downloading) return { className: "green", icon: "mdi:download", label: "Downloading", barClass: "blue-bar" };
    const value = String(statusValue || "Queued").toLowerCase();
    if (value.includes("pause")) return { className: "orange", icon: "mdi:pause-circle", label: "Paused", barClass: "orange-bar" };
    if (value.includes("check")) return { className: "teal", icon: "mdi:magnify", label: "Checking", barClass: "teal-bar" };
    if (value.includes("verify")) return { className: "teal", icon: "mdi:shield-check", label: "Verifying", barClass: "teal-bar" };
    if (value.includes("repair")) return { className: "teal", icon: "mdi:wrench-outline", label: "Repairing", barClass: "teal-bar" };
    if (value.includes("extract")) return { className: "teal", icon: "mdi:archive-outline", label: "Extracting", barClass: "teal-bar" };
    if (value.includes("fail") || value.includes("error")) return { className: "red", icon: "mdi:alert-circle", label: statusValue, barClass: "red-bar" };
    return { className: "gray", icon: "mdi:clock-outline", label: statusValue || "Queued", barClass: "orange-bar" };
  }

  _renderDelugeSection() {
    const torrents = this._filterDeluge();
    const pageData = this._page(torrents, "deluge");
    const visibleActive = torrents.some((torrent) => {
      const state = String(torrent?.state || "").toLowerCase();
      return state !== "paused" && state !== "error";
    });
    const hasTransfer = numberValue(this._delugeStatus?.download_rate) > 0 || numberValue(this._delugeStatus?.upload_rate) > 0;
    const allPaused = torrents.length > 0 && !visibleActive && !hasTransfer;
    const [sortField, sortDirection] = this._delugeSort.split("_");
    const sortArrow = sortDirection === "asc" ? "↑" : "↓";
    const items = pageData.items.length
      ? pageData.items.map((torrent) => this._renderDelugeItem(torrent)).join("")
      : this._queueEmpty("No active or queued Deluge torrents");

    return `
      <section class="client-section deluge-section">
        <div class="client-header">
          ${this._appIcon("deluge")}
          <span class="client-name">Deluge</span>
          <span class="header-line"></span>
          <div class="sort-buttons">
            <button class="sort-btn ${sortField === "progress" ? "active" : ""}" data-sort="progress_${sortField === "progress" && sortDirection === "desc" ? "asc" : "desc"}"
              title="Sort by progress" aria-label="Sort by progress">
              <ha-icon icon="mdi:percent"></ha-icon><span>${sortField === "progress" ? sortArrow : ""}</span>
            </button>
            <button class="sort-btn ${sortField === "speed" ? "active" : ""}" data-sort="speed_${sortField === "speed" && sortDirection === "desc" ? "asc" : "desc"}"
              title="Sort by speed" aria-label="Sort by speed">
              <ha-icon icon="mdi:speedometer"></ha-icon><span>${sortField === "speed" ? sortArrow : ""}</span>
            </button>
          </div>
          ${this._config.allow_controls !== false ? `
            <button class="round-btn global-btn ${allPaused ? "resume" : ""}" data-deluge-global="${allPaused ? "global_resume" : "global_pause"}"
              title="${allPaused ? "Resume all Deluge torrents" : "Pause all Deluge torrents"}"
              aria-label="${allPaused ? "Resume all Deluge torrents" : "Pause all Deluge torrents"}"
              ${this._busy.has("deluge:global") ? "disabled" : ""}>
              ${this._busy.has("deluge:global") ? '<span class="spinner small"></span>' : `<ha-icon icon="${allPaused ? "mdi:play" : "mdi:pause"}"></ha-icon>`}
            </button>
          ` : ""}
        </div>
        ${this._pager("deluge", pageData, items)}
      </section>
    `;
  }

  _renderDelugeItem(torrent) {
    const id = String(torrent?.hash || "");
    const name = escapeHtml(torrent?.name || "Unknown torrent");
    const percent = Math.max(0, Math.min(99, Math.round(numberValue(torrent?.progress))));
    const stateRaw = String(torrent?.state || "Queued");
    const state = stateRaw.toLowerCase();
    const paused = state === "paused";
    const downloading = state === "downloading";
    const checking = state === "checking" || state === "allocating" || state === "moving";
    const error = state === "error";
    const downSpeed = numberValue(torrent?.download_payload_rate);
    const upSpeed = numberValue(torrent?.upload_payload_rate);
    const etaSeconds = numberValue(torrent?.eta);
    const done = numberValue(torrent?.total_done);
    const total = numberValue(torrent?.total_size);
    const seeds = Math.max(0, Math.round(numberValue(torrent?.num_seeds)));
    const peers = Math.max(0, Math.round(numberValue(torrent?.num_peers)));
    const confirm = this._confirm?.type === "deluge" && this._confirm.id === id;
    const busy = this._busy.has(`deluge:${id}`);

    let statusPill;
    let barClass;
    if (error) {
      statusPill = this._statusPill("red", "mdi:alert-circle", stateRaw);
      barClass = "red-bar";
    } else if (paused) {
      statusPill = this._statusPill("orange", "mdi:pause-circle", "Paused");
      barClass = "orange-bar";
    } else if (checking) {
      statusPill = this._statusPill("teal", "mdi:progress-wrench", stateRaw);
      barClass = "teal-bar";
    } else if (downloading) {
      statusPill = `<span class="metric live"><ha-icon icon="mdi:download"></ha-icon><b>${this._fmtSpeed(downSpeed)}</b></span>`;
      barClass = "blue-bar";
    } else {
      statusPill = this._statusPill("gray", "mdi:clock-outline", stateRaw || "Queued");
      barClass = "orange-bar";
    }

    let controls = "";
    if (this._config.allow_controls !== false) {
      if (busy) {
        controls = '<span class="spinner small"></span>';
      } else if (confirm) {
        controls = `
          <button class="tiny-btn cancel" data-cancel title="Cancel"><ha-icon icon="mdi:close"></ha-icon></button>
          <button class="tiny-btn keep" data-deluge-delete="${escapeHtml(id)}" data-delete-mode="delete" title="Remove torrent and keep files"><ha-icon icon="mdi:magnet"></ha-icon></button>
          <button class="tiny-btn danger" data-deluge-delete="${escapeHtml(id)}" data-delete-mode="delete_files" title="Remove torrent and delete files"><ha-icon icon="mdi:delete"></ha-icon></button>
        `;
      } else {
        if (paused) {
          controls += `<button class="tiny-btn resume" data-deluge-item="${escapeHtml(id)}" data-action="resume" title="Resume torrent"><ha-icon icon="mdi:play"></ha-icon></button>`;
        } else if (!error) {
          controls += `<button class="tiny-btn" data-deluge-item="${escapeHtml(id)}" data-action="pause" title="Pause torrent"><ha-icon icon="mdi:pause"></ha-icon></button>`;
        }
        controls += `<button class="tiny-btn" data-confirm-deluge="${escapeHtml(id)}" title="Remove torrent"><ha-icon icon="mdi:delete-outline"></ha-icon></button>`;
      }
    }

    return `
      <article class="queue-item">
        <div class="item-top">
          <span class="item-name" title="${name}">${name}</span>
          <span class="item-percent">${percent}%</span>
          <span class="item-controls">${controls}</span>
        </div>
        <div class="item-meta">
          ${statusPill}
          ${downloading && upSpeed > 0 ? `<span class="metric upload-live"><ha-icon icon="mdi:upload"></ha-icon><b>${this._fmtSpeed(upSpeed)}</b></span>` : ""}
          <span class="metric eta"><ha-icon icon="mdi:clock-outline"></ha-icon><b>${this._fmtEta(etaSeconds)}</b></span>
          <span class="metric"><ha-icon icon="mdi:harddisk"></ha-icon><b>${this._fmtSize(done)} / ${this._fmtSize(total)}</b></span>
          <span class="peer-metrics">
            <span class="metric"><ha-icon icon="mdi:upload"></ha-icon><b>${seeds}</b></span>
            <span class="metric"><ha-icon icon="mdi:download"></ha-icon><b>${peers}</b></span>
          </span>
        </div>
        <div class="progress-track"><div class="progress-fill ${barClass}" style="width:${percent}%"></div></div>
      </article>
    `;
  }

  _pager(section, pageData, itemsHtml) {
    const multiple = pageData.totalPages > 1;
    return `
      <div class="pager-shell">
        <button class="page-btn ${multiple ? "" : "placeholder"}" data-page="${section}" data-direction="prev"
          ${!multiple || pageData.page === 0 ? "disabled" : ""} aria-label="Previous page">‹</button>
        <div class="queue-frame">${itemsHtml}</div>
        <button class="page-btn ${multiple ? "" : "placeholder"}" data-page="${section}" data-direction="next"
          ${!multiple || pageData.page >= pageData.totalPages - 1 ? "disabled" : ""} aria-label="Next page">›</button>
      </div>
    `;
  }

  _queueEmpty(message) {
    return `
      <div class="queue-empty">
        <ha-icon icon="mdi:check-circle-outline"></ha-icon>
        <span>${message}</span>
      </div>
    `;
  }

  _statusPill(className, icon, label) {
    return `<span class="status-pill ${className}"><ha-icon icon="${icon}"></ha-icon>${escapeHtml(label)}</span>`;
  }

  _appIcon(client) {
    if (this._config.application_icons === "mdi") {
      return `<ha-icon class="app-icon mdi-app-icon ${client}" icon="${MDI_ICONS[client]}"></ha-icon>`;
    }
    // no-referrer keeps the Home Assistant origin out of the CDN request.
    // Switch application_icons to "mdi" to avoid the external request entirely.
    return `<img class="app-icon" src="${APP_ICONS[client]}" alt="${APP_LABELS[client]}" referrerpolicy="no-referrer" data-app-fallback="${client}">`;
  }

  _wireEvents() {
    if (!this.shadowRoot) return;

    // If the logo CDN is unreachable, swap in the Material Design icon rather
    // than leaving a broken-image glyph in the client header.
    this.shadowRoot.querySelectorAll("[data-app-fallback]").forEach((image) => {
      image.addEventListener(
        "error",
        () => {
          const client = image.dataset.appFallback;
          const icon = document.createElement("ha-icon");
          icon.setAttribute("icon", MDI_ICONS[client]);
          icon.className = `app-icon mdi-app-icon ${client}`;
          image.replaceWith(icon);
        },
        { once: true },
      );
    });

    this.shadowRoot.querySelectorAll("[data-page]").forEach((button) => {
      button.addEventListener("click", () => {
        const section = button.dataset.page;
        const delta = button.dataset.direction === "next" ? 1 : -1;
        this._pages[section] = Math.max(0, (this._pages[section] || 0) + delta);
        this._render();
      });
    });

    this.shadowRoot.querySelectorAll("[data-sort]").forEach((button) => {
      button.addEventListener("click", () => {
        this._delugeSort = button.dataset.sort;
        this._pages.deluge = 0;
        this._render();
      });
    });

    this.shadowRoot.querySelector("[data-sab-global]")?.addEventListener("click", (event) => {
      this._sabGlobal(event.currentTarget.dataset.sabGlobal);
    });
    this.shadowRoot.querySelector("[data-deluge-global]")?.addEventListener("click", (event) => {
      this._delugeGlobal(event.currentTarget.dataset.delugeGlobal);
    });

    this.shadowRoot.querySelectorAll("[data-confirm-sab]").forEach((button) => {
      button.addEventListener("click", () => {
        this._confirm = { type: "sab", id: button.dataset.confirmSab };
        this._render();
      });
    });
    this.shadowRoot.querySelectorAll("[data-sab-delete]").forEach((button) => {
      button.addEventListener("click", () => this._sabDelete(button.dataset.sabDelete));
    });

    this.shadowRoot.querySelectorAll("[data-deluge-item]").forEach((button) => {
      button.addEventListener("click", () => {
        this._delugeItem(button.dataset.action, button.dataset.delugeItem);
      });
    });
    this.shadowRoot.querySelectorAll("[data-confirm-deluge]").forEach((button) => {
      button.addEventListener("click", () => {
        this._confirm = { type: "deluge", id: button.dataset.confirmDeluge };
        this._render();
      });
    });
    this.shadowRoot.querySelectorAll("[data-deluge-delete]").forEach((button) => {
      button.addEventListener("click", () => {
        this._delugeItem(button.dataset.deleteMode, button.dataset.delugeDelete);
      });
    });

    this.shadowRoot.querySelectorAll("[data-cancel]").forEach((button) => {
      button.addEventListener("click", () => {
        this._confirm = null;
        this._render();
      });
    });
  }

  async _runAction(busyKey, label, callback) {
    if (!this._hass || this._busy.has(busyKey)) return;
    this._busy.add(busyKey);
    this._confirm = null;
    this._render();
    try {
      const response = await callback();
      if (response?.ok === false) {
        throw new Error(response.error || "The download client rejected the action");
      }
      await this._delay(350);
      await this._fetchData();
    } catch (error) {
      console.error(`SAB & Deluge Card: ${label} action failed`, error);
      this._error = this._describeFailure(label, error);
    } finally {
      this._busy.delete(busyKey);
      this._render();
    }
  }

  _delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async _sabGlobal(mode) {
    return this._runAction("sab:global", "SABnzbd", () =>
      this._hass.callApi("POST", "arr_stack/sabnzbd/action", { mode }),
    );
  }

  async _sabDelete(id) {
    return this._runAction(`sab:${id}`, "SABnzbd", () =>
      this._hass.callApi("POST", "arr_stack/sabnzbd/action", {
        mode: "queue",
        name: "delete",
        nzo_id: id,
      }),
    );
  }

  async _delugeGlobal(action) {
    return this._runAction("deluge:global", "Deluge", () =>
      this._hass.callApi("POST", "arr_stack/deluge/action", { action }),
    );
  }

  async _delugeItem(action, id) {
    return this._runAction(`deluge:${id}`, "Deluge", () =>
      this._hass.callApi("POST", "arr_stack/deluge/action", { action, id }),
    );
  }

  _fmtSpeed(bytesPerSecond) {
    const value = Math.max(0, numberValue(bytesPerSecond));
    if (value < 1024) return `${Math.round(value)} B/s`;
    const units = ["KB/s", "MB/s", "GB/s", "TB/s"];
    let scaled = value / 1024;
    let unitIndex = 0;
    while (scaled >= 1024 && unitIndex < units.length - 1) {
      scaled /= 1024;
      unitIndex += 1;
    }
    const decimals = scaled >= 100 || Number.isInteger(scaled) ? 0 : scaled >= 10 ? 1 : 2;
    return `${scaled.toFixed(decimals)} ${units[unitIndex]}`;
  }

  _fmtSize(bytes) {
    const value = Math.max(0, numberValue(bytes));
    if (value === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    const scaled = value / (1024 ** unitIndex);
    const decimals = scaled >= 100 || unitIndex === 0 ? 0 : scaled >= 10 ? 1 : 2;
    return `${scaled.toFixed(decimals)} ${units[unitIndex]}`;
  }

  _fmtEta(seconds) {
    const value = Math.round(numberValue(seconds));
    if (value <= 0 || value >= 365 * 24 * 3600) return "—";
    const days = Math.floor(value / 86400);
    const hours = Math.floor((value % 86400) / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${Math.max(1, minutes)}m`;
  }

  _styles() {
    return `
      :host {
        --sd-surface: var(--ha-card-background, var(--card-background-color, #1d1d1f));
        --sd-surface-2: var(--secondary-background-color, rgba(55, 55, 58, .92));
        --sd-text: var(--primary-text-color, #f5f5f7);
        --sd-muted: var(--secondary-text-color, rgba(235, 235, 245, .60));
        --sd-border: var(--divider-color, rgba(255, 255, 255, .18));
        --sd-blue: #66a7ff;
        --sd-green: #85d481;
        --sd-teal: #63d5d0;
        --sd-orange: #e8b15e;
        --sd-red: #ef7064;
        display: block;
        color: var(--sd-text);
        font-family: var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      }
      * {
        box-sizing: border-box;
      }
      ha-card {
        overflow: hidden;
        border: 1px solid var(--sd-border);
        border-radius: var(--ha-card-border-radius, 28px);
        background:
          radial-gradient(circle at 15% 22%, rgba(231, 184, 74, .11), transparent 35%),
          radial-gradient(circle at 82% 78%, rgba(83, 118, 224, .12), transparent 38%),
          var(--sd-surface);
        box-shadow: var(--ha-card-box-shadow, 0 10px 30px rgba(0, 0, 0, .22));
      }
      .card-content {
        padding: clamp(18px, 3vw, 28px);
      }
      .section-stack {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .speed-card {
        position: relative;
        margin-bottom: 18px;
        padding: 16px 18px;
        overflow: hidden;
        border: 1px solid var(--sd-border);
        border-radius: 21px;
        background:
          linear-gradient(120deg, rgba(255, 255, 255, .13), rgba(255, 255, 255, .035)),
          color-mix(in srgb, var(--sd-surface-2) 78%, transparent);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, .05);
      }
      .speed-title {
        margin-bottom: 8px;
        font-size: 14px;
        font-weight: 800;
        letter-spacing: .02em;
      }
      .speed-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 9px;
      }
      .speed-pill {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-height: 35px;
        padding: 5px 13px;
        border: 1px solid;
        border-radius: 999px;
        color: #fff;
        font-size: 16px;
        line-height: 1;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, .14);
      }
      .speed-pill ha-icon {
        --mdc-icon-size: 18px;
      }
      .speed-pill.download {
        border-color: rgba(114, 222, 117, .65);
        background: linear-gradient(180deg, rgba(91, 186, 86, .82), rgba(61, 144, 60, .74));
      }
      .speed-pill.upload {
        border-color: rgba(116, 196, 248, .72);
        background: linear-gradient(180deg, rgba(88, 149, 187, .82), rgba(63, 111, 146, .76));
      }
      .speed-subtitle {
        margin-top: 9px;
        color: var(--sd-text);
        font-size: 13px;
      }
      .client-section {
        position: relative;
        padding: 10px 0 2px;
      }
      .client-header {
        display: flex;
        align-items: center;
        gap: 13px;
        min-height: 48px;
        padding: 0 6px 7px;
      }
      .app-icon {
        width: auto;
        height: 39px;
        flex: 0 0 auto;
        object-fit: contain;
        filter: drop-shadow(0 2px 2px rgba(0, 0, 0, .22));
      }
      .mdi-app-icon {
        width: 39px;
        --mdc-icon-size: 37px;
      }
      .mdi-app-icon.sabnzbd {
        color: #f1c84b;
      }
      .mdi-app-icon.deluge {
        color: #6f96ed;
      }
      .client-name {
        flex: 0 0 auto;
        font-size: 20px;
        font-weight: 800;
      }
      .header-line {
        height: 9px;
        min-width: 24px;
        flex: 1;
        border-radius: 999px;
        background: color-mix(in srgb, var(--sd-muted) 65%, transparent);
        opacity: .72;
      }
      .sort-buttons {
        display: flex;
        gap: 7px;
      }
      button {
        appearance: none;
        border: 0;
        font: inherit;
      }
      .round-btn,
      .sort-btn,
      .tiny-btn {
        display: inline-grid;
        place-items: center;
        flex: 0 0 auto;
        cursor: pointer;
        color: var(--sd-text);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        transition: transform .15s ease, background .15s ease, border-color .15s ease;
      }
      .round-btn:hover,
      .sort-btn:hover,
      .tiny-btn:hover {
        transform: translateY(-1px);
      }
      .round-btn:disabled,
      .sort-btn:disabled,
      .tiny-btn:disabled {
        cursor: default;
        opacity: .58;
        transform: none;
      }
      .global-btn {
        width: 42px;
        height: 42px;
        border: 1px solid rgba(255, 255, 255, .24);
        border-radius: 50%;
        background: rgba(95, 91, 80, .66);
      }
      .global-btn.resume {
        border-color: rgba(93, 209, 117, .50);
        background: rgba(56, 137, 82, .54);
      }
      .global-btn ha-icon {
        --mdc-icon-size: 21px;
      }
      .sort-btn {
        grid-template-columns: auto 10px;
        width: 66px;
        height: 36px;
        border: 1px solid rgba(144, 153, 213, .50);
        border-radius: 999px;
        background: rgba(90, 96, 145, .44);
        font-size: 13px;
      }
      .sort-btn.active {
        border-color: rgba(91, 143, 255, .75);
        background: rgba(54, 92, 185, .58);
      }
      .sort-btn ha-icon {
        --mdc-icon-size: 18px;
      }
      .pager-shell {
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr) 28px;
        align-items: stretch;
        gap: 7px;
      }
      .page-btn {
        padding: 0;
        background: transparent;
        color: var(--sd-muted);
        cursor: pointer;
        font-size: 38px;
        line-height: 1;
        transition: color .15s ease, transform .15s ease;
      }
      .page-btn:not(:disabled):hover {
        color: var(--sd-text);
        transform: scale(1.08);
      }
      .page-btn:disabled {
        cursor: default;
        opacity: .20;
      }
      .page-btn.placeholder {
        visibility: hidden;
      }
      .queue-frame {
        min-width: 0;
        padding: 13px 18px;
        border: 1px solid rgba(255, 255, 255, .035);
        border-radius: 22px;
        background: rgba(255, 255, 255, .055);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, .025);
      }
      .sab-section .queue-frame {
        background:
          linear-gradient(135deg, rgba(197, 162, 67, .13), rgba(255, 255, 255, .045)),
          rgba(255, 255, 255, .035);
      }
      .deluge-section .queue-frame {
        background:
          linear-gradient(135deg, rgba(73, 102, 201, .15), rgba(255, 255, 255, .045)),
          rgba(255, 255, 255, .035);
      }
      .queue-item {
        min-width: 0;
        padding: 10px 3px 12px;
        border-bottom: 1px solid color-mix(in srgb, var(--sd-border) 45%, transparent);
      }
      .queue-item:first-child {
        padding-top: 4px;
      }
      .queue-item:last-child {
        padding-bottom: 3px;
        border-bottom: 0;
      }
      .item-top {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 10px;
        min-height: 34px;
      }
      .item-name {
        overflow: hidden;
        font-size: 15px;
        font-weight: 750;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .item-percent {
        color: var(--sd-muted);
        font-size: 15px;
        font-weight: 800;
      }
      .item-controls {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        gap: 5px;
        min-width: 35px;
      }
      .tiny-btn {
        width: 34px;
        height: 34px;
        padding: 0;
        border: 1px solid rgba(255, 255, 255, .24);
        border-radius: 50%;
        background: rgba(80, 80, 84, .46);
      }
      .tiny-btn ha-icon {
        --mdc-icon-size: 17px;
      }
      .tiny-btn.resume {
        border-color: rgba(80, 205, 112, .45);
        background: rgba(44, 126, 69, .45);
      }
      .tiny-btn.cancel {
        border-color: rgba(255, 255, 255, .22);
        background: rgba(92, 92, 98, .50);
      }
      .tiny-btn.keep {
        border-color: rgba(224, 158, 52, .52);
        background: rgba(129, 84, 22, .42);
      }
      .tiny-btn.danger {
        border-color: rgba(239, 112, 100, .52);
        background: rgba(151, 57, 49, .43);
      }
      .item-meta {
        display: flex;
        align-items: center;
        gap: 9px;
        min-width: 0;
        padding: 4px 0 7px;
        color: var(--sd-muted);
        font-size: 11px;
      }
      .metric,
      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
        white-space: nowrap;
      }
      .metric b {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .metric ha-icon,
      .status-pill ha-icon {
        --mdc-icon-size: 12px;
        flex: 0 0 auto;
      }
      .metric.live {
        color: var(--sd-green);
      }
      .metric.upload-live {
        color: var(--sd-teal);
      }
      .peer-metrics {
        display: inline-flex;
        gap: 7px;
        margin-left: auto;
      }
      .status-pill {
        min-height: 22px;
        padding: 3px 9px;
        border: 1px solid;
        border-radius: 999px;
        color: #fff;
        font-weight: 700;
      }
      .status-pill.green {
        border-color: rgba(119, 218, 123, .64);
        background: rgba(68, 147, 70, .70);
      }
      .status-pill.orange {
        border-color: rgba(232, 177, 94, .62);
        background: rgba(153, 105, 40, .64);
      }
      .status-pill.teal {
        border-color: rgba(99, 213, 208, .58);
        background: rgba(45, 131, 128, .62);
      }
      .status-pill.red {
        border-color: rgba(239, 112, 100, .64);
        background: rgba(155, 56, 49, .66);
      }
      .status-pill.gray {
        border-color: rgba(255, 255, 255, .26);
        background: rgba(100, 100, 105, .48);
      }
      .progress-track {
        height: 4px;
        overflow: hidden;
        border-radius: 999px;
        background: color-mix(in srgb, var(--sd-muted) 24%, transparent);
      }
      .progress-fill {
        height: 100%;
        min-width: 0;
        border-radius: inherit;
        transition: width .35s ease;
      }
      .blue-bar {
        background: #73b2ff;
      }
      .green-bar {
        background: #8adc88;
      }
      .teal-bar {
        background: #6edbd7;
      }
      .orange-bar {
        background: #e5ad58;
      }
      .red-bar {
        background: #ef7064;
      }
      .queue-empty,
      .empty-card,
      .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        min-height: 78px;
        color: var(--sd-muted);
        font-size: 13px;
        text-align: center;
      }
      .queue-empty ha-icon {
        --mdc-icon-size: 20px;
        color: var(--sd-green);
      }
      .empty-card {
        min-height: 150px;
        flex-direction: column;
      }
      .empty-card ha-icon {
        --mdc-icon-size: 34px;
      }
      .empty-card strong {
        color: var(--sd-text);
      }
      .error-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 14px;
        padding: 10px 12px;
        border: 1px solid rgba(239, 112, 100, .48);
        border-radius: 11px;
        background: rgba(153, 54, 47, .28);
        color: color-mix(in srgb, var(--sd-red) 74%, var(--sd-text));
        font-size: 12px;
        line-height: 1.4;
      }
      .error-banner ha-icon {
        --mdc-icon-size: 18px;
        flex: 0 0 auto;
      }
      .spinner {
        display: inline-block;
        width: 20px;
        height: 20px;
        border: 2px solid rgba(255, 255, 255, .22);
        border-top-color: var(--sd-text);
        border-radius: 50%;
        animation: sd-spin .75s linear infinite;
      }
      .spinner.small {
        width: 15px;
        height: 15px;
        border-width: 1.5px;
      }
      @keyframes sd-spin {
        to { transform: rotate(360deg); }
      }
      @media (max-width: 600px) {
        ha-card {
          border-radius: 22px;
        }
        .card-content {
          padding: 16px 10px;
        }
        .speed-card {
          margin-inline: 4px;
          padding: 14px;
        }
        .client-header {
          gap: 8px;
          padding-inline: 8px;
        }
        .app-icon {
          height: 33px;
        }
        .mdi-app-icon {
          width: 33px;
          --mdc-icon-size: 32px;
        }
        .client-name {
          font-size: 18px;
        }
        .sort-btn {
          width: 49px;
        }
        .pager-shell {
          grid-template-columns: 18px minmax(0, 1fr) 18px;
          gap: 1px;
        }
        .queue-frame {
          padding: 10px 12px;
          border-radius: 18px;
        }
        .item-top {
          gap: 7px;
        }
        .item-name,
        .item-percent {
          font-size: 13px;
        }
        .item-meta {
          gap: 7px;
        }
        .peer-metrics {
          display: none;
        }
        .metric.eta {
          display: none;
        }
        .tiny-btn {
          width: 31px;
          height: 31px;
        }
      }
    `;
  }

  getCardSize() {
    const perPage = Number(this._config?.items_per_page) || DEFAULT_CONFIG.items_per_page;
    let size = this._config?.show_total_speed !== false ? 2 : 0;
    if (this._config?.show_sabnzbd !== false) size += 1 + perPage;
    if (this._config?.show_deluge !== false) size += 1 + perPage;
    return Math.max(3, size);
  }

  static getConfigElement() {
    return document.createElement("sab-deluge-card-editor");
  }

  static getStubConfig() {
    return { ...DEFAULT_CONFIG };
  }
}

// Announce the card to the dashboard picker before defining the elements. This
// is what makes "SAB & Deluge Card" appear under Add card, and doing it first
// means a element-registration failure still leaves a visible entry plus a
// console error, rather than the card silently missing from the picker.
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card?.type === "sab-deluge-card")) {
  window.customCards.push({
    type: "sab-deluge-card",
    name: "SAB & Deluge Card",
    description: "Live SABnzbd and Deluge queues without completed-history clutter",
    preview: true,
    documentationURL: "https://github.com/Tmatz27/ha-sab-deluge-card",
  });
}

try {
  if (!customElements.get("sab-deluge-card-editor")) {
    customElements.define("sab-deluge-card-editor", SabDelugeCardEditor);
  }
  if (!customElements.get("sab-deluge-card")) {
    customElements.define("sab-deluge-card", SabDelugeCard);
  }
} catch (error) {
  console.error("SAB & Deluge Card could not register its custom elements", error);
}

console.info(
  `%c SAB & Deluge Card %c v${SAB_DELUGE_CARD_VERSION} `,
  "color: white; background: #4565b7; font-weight: 700;",
  "color: #4565b7; background: transparent;",
);
