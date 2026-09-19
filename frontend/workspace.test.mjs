import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { parseHTML } from "linkedom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

// Compile the real hooks/components in an ignored cache; no test-only code enters the app.
const project = dirname(fileURLToPath(import.meta.url));
const cache = join(project, "node_modules", ".cache");
await mkdir(cache, { recursive: true });
const compiled = await mkdtemp(join(cache, "hokiecare-ui-"));
execFileSync(
  process.execPath,
  [
    join(project, "node_modules/typescript/bin/tsc"),
    "--ignoreConfig",
    "--target",
    "ES2022",
    "--module",
    "ESNext",
    "--moduleResolution",
    "Bundler",
    "--jsx",
    "react-jsx",
    "--skipLibCheck",
    "--outDir",
    compiled,
    ...[
      "api.ts",
      "booking-state.tsx",
      "calendar.tsx",
      "use-public-data.ts",
    ].map((name) => join(project, "src", name)),
  ],
  { cwd: project, stdio: "pipe" },
);
for (const name of ["api", "booking-state", "calendar", "use-public-data"]) {
  const source = await readFile(join(compiled, name + ".js"), "utf8");
  const result = source.replace(
    /from (["'])(\.\/[^"']+)\1/g,
    (_, quote, path) => "from " + quote + path + ".mjs" + quote,
  );
  await writeFile(join(compiled, name + ".mjs"), result);
}
const { BookingProvider, useBooking } = await import(
  pathToFileURL(join(compiled, "booking-state.mjs")).href
);
const { SharedCalendar } = await import(
  pathToFileURL(join(compiled, "calendar.mjs")).href
);
const { useApi } = await import(
  pathToFileURL(join(compiled, "use-public-data.mjs")).href
);
const slot = {
  id: "slot-a",
  starts: "2026-09-22T14:00:00Z",
  ends: "2026-09-22T14:45:00Z",
  center_id: "cook",
  service_id: "cook-counseling",
  version: 2,
  state: "available",
};

test("a successful public-data response cancels its timeout instead of later replacing the chart with an error", async () => {
  const { window } = parseHTML(
    '<html><body><div id="data-root"></div></body></html>',
  );
  Object.assign(globalThis, {
    window,
    document: window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const pending = new Map(),
    realSet = globalThis.setTimeout,
    realClear = globalThis.clearTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay === 70000) {
      const id = {};
      pending.set(id, callback);
      return id;
    }
    return realSet(callback, delay, ...args);
  };
  globalThis.clearTimeout = (id) => {
    if (pending.has(id)) pending.delete(id);
    else realClear(id);
  };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ points: [{ week: "2026-09-12", combined_pct: 1.3 }] }),
  });
  let result;
  function Probe() {
    result = useApi("/api/trends");
    return null;
  }
  const root = createRoot(document.getElementById("data-root"));
  try {
    await act(async () => {
      root.render(React.createElement(Probe));
    });
    assert.equal(result.loading, false);
    assert.equal(result.error, "");
    assert.equal(result.data.points[0].combined_pct, 1.3);
    assert.equal(pending.size, 0);
  } finally {
    await act(async () => root.unmount());
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
  }
});
const review = {
  id: "review-a",
  slot,
  service_name: "Counseling",
  expires_at: Date.now() / 1000 + 120,
  operation: "book",
  notice: "Sample only",
  result_id: null,
};

async function setup({ calendar = false, failConfirmation = false } = {}) {
  const { window } = parseHTML(
    '<html><body><div id="root"></div></body></html>',
  );
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Event: window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const storage = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  };
  let state,
    records = [],
    confirmFailures = failConfirmation ? 1 : 0;
  const requests = [],
    streams = [],
    timers = new Set();
  const realInterval = window.setInterval,
    realClear = window.clearInterval;
  window.setInterval = () => {
    const timer = {};
    timers.add(timer);
    return timer;
  };
  window.clearInterval = (timer) => timers.delete(timer);
  globalThis.EventSource = class {
    constructor(url) {
      this.url = url;
      this.closed = false;
      streams.push(this);
    }
    addEventListener() {}
    close() {
      this.closed = true;
    }
  };
  globalThis.fetch = async (path, options = {}) => {
    requests.push({ path, method: options.method, body: options.body });
    let data = {};
    if (path === "/api/booking/catalog")
      data = {
        centers: [{ id: "cook", name: "Cook" }],
        services: [
          {
            id: "cook-counseling",
            center_id: "cook",
            name: "Counseling",
            duration_minutes: 45,
            weekly: {},
            source_url: "https://ucc.vt.edu/",
          },
        ],
      };
    if (path === "/api/booking/appointments") data = { appointments: records };
    if (path === "/api/booking/proposals") data = review;
    if (path.startsWith("/api/booking/availability"))
      data = {
        days: [],
        slots: [],
        storage: "sqlite",
        fetched_at: new Date().toISOString(),
        revision: 1,
      };
    if (path.endsWith("/confirm")) {
      if (confirmFailures-- > 0) throw new TypeError("Network interrupted");
      records = [
        { ...slot, id: "appointment-a", slot_id: slot.id, status: "reserved" },
      ];
      data = { id: "appointment-a" };
    }
    return { ok: true, json: async () => data };
  };
  function Probe() {
    state = useBooking();
    return calendar
      ? React.createElement(SharedCalendar, {
          active:
            state.active &&
            state.panel === "calendar" &&
            state.tab === "calendar",
        })
      : null;
  }
  const root = createRoot(document.getElementById("root"));
  const render = async (active = true) =>
    act(async () => {
      root.render(
        React.createElement(
          BookingProvider,
          { active },
          React.createElement(Probe),
        ),
      );
    });
  await render();
  return {
    get state() {
      return state;
    },
    requests,
    streams,
    timers,
    render,
    cleanup: async () => {
      await act(async () => root.unmount());
      window.setInterval = realInterval;
      window.clearInterval = realClear;
    },
  };
}

test("one shared review, duplicate confirmation guard, and immediate agenda refresh", async () => {
  const app = await setup();
  try {
    await act(async () => {
      await app.state.selectSlot(slot);
    });
    assert.equal(app.state.review.id, review.id);
    assert.equal(app.state.panel, "calendar");
    assert.equal(app.state.selection.day, "2026-09-22");
    await act(async () => {
      await Promise.all([app.state.confirm(), app.state.confirm()]);
    });
    assert.equal(
      app.requests.filter((r) => r.path.endsWith("/confirm")).length,
      1,
    );
    assert.equal(app.state.records[0].slot_id, slot.id);
    assert.equal(app.state.saved.id, review.id);
    assert.equal(app.state.review, null);
    assert.equal(app.state.tab, "agenda");
  } finally {
    await app.cleanup();
  }
});

test("uncertain confirmation preserves the same review for a safe retry", async () => {
  const app = await setup({ failConfirmation: true });
  try {
    await act(async () => {
      await app.state.selectSlot(slot);
    });
    await act(async () => {
      await app.state.confirm();
    });
    assert.equal(app.state.saved, null);
    assert.equal(app.state.review.id, review.id);
    assert.match(app.state.error, /Network interrupted/);
    await act(async () => {
      await app.state.confirm();
    });
    const confirmations = app.requests.filter((r) =>
      r.path.endsWith("/confirm"),
    );
    assert.equal(confirmations.length, 2);
    assert.equal(confirmations[0].path, confirmations[1].path);
    assert.equal(app.state.records.length, 1);
  } finally {
    await app.cleanup();
  }
});

test("calendar streams and polling stop when hidden, resume with the selected date intact", async () => {
  const app = await setup({ calendar: true });
  try {
    assert.equal(app.streams.length, 0);
    assert.equal(app.timers.size, 0);
    await act(async () => {
      app.state.navigate({
        view: "appointments",
        category: "all",
        center_id: "cook",
        service_id: "cook-counseling",
        mode: "demo",
        day: "2026-09-22",
      });
    });
    assert.equal(app.streams.filter((s) => !s.closed).length, 1);
    assert.equal(app.timers.size, 1);
    await act(async () => {
      app.state.setPanel(null);
    });
    assert.equal(app.streams.filter((s) => !s.closed).length, 0);
    assert.equal(app.timers.size, 0);
    await act(async () => {
      app.state.setPanel("calendar");
    });
    assert.equal(app.state.selection.day, "2026-09-22");
    assert.equal(app.streams.filter((s) => !s.closed).length, 1);
    await app.render(false);
    assert.equal(app.streams.filter((s) => !s.closed).length, 0);
    assert.equal(app.timers.size, 0);
    await app.render(true);
    assert.equal(app.state.selection.day, "2026-09-22");
    assert.equal(app.streams.filter((s) => !s.closed).length, 1);
    await act(async () => {
      app.state.setTab("agenda");
    });
    assert.equal(app.streams.filter((s) => !s.closed).length, 0);
    assert.equal(app.timers.size, 0);
  } finally {
    await app.cleanup();
  }
});
