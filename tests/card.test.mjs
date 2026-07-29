import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../sab-deluge-card.js", import.meta.url), "utf8");
const registry = new Map();

class FakeNode {
  constructor(localName = "div") {
    this.localName = localName;
    this.className = "";
    this.textContent = "";
    this.children = [];
    this.writes = 0;
    this._html = "";
  }

  set innerHTML(value) {
    this._html = value;
    this.writes += 1;
  }

  get innerHTML() {
    return this._html;
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  replaceChildren(...nodes) {
    this.children = nodes;
  }

  replaceWith() {}

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }
}

class FakeHTMLElement {
  attachShadow() {
    this.shadowRoot = new FakeNode("#shadow-root");
    return this.shadowRoot;
  }
}

const sandbox = {
  HTMLElement: FakeHTMLElement,
  CustomEvent: class {},
  customElements: {
    define(name, constructor) {
      registry.set(name, constructor);
    },
    get(name) {
      return registry.get(name);
    },
  },
  document: {
    createElement(name) {
      return new FakeNode(name);
    },
  },
  window: { customCards: [] },
  console: { info() {}, error() {} },
  setInterval,
  clearInterval,
  setTimeout,
  Promise,
};

vm.runInNewContext(source, sandbox, { filename: "sab-deluge-card.js" });
const Card = registry.get("sab-deluge-card");
const Editor = registry.get("sab-deluge-card-editor");

/** Evaluate the card in a fresh browser-like context, as a <script> load would. */
function runSource({ defineThrows = false } = {}) {
  const defined = new Map();
  const errors = [];
  const context = {
    HTMLElement: FakeHTMLElement,
    CustomEvent: class {},
    customElements: {
      define(name, constructor) {
        if (defineThrows) throw new Error(`'${name}' has already been defined`);
        defined.set(name, constructor);
      },
      get(name) {
        return defined.get(name);
      },
    },
    document: { createElement: (name) => new FakeNode(name) },
    window: {},
    console: { info() {}, error: (...args) => errors.push(args) },
    setInterval,
    clearInterval,
    setTimeout,
    Promise,
  };
  vm.runInNewContext(source, context, { filename: "sab-deluge-card.js" });
  return { context, defined, errors };
}

/** A card wired up far enough to render, with polling and network stubbed out. */
function makeCard(overrides = {}) {
  const card = new Card();
  card._hass = { async callApi() {} };
  card._caps = { sabnzbd: true, deluge: true };
  Object.assign(card, overrides);
  return card;
}

test("registers the Home Assistant card and editor", () => {
  assert.equal(typeof Card, "function");
  assert.equal(typeof Editor, "function");
  assert.equal(sandbox.window.customCards[0].type, "sab-deluge-card");
});

test("never requests SABnzbd history", () => {
  assert.equal(source.includes("arr_stack/sabnzbd/history"), false);
});

test("announces itself to the dashboard card picker", () => {
  const { context, defined } = runSource();

  // This entry is what makes the card selectable under "Add card".
  assert.equal(context.window.customCards.length, 1);
  const entry = context.window.customCards[0];
  assert.equal(entry.type, "sab-deluge-card");
  assert.equal(entry.name, "SAB & Deluge Card");
  assert.equal(entry.preview, true);
  assert.ok(entry.description, "expected a picker description");
  assert.ok(entry.documentationURL.startsWith("https://"), "expected a docs link");

  // The picker looks for the element named after the type minus "custom:".
  assert.ok(defined.has("sab-deluge-card"));
  assert.ok(defined.has("sab-deluge-card-editor"));
});

test("the picker entry survives a custom element registration failure", () => {
  // A stale copy of the card loaded from another resource would make define()
  // throw. The picker entry must still be registered, and the reason logged.
  const { context, errors } = runSource({ defineThrows: true });

  assert.equal(context.window.customCards.length, 1);
  assert.equal(context.window.customCards[0].type, "sab-deluge-card");
  assert.equal(errors.length, 1, "expected the failure to be reported");
});

test("an existing customCards array is preserved, not clobbered", () => {
  const defined = new Map();
  const context = {
    HTMLElement: FakeHTMLElement,
    CustomEvent: class {},
    customElements: {
      define: (name, constructor) => defined.set(name, constructor),
      get: (name) => defined.get(name),
    },
    document: { createElement: (name) => new FakeNode(name) },
    window: { customCards: [{ type: "some-other-card" }] },
    console: { info() {}, error() {} },
    setInterval,
    clearInterval,
    setTimeout,
    Promise,
  };
  vm.runInNewContext(source, context, { filename: "sab-deluge-card.js" });

  assert.deepEqual(
    context.window.customCards.map((card) => card.type),
    ["some-other-card", "sab-deluge-card"],
  );
});

test("Deluge filter keeps incomplete queue items and hides completed or seeding items", () => {
  const card = Object.create(Card.prototype);
  card._delugeRaw = [];
  card._delugeSort = "progress_desc";
  const result = card._filterDeluge([
    { hash: "active", state: "Downloading", progress: 42, download_payload_rate: 100 },
    { hash: "queued", state: "Queued", progress: 0, download_payload_rate: 0 },
    { hash: "paused", state: "Paused", progress: 75, download_payload_rate: 0 },
    { hash: "complete", state: "Paused", progress: 100, download_payload_rate: 0 },
    { hash: "seeding", state: "Seeding", progress: 100, download_payload_rate: 0 },
  ]);

  assert.deepEqual(
    Array.from(result, (torrent) => torrent.hash),
    ["paused", "active", "queued"],
  );
});

test("Deluge renderer cannot surface a completed torrent", () => {
  const card = Object.create(Card.prototype);
  card._config = {
    allow_controls: true,
    application_icons: "mdi",
    items_per_page: 5,
  };
  card._delugeRaw = [
    {
      hash: "active",
      name: "Visible active item",
      state: "Downloading",
      progress: 42,
      total_size: 1000,
      total_done: 420,
    },
    {
      hash: "complete",
      name: "Hidden completed item",
      state: "Seeding",
      progress: 100,
      total_size: 1000,
      total_done: 1000,
    },
  ];
  card._delugeStatus = {};
  card._delugeSort = "progress_desc";
  card._pages = { deluge: 0 };
  card._busy = new Set();
  card._confirm = null;

  const html = card._renderDelugeSection();
  assert.match(html, /Visible active item/);
  assert.doesNotMatch(html, /Hidden completed item/);
});

test("an empty queue says when torrents were filtered out", () => {
  const card = Object.create(Card.prototype);
  card._config = { allow_controls: true, application_icons: "mdi", items_per_page: 3 };
  card._delugeSort = "progress_desc";
  card._pages = { deluge: 0 };
  card._busy = new Set();
  card._confirm = null;
  card._delugeStatus = { download_rate: 0, upload_rate: 0 };

  // Deluge holds only finished torrents: the section is empty because
  // everything completed, not because the card failed to load data.
  card._delugeRaw = [
    { hash: "done", name: "Finished", state: "Paused", progress: 100 },
    { hash: "seed", name: "Seeding", state: "Seeding", progress: 100 },
  ];
  let html = card._renderDelugeSection();
  assert.match(html, /2 completed or seeding torrents hidden/);
  assert.doesNotMatch(html, /Finished|Seeding<\/span>/);

  // Singular reads correctly.
  card._delugeRaw = [{ hash: "done", name: "Finished", state: "Paused", progress: 100 }];
  html = card._renderDelugeSection();
  assert.match(html, /1 completed or seeding torrent hidden/);

  // A genuinely empty daemon keeps the plain message.
  card._delugeRaw = [];
  html = card._renderDelugeSection();
  assert.match(html, /No active or queued Deluge torrents/);
  assert.doesNotMatch(html, /hidden/);
});

test("global pause state considers hidden torrents too", () => {
  const card = Object.create(Card.prototype);
  card._config = { allow_controls: true, application_icons: "mdi", items_per_page: 3 };
  card._delugeSort = "progress_desc";
  card._pages = { deluge: 0 };
  card._busy = new Set();
  card._confirm = null;
  card._delugeStatus = { download_rate: 0, upload_rate: 0 };

  // Every torrent is paused but all are filtered out of the visible list.
  // The button must still offer Resume rather than Pause.
  card._delugeRaw = [{ hash: "done", name: "Finished", state: "Paused", progress: 100 }];
  let html = card._renderDelugeSection();
  assert.match(html, /data-deluge-global="global_resume"/);

  // A running torrent means Deluge is not paused.
  card._delugeRaw.push({ hash: "live", name: "Active", state: "Downloading", progress: 10 });
  html = card._renderDelugeSection();
  assert.match(html, /data-deluge-global="global_pause"/);

  // Transfer activity overrides a stale set of paused states.
  card._delugeRaw = [{ hash: "done", name: "Finished", state: "Paused", progress: 100 }];
  card._delugeStatus = { download_rate: 0, upload_rate: 4096 };
  html = card._renderDelugeSection();
  assert.match(html, /data-deluge-global="global_pause"/);
});

test("Deluge actions use the integration's expected action and id fields", async () => {
  const card = Object.create(Card.prototype);
  const calls = [];
  card._hass = {
    async callApi(method, path, body) {
      calls.push({ method, path, body });
      return { ok: true };
    },
  };
  card._busy = new Set();
  card._confirm = null;
  card._render = () => {};
  card._delay = async () => {};
  card._fetchData = async () => {};
  card._describeFailure = (label, error) => `${label}: ${error}`;

  await card._delugeGlobal("global_pause");
  await card._delugeItem("pause", "torrent-hash");
  await card._delugeItem("delete_files", "torrent-hash");

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    {
      method: "POST",
      path: "arr_stack/deluge/action",
      body: { action: "global_pause" },
    },
    {
      method: "POST",
      path: "arr_stack/deluge/action",
      body: { action: "pause", id: "torrent-hash" },
    },
    {
      method: "POST",
      path: "arr_stack/deluge/action",
      body: { action: "delete_files", id: "torrent-hash" },
    },
  ]);
});

test("SAB queue removal never targets history", async () => {
  const card = Object.create(Card.prototype);
  const calls = [];
  card._hass = {
    async callApi(method, path, body) {
      calls.push({ method, path, body });
      return { ok: true };
    },
  };
  card._busy = new Set();
  card._confirm = null;
  card._render = () => {};
  card._delay = async () => {};
  card._fetchData = async () => {};
  card._describeFailure = (label, error) => `${label}: ${error}`;

  await card._sabDelete("sab-id");

  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), {
    method: "POST",
    path: "arr_stack/sabnzbd/action",
    body: { mode: "queue", name: "delete", nzo_id: "sab-id" },
  });
});

test("polling restarts when Home Assistant re-attaches the card", async () => {
  const card = makeCard();
  card._render = () => {};
  card._fetchData = async () => {};
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  card.connectedCallback();
  // The first attach schedules the timer only after _start() awaits its
  // initial fetch, so let the microtask queue drain before asserting.
  await flush();
  assert.notEqual(card._interval, null, "expected polling to start on first attach");

  // Switching dashboard views detaches and re-attaches the element.
  card.disconnectedCallback();
  assert.equal(card._interval, null, "expected the timer to be cleared while detached");

  card.connectedCallback();
  assert.notEqual(card._interval, null, "expected polling to resume after re-attach");
  card.disconnectedCallback();
});

test("editor ignores the config echo Home Assistant sends back", () => {
  const editor = new Editor();
  let renders = 0;
  editor._render = function stubbedRender() {
    this._rendered = true;
    renders += 1;
  };

  editor.setConfig({ items_per_page: 3 });
  assert.equal(renders, 1, "expected the first setConfig to build the form");

  // Home Assistant echoes the emitted config straight back into setConfig.
  // Re-rendering here would close an open dropdown mid-selection.
  editor.setConfig({ items_per_page: 3 });
  assert.equal(renders, 1, "expected an identical config not to rebuild the form");

  editor.setConfig({ items_per_page: 5 });
  assert.equal(renders, 2, "expected a real change to rebuild the form");
  assert.equal(editor._config.items_per_page, 5);
});

test("an unchanged refresh does not rewrite the card DOM", () => {
  const card = makeCard({
    _sab: { status: "Downloading", kbpersec: "512", slots: [] },
    _delugeRaw: [],
    _delugeStatus: { download_rate: 0, upload_rate: 0 },
  });

  card._render();
  const root = card._root;
  assert.ok(root, "expected the card shell to mount");
  assert.equal(root.writes, 1);

  card._render();
  assert.equal(root.writes, 1, "expected identical markup to leave the DOM untouched");

  card._sab = { status: "Downloading", kbpersec: "999", slots: [] };
  card._render();
  assert.equal(root.writes, 2, "expected changed data to re-render");
});

test("the stylesheet is mounted once and not reparsed on refresh", () => {
  const card = makeCard({
    _sab: { slots: [] },
    _delugeRaw: [],
    _delugeStatus: {},
  });

  card._render();
  const [style] = card.shadowRoot.children;
  assert.equal(style.localName, "style");
  assert.ok(style.textContent.includes("ha-card"), "expected styles on the mounted node");

  card._sab = { slots: [], kbpersec: "10" };
  card._render();
  assert.equal(card.shadowRoot.children[0], style, "expected the same style node to be reused");
});

test("SAB global pause state follows the authoritative paused flag", () => {
  const card = Object.create(Card.prototype);

  // A paused but empty queue reports status "Idle", not "Paused".
  card._sab = { paused: true, status: "Idle" };
  assert.equal(card._sabPaused(), true);

  card._sab = { paused: false, status: "Idle" };
  assert.equal(card._sabPaused(), false);

  // Fall back to the display string when the flag is absent.
  card._sab = { status: "Paused" };
  assert.equal(card._sabPaused(), true);

  card._sab = {};
  assert.equal(card._sabPaused(), false);
});

test("a pending removal confirmation is dropped when its target leaves the queue", () => {
  const card = Object.create(Card.prototype);
  card._config = { items_per_page: 3 };
  card._pages = { sabnzbd: 0, deluge: 0 };
  card._delugeSort = "progress_desc";
  card._sab = { slots: [] };
  card._delugeRaw = [{ hash: "still-here", state: "Downloading", progress: 10 }];

  card._confirm = { type: "deluge", id: "still-here" };
  card._clampPages();
  assert.deepEqual(card._confirm, { type: "deluge", id: "still-here" });

  card._confirm = { type: "deluge", id: "finished-and-gone" };
  card._clampPages();
  assert.equal(card._confirm, null);
});

test("a 503 is reported as unreachable, not as unconfigured", () => {
  const card = Object.create(Card.prototype);

  // Arr Stack Integration returns 503 with a localised message for a failed
  // TCP connection. Calling that "not configured" sends the user to the wrong
  // setting entirely, which is what this guards against.
  const unreachable = card._describeFailure("Deluge", {
    status_code: 503,
    body: { error: "Nelze se připojit: Cannot connect to host 10.0.0.5:8112" },
  });
  assert.match(unreachable, /could not connect/i);
  assert.doesNotMatch(unreachable, /not configured/i);

  // Only the literal "not configured" body means a missing config entry.
  const missing = card._describeFailure("SABnzbd", {
    status_code: 503,
    body: { error: "SABnzbd not configured" },
  });
  assert.match(missing, /not configured/i);
  assert.doesNotMatch(missing, /could not connect/i);
});

test("failures name the client and surface the underlying message", () => {
  const card = Object.create(Card.prototype);

  assert.match(
    card._describeFailure("SABnzbd", { status_code: 404, body: "" }),
    /^SABnzbd: the arr_stack endpoint was not found/,
  );
  assert.match(
    card._describeFailure("Deluge", { status_code: 500, body: { error: "boom" } }),
    /^Deluge: boom$/,
  );
  // A body with no error key must still produce something actionable.
  assert.match(
    card._describeFailure("Deluge", { status_code: 500, body: { detail: "odd" } }),
    /^Deluge: .*odd/,
  );
  assert.match(
    card._describeFailure("SABnzbd", { status_code: 500 }),
    /request failed with status 500/,
  );
});

test("a silent Deluge auth failure is reported instead of looking idle", () => {
  const card = Object.create(Card.prototype);
  card._config = { show_deluge: true };
  card._caps = { deluge: true };

  // Integration ignores auth.login's result, so a bad password yields HTTP 200
  // with an empty list and an empty transfer status.
  card._delugeRaw = [];
  card._delugeStatus = {};
  assert.match(card._delugeSilentFailure(), /check the Deluge password/i);

  // A genuinely idle daemon still answers with transfer fields.
  card._delugeStatus = { download_rate: 0, upload_rate: 0 };
  assert.equal(card._delugeSilentFailure(), "");

  // Torrents present means the RPC clearly worked.
  card._delugeStatus = {};
  card._delugeRaw = [{ hash: "a" }];
  assert.equal(card._delugeSilentFailure(), "");

  // Nothing to say when Deluge is not configured or is hidden.
  card._caps = { deluge: false };
  card._delugeRaw = [];
  assert.equal(card._delugeSilentFailure(), "");
});

test("one client failing does not discard the other client's data", async () => {
  const card = Object.create(Card.prototype);
  card._config = { show_sabnzbd: true, show_deluge: true, items_per_page: 3 };
  card._caps = { sabnzbd: true, deluge: true };
  card._pages = { sabnzbd: 0, deluge: 0 };
  card._delugeSort = "progress_desc";
  card._sab = {};
  card._delugeRaw = [];
  card._delugeStatus = {};
  card._fetching = false;
  card._render = () => {};
  card._hass = {
    async callApi(method, path) {
      if (path === "arr_stack/sabnzbd/queue") {
        return { queue: { kbpersec: "500", slots: [{ nzo_id: "a", filename: "Live job" }] } };
      }
      throw { status_code: 503, body: { error: "Nelze se připojit" } };
    },
  };

  await card._fetchData();

  assert.equal(card._sabSlots().length, 1, "expected SABnzbd data to survive");
  assert.match(card._error, /Deluge is configured, but Home Assistant could not connect/);
  assert.doesNotMatch(card._error, /SABnzbd/, "expected no SABnzbd failure reported");
  // Both Deluge requests fail, but the banner must not repeat itself.
  assert.equal(card._error.match(/could not connect/g).length, 1);
});

test("application logos point at the maintained dashboard-icons repository", () => {
  // The old walkxcode/dashboard-icons repository was transferred to
  // homarr-labs/dashboard-icons, so no CDN URL may still reference it.
  const cdnUrls = [...source.matchAll(/https:\/\/cdn\.jsdelivr\.net\/[^\s"')]+/g)].map((match) => match[0]);
  assert.ok(cdnUrls.length >= 2, "expected the logo URLs to be present");
  for (const url of cdnUrls) {
    assert.ok(!url.includes("walkxcode"), `stale icon repository in ${url}`);
  }
  assert.match(source, /cdn\.jsdelivr\.net\/gh\/homarr-labs\/dashboard-icons\/svg\/sabnzbd\.svg/);
  assert.match(source, /cdn\.jsdelivr\.net\/gh\/homarr-labs\/dashboard-icons\/svg\/deluge\.svg/);
});

test("card carries no embedded credentials and only calls the arr_stack proxy", () => {
  const endpoints = [...source.matchAll(/callApi\(\s*"(GET|POST)",\s*"([^"]+)"/g)].map((match) => match[2]);
  assert.ok(endpoints.length > 0, "expected the card to call the proxy");
  for (const endpoint of endpoints) {
    assert.ok(endpoint.startsWith("arr_stack/"), `unexpected endpoint: ${endpoint}`);
  }
  // A hardcoded secret looks like an assignment or a query parameter. The bare
  // words appear legitimately in help text such as "check the Deluge password".
  assert.equal(
    /(api_?key|password|passwd|token|secret)\s*[:=]\s*["'`][^"'`]{3,}["'`]/i.test(source),
    false,
    "found what looks like a hardcoded credential",
  );
  assert.equal(
    /[?&](api_?key|token|password|passwd)=/i.test(source),
    false,
    "found a credential in a query string",
  );
});
