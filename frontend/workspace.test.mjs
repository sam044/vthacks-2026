import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { parseHTML } from "linkedom";
import React, { act } from "react";
// Initialize DOM event support before React DOM probes it. This lets form tests
// exercise real input/change events instead of invoking component handlers.
const bootstrapDOM = parseHTML('<html><body></body></html>');
Object.assign(globalThis, { window: bootstrapDOM.window, document: bootstrapDOM.document });
document.oninput = null;
const { createRoot } = await import("react-dom/client");

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
      "vite-env.d.ts",
      "api.ts",
      "booking-state.tsx",
      "calendar.tsx",
      "use-public-data.ts",
      "intake-validation.ts",
      "waitlist-choices.tsx",
      "care-intake.tsx",
      "cosmetic-controls.tsx",
    ].map((name) => join(project, "src", name)),
  ],
  { cwd: project, stdio: "pipe" },
);
for (const name of ["api", "booking-state", "calendar", "use-public-data", "intake-validation", "waitlist-choices", "care-intake", "cosmetic-controls", "brand"]) {
  const source = await readFile(join(compiled, name + ".js"), "utf8");
  const result = source.replace(/import ["'][^"']+\.css["'];?/g, "").replace(
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
const { WaitlistChoices } = await import(pathToFileURL(join(compiled, "waitlist-choices.mjs")).href);
const { CareIntake } = await import(pathToFileURL(join(compiled,"care-intake.mjs")).href);
const { AlertsBell, ConfirmationEmail } = await import(pathToFileURL(join(compiled,"cosmetic-controls.mjs")).href);
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

async function setup({ intakeView = false, intakeResult, choices = false, calendar = false, failConfirmation = false, confirmationGate, waiting = [] } = {}) {
  const { window } = parseHTML(
    '<html><body><div id="root"></div></body></html>',
  );
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  window.HTMLElement.prototype.showModal=function(){this.setAttribute("open","");};
  window.HTMLElement.prototype.close=function(){this.removeAttribute("open");};
  globalThis.requestAnimationFrame=(fn)=>{fn();return 1;};
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
    if (path === "/api/assistant/intake") data = intakeResult;
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
    if (path === "/api/booking/waitlist") {
      if (options.method === "POST") waiting = [{ id: "waiting-a", slot: intakeResult?.waitlist_options?.find(s => s.id === JSON.parse(options.body).slot_id) ?? slot, status: "waiting", service_name: "Medical clinic" }];
      data = { entries: waiting, revision: 1 };
    }
    if (path === "/api/booking/waitlist/waiting-a" && options.method === "DELETE") waiting = [];
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
      if (confirmationGate) await confirmationGate;
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
    if (intakeView) return React.createElement(CareIntake,{visible:true});
    if (choices) return React.createElement(WaitlistChoices, { options: [{...slot,state:"busy",service_name:"Medical clinic"}] });
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
    setWaiting: (next) => { waiting = next; },
    render,
    cleanup: async () => {
      await act(async () => root.unmount());
      window.setInterval = realInterval;
      window.clearInterval = realClear;
    },
  };
}

test("waitlist join, event recovery, private offer prefill and leaving", async () => {
  const app = await setup();
  try {
    await act(async () => { await app.state.joinWaitlist(slot); });
    assert.equal(app.state.tab, "waitlist");
    assert.equal(app.state.waitlist[0].status, "waiting");
    assert.equal(app.streams.filter(s => !s.closed).length, 1);
    const offered = { id: "waiting-a", slot, status: "available", service_name: "Medical clinic" };
    app.setWaiting([offered]);
    await act(async () => { window.dispatchEvent(new Event("hokiecare-booking-changed")); });
    assert.equal(app.state.waitlist[0].status, "available");
    let prefill;
    window.addEventListener("hokiecare-intake-prefill", e => { prefill = e.detail; }, { once: true });
    await act(async () => { app.state.reviewWaitlist(offered); });
    assert.equal(prefill.waitlist_id, "waiting-a");
    assert.equal(prefill.id, slot.id);
    assert.equal(app.state.review, null);
    assert.equal(app.requests.filter(r => r.path.endsWith("/confirm")).length, 0);
    await act(async () => { await app.state.leaveWaitlist("waiting-a"); });
    assert.deepEqual(app.state.waitlist, []);
    assert.equal(app.streams.filter(s => !s.closed).length, 0);
    assert.equal(app.timers.size, 0);
  } finally { await app.cleanup(); }
});

test("waitlist updates pause with the view and resume without losing membership", async () => {
  const entry = { id: "waiting-a", slot, status: "waiting", service_name: "Medical clinic" };
  const app = await setup({ waiting: [entry] });
  try {
    assert.equal(app.streams.filter(s => !s.closed).length, 1);
    await app.render(false);
    assert.equal(app.streams.filter(s => !s.closed).length, 0);
    assert.equal(app.timers.size, 0);
    app.setWaiting([{ ...entry, status: "available" }]);
    await app.render(true);
    assert.equal(app.state.waitlist[0].status, "available");
    await act(async () => { window.dispatchEvent(new Event("hokiecare-home-request")); });
    assert.equal(app.state.waitlist[0].id, entry.id);
  } finally { await app.cleanup(); }
});

test("one shared review, duplicate confirmation guard, and immediate agenda refresh", async () => {
  const app = await setup();
  try {
    await act(async () => {
      app.state.adoptReview({...review,intake:true});
    });
    assert.equal(app.state.review.id, review.id);
    assert.equal(app.state.panel, null);
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
      app.state.adoptReview({...review,intake:true});
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

const {emptyIntake,intakeErrors,intakePayload,needsCounseling}=await import(pathToFileURL(join(compiled,"intake-validation.mjs")).href);
test("intake requires every answer and a 30-minute window before submission",()=>{
  const empty=emptyIntake();assert.equal(Object.keys(intakeErrors(empty)).length,10);
  const valid={...empty,booking_name:"Student",support:"physical",description:"Routine visit",center:"auto",modality:"in-person",
    first_date:"2026-10-01",last_date:"2026-10-02",after:"09:00",before:"17:00",student:"yes",acknowledged:true};
  assert.deepEqual(intakeErrors(valid),{});
  assert.ok(intakeErrors({...valid,booking_name:"   "}).booking_name);
  assert.deepEqual(intakeErrors({...valid,after:"16:30"}),{});
  assert.ok(intakeErrors({...valid,after:"16:31"}).hours);
  assert.equal(intakeErrors(valid).weekdays,undefined);
  assert.ok(intakeErrors({...valid,support:"counseling"}).counseling);
  assert.ok(needsCounseling({...valid,center:"timelycare"}));
  assert.deepEqual(intakeErrors({...valid,support:"counseling",counseling:"none"}),{});
});
test("manual slot selection prefills intake instead of bypassing its required fields",async()=>{
  const app=await setup();let prefilling;
  globalThis.CustomEvent=window.CustomEvent;
  const listen=e=>{prefilling=e.detail};window.addEventListener("hokiecare-intake-prefill",listen);
  try{await act(async()=>{await app.state.selectSlot(slot)});
    assert.equal(prefilling.id,slot.id);assert.equal(app.state.review,null);assert.equal(app.state.panel,null);
    assert.equal(app.requests.filter(r=>r.path==="/api/booking/proposals").length,0);
  }finally{window.removeEventListener("hokiecare-intake-prefill",listen);await app.cleanup();}
});

test("Home invalidates a pending review and restores defaults without deleting appointments", async () => {
  const app = await setup();
  try {
    await act(async () => { app.state.adoptReview({...review,intake:true}); });
    await act(async () => { await app.state.confirm(); });
    await act(async () => { app.state.adoptReview({...review,id:'review-b',intake:true}); app.state.setPanel('calendar'); });
    await act(async () => window.dispatchEvent(new Event('hokiecare-home-request')));
    assert.equal(app.state.review,null);
    assert.equal(app.state.saved,null);
    assert.equal(app.state.panel,null);
    assert.equal(app.state.selection.center_id,'schiffert');
    assert.equal(app.state.selection.service_id,undefined);
    assert.equal(app.state.resetVersion,1);
    assert.equal(app.state.records.length,1);
    assert.equal(sessionStorage.getItem('hokiecare-review-id'),null);
    assert.ok(app.requests.some(r=>r.path==='/api/booking/proposals/review-b' && r.method==='DELETE'));
    assert.ok(!app.requests.some(r=>r.path==='/api/booking/session' && r.method==='DELETE'));
  } finally { await app.cleanup(); }
});

test("Home waits for an in-flight confirmation, then preserves its saved appointment", async () => {
  let finish;
  const confirmationGate = new Promise(resolve=>{finish=resolve});
  const app = await setup({confirmationGate});
  try {
    await act(async () => app.state.adoptReview({...review,intake:true}));
    let saving;
    await act(async () => { saving=app.state.confirm(); });
    await act(async () => window.dispatchEvent(new Event('hokiecare-home-request')));
    assert.equal(app.state.resetVersion,0);
    assert.equal(app.state.review.id,review.id);
    await act(async () => {finish();await saving;});
    assert.equal(app.state.resetVersion,1);
    assert.equal(app.state.review,null);
    assert.equal(app.state.records.length,1);
    assert.equal(app.requests.filter(r=>r.path.endsWith('/confirm')).length,1);
  } finally { await app.cleanup(); }
});

test("Home cannot discard an uncertain save; retry resolves it before starting fresh", async () => {
  const app = await setup({failConfirmation:true});
  try {
    await act(async () => app.state.adoptReview({...review,intake:true}));
    await act(async () => app.state.confirm());
    await act(async () => window.dispatchEvent(new Event('hokiecare-home-request')));
    assert.equal(app.state.resetVersion,0);
    assert.equal(app.state.review.id,review.id);
    assert.equal(app.state.uncertainSave,true);
    assert.match(app.state.error,/check whether your appointment saved/);
    await act(async () => app.state.confirm());
    assert.equal(app.state.resetVersion,1);
    assert.equal(app.state.review,null);
    assert.equal(app.state.records.length,1);
    assert.equal(app.state.uncertainSave,false);
  } finally { await app.cleanup(); }
});


test("taken-time intake result joins explicitly and opens My waitlist", async () => {
  const app=await setup({choices:true});
  try {
    const button=document.querySelector("button");
    assert.equal(button.textContent,"Yes, join waitlist");
    assert.match(document.body.textContent,/this time is taken, would you like to join the waitlist\?/);
    assert.equal(app.requests.filter(r=>r.path==="/api/booking/waitlist"&&r.method==="POST").length,0);
    await act(async()=>{button.click();});
    assert.equal(app.requests.filter(r=>r.path==="/api/booking/waitlist"&&r.method==="POST").length,1);
    const savedRequest=app.requests.find(r=>r.path==="/api/booking/waitlist"&&r.method==="POST");
    assert.equal(JSON.parse(savedRequest.body).slot_id,slot.id);
    assert.equal(app.state.waitlist[0].slot.id,slot.id);
    assert.equal(app.state.waitlist[0].slot.starts,slot.starts);
    assert.equal(app.state.tab,"waitlist");assert.equal(app.state.panel,"calendar");
    assert.equal(document.querySelector("button").textContent,"View my waitlist");
    await act(async()=>{document.querySelector("button").click();});
    assert.equal(app.requests.filter(r=>r.path==="/api/booking/waitlist"&&r.method==="POST").length,1);
  } finally {await app.cleanup();}
});

const takenSchiffert = {
  ...slot, id: "schiffert-sept22-10", center_id: "schiffert", service_id: "schiffert-medical",
  starts: "2026-09-22T14:00:00Z", ends: "2026-09-22T14:30:00Z",
  state: "busy", service_name: "Medical clinic",
};
const takenResult = {
  outcome: "no_match", reason: "availability", review: null, sources: [],
  answer: "Matching times are currently taken.", waitlist_options: [takenSchiffert],
};

async function submitConflictIntake() {
  for (const [id, value] of Object.entries({
    booking_name: "Waitlist Test", description: "I would like a routine medical appointment.",
    support: "physical", center: "schiffert", modality: "in-person", student: "yes",
    first_date: "2026-09-22", last_date: "2026-09-22", after: "10:00", before: "10:30",
  })) {
    await act(async () => {
      const element = document.getElementById(id);
      // Linkedom omits the browser's default input.type === "text".
      if (element.tagName === "INPUT" && !element.type) element.type = "text";
      if (element.tagName === "SELECT") {
        Object.defineProperty(element, "value", { configurable: true, value });
      } else {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
        if (setter) setter.call(element, value); else element.value = value;
      }
      element.dispatchEvent(new window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    });
  }
  await act(async () => {
    const checkbox = document.querySelector('input[type="checkbox"]');
    Object.defineProperty(checkbox, "checked", { configurable: true, writable: true, value: true });
    checkbox.dispatchEvent(new window.Event("click", { bubbles: true }));
  });
  assert.equal(document.querySelector('button[type="submit"]').disabled, false, document.body.textContent);
  await act(async () => document.querySelector(".intake-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
}

for (const scenario of ["yes", "no", "own", "mixed"]) {
  test(`full intake conflict flow: ${scenario}`, async () => {
    const RealDate = globalThis.Date;
    globalThis.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : ["2026-09-20T16:00:00Z"])); }
      static now() { return new RealDate("2026-09-20T16:00:00Z").getTime(); }
    };
    const intakeResult = scenario === "own"
      ? { outcome: "no_match", reason: "appointment_conflict", sources: [], review: null,
          answer: "You already have an appointment during the matching times. Tabs in this browser share the same student session." }
      : scenario === "mixed"
        ? { ...takenResult, outcome: "choices", slots: [{ ...takenSchiffert, id: "open-slot", state: "available" }] }
        : takenResult;
    const app = await setup({ intakeView: true, intakeResult });
    try {
      await submitConflictIntake();
      const sent = app.requests.find(r => r.path === "/api/assistant/intake");
      assert.ok(sent);
      assert.equal(JSON.parse(sent.body).after, "10:00");
      assert.equal(JSON.parse(sent.body).before, "10:30");
      assert.ok(!document.body.textContent.includes("Let’s adjust your request"));
      const joins = () => app.requests.filter(r => r.path === "/api/booking/waitlist" && r.method === "POST");
      assert.equal(joins().length, 0);
      if (scenario === "own") {
        assert.equal(document.querySelector(".intake-result h2").textContent, "You already have an appointment at this time.");
        assert.ok(!document.body.textContent.includes("Yes, join waitlist"));
        return;
      }
      assert.match(document.body.textContent, /this time is taken, would you like to join the waitlist\?/);
      assert.match(document.body.textContent, /Medical clinic/);
      const button = text => [...document.querySelectorAll("button")].find(b => b.textContent === text);
      assert.ok(button("Yes, join waitlist"));
      assert.ok(button("No, edit request"));
      if (scenario === "yes") {
        await act(async () => button("Yes, join waitlist").click());
        assert.equal(joins().length, 1);
        assert.equal(JSON.parse(joins()[0].body).slot_id, takenSchiffert.id);
        assert.equal(app.state.waitlist[0].slot.starts, takenSchiffert.starts);
        assert.equal(app.state.tab, "waitlist");
      } else if (scenario === "no") {
        await act(async () => button("No, edit request").click());
        assert.ok(document.querySelector(".intake-form"));
        assert.equal(document.getElementById("after").value, "10:00");
        assert.equal(document.getElementById("before").value, "10:30");
        assert.equal(joins().length, 0);
      }
    } finally { await app.cleanup(); globalThis.Date = RealDate; }
  });
}


test("insurance appears only for nonstudents, clears on Yes, and never makes a request",async()=>{
  const h=await setup({intakeView:true});
  try {
    const select=document.getElementById("student");
    const choose=async value=>act(async()=>{
      Object.defineProperty(select,"value",{configurable:true,value});
      select.dispatchEvent(new window.Event("change",{bubbles:true}));
    });
    const before=h.requests.length;
    assert.equal(document.getElementById("insurance-provider"),null);
    await choose("no");
    assert.ok(document.getElementById("insurance-provider"));
    assert.match(document.body.textContent,/If self-pay, put N\/A/);
    await choose("yes");
    assert.equal(document.getElementById("insurance-provider"),null);
    await choose("no");
    assert.equal(document.getElementById("insurance-provider").value,"");
    assert.equal(h.requests.length,before);
    assert.ok(!document.body.textContent.includes("Which weekdays work"));
  } finally {await h.cleanup();}
});

test("bell toggles locally and email opens once per confirmation without requests",async()=>{
  const h=await setup();
  const container=document.createElement("div");document.body.append(container);
  const root=createRoot(container);
  const render=async id=>act(async()=>root.render(React.createElement(React.Fragment,null,
    React.createElement(AlertsBell),React.createElement(ConfirmationEmail,{confirmationId:id,visible:true}))));
  try {
    const before=h.requests.length;
    await render(undefined);
    const bell=container.querySelector(".alerts-bell"),dialog=container.querySelector("dialog");
    assert.equal(bell.getAttribute("aria-pressed"),"false");
    assert.equal(dialog.hasAttribute("open"),false);
    await act(async()=>bell.click());assert.equal(bell.getAttribute("aria-pressed"),"true");
    assert.match(container.textContent,/Sign up for Alerts on incoming outbreaks/);
    await act(async()=>bell.click());assert.equal(bell.getAttribute("aria-pressed"),"false");
    await render("confirmed-a");assert.equal(dialog.hasAttribute("open"),true);
    await act(async()=>dialog.querySelector("form").dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true})));
    assert.equal(dialog.hasAttribute("open"),false);
    await render("confirmed-a");assert.equal(dialog.hasAttribute("open"),false);
    await render("confirmed-b");assert.equal(dialog.hasAttribute("open"),true);
    await act(async()=>dialog.querySelector(".booking-secondary").click());
    assert.equal(dialog.hasAttribute("open"),false);
    assert.equal(h.requests.length,before);
  } finally {await act(async()=>root.unmount());await h.cleanup();}
});


test("intake payload excludes cosmetic values even if attached to form data",()=>{
  const payload=intakePayload({...emptyIntake(),booking_name:" Alias ",description:" Routine visit ",
    insurance:"Private insurance",email:"private@example.com",alerts:true,weekdays:[0]},"request-123456789");
  assert.equal(payload.booking_name,"Alias");
  assert.equal(payload.description,"Routine visit");
  for(const key of ["insurance","email","alerts","weekdays"])assert.equal(key in payload,false);
  assert.equal(JSON.stringify(payload).includes("private@example.com"),false);
});
