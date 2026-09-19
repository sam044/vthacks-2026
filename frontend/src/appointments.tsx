import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ArrowUpRight,
  Bot,
  Send,
  ShieldCheck,
} from "lucide-react";
import "./appointments.css";

type Center = {
  id: string;
  name: string;
  kind: string;
  description: string;
  note: string;
  source_url: string;
  booking_url: string | null;
};
type Slot = { id: string; starts: string; ends: string };
type Appointment = Slot & {
  slot_id: string;
  status: string;
  center_name: string;
};
type PortalSlot = {
  id: string;
  date: string;
  time: string;
  provider: string;
  location: string;
};
type Companion = {
  state?: string;
  error?: string;
  message?: string;
  slots?: PortalSlot[];
  total?: number;
  fetched_at?: string;
};
export type Navigation = {
  view: "care" | "appointments";
  category: string;
  center_id: string;
};

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-HokieCare-Action": "1" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(
      typeof data.detail === "string"
        ? data.detail
        : "Check your selection and try again.",
    );
  return data;
}
let sessionStart: Promise<unknown> | undefined;
export function session() {
  if (!sessionStart)
    sessionStart = api("/api/booking/session", "POST").finally(() => {
      sessionStart = undefined;
    });
  return sessionStart;
}
function companion(command: string, slot?: PortalSlot): Promise<Companion> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", receive);
      reject(
        Error(
          "Companion not detected. Install it in this browser, then reload HokieCare.",
        ),
      );
    }, 10000);
    function receive(event: MessageEvent) {
      if (
        event.source !== window ||
        event.origin !== location.origin ||
        event.data?.source !== "hokiecare-companion" ||
        event.data.id !== id
      )
        return;
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      if (event.data.error) reject(Error(event.data.error));
      else resolve(event.data);
    }
    window.addEventListener("message", receive);
    window.postMessage(
      { source: "hokiecare-app", id, command, slot },
      location.origin,
    );
  });
}
const fmt = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
const timeOnly = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
function nextDay() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const day = new Date(`${today}T12:00:00Z`);
  do {
    day.setUTCDate(day.getUTCDate() + 1);
  } while ([0, 6].includes(day.getUTCDay()));
  return day.toISOString().slice(0, 10);
}
function downloadCalendar(a: Appointment) {
  const stamp = (x: string) =>
    new Date(x)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const text = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HokieCare//Demo//EN",
    "BEGIN:VEVENT",
    `UID:${a.id}@hokiecare.demo`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(a.starts)}`,
    `DTEND:${stamp(a.ends)}`,
    "SUMMARY:DEMO - Cook Counseling appointment",
    "DESCRIPTION:Fictional HokieCare demo. Not booked with Cook.",
    "STATUS:TENTATIVE",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "hokiecare-demo.ics";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AppointmentHub({
  initialCenter = "schiffert",
}: {
  initialCenter?: string;
}) {
  const [centers, setCenters] = useState<Center[]>([]);
  const [centerId, setCenterId] = useState(
    initialCenter === "none" ? "schiffert" : initialCenter,
  );
  const [records, setRecords] = useState<Appointment[]>([]);
  const [day, setDay] = useState(nextDay);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selection, setSelection] = useState<{
    slot: Slot;
    request_id: string;
  } | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [portal, setPortal] = useState<Companion>({});
  const [portalSelection, setPortalSelection] = useState<PortalSlot | null>(
    null,
  );
  const center = centers.find((c) => c.id === centerId);
  async function refresh() {
    setRecords(
      (await api<{ appointments: Appointment[] }>("/api/booking/appointments"))
        .appointments,
    );
  }
  async function initialize() {
    await session();
    setCenters(
      (await api<{ centers: Center[] }>("/api/booking/catalog")).centers,
    );
    await refresh();
    setReady(true);
  }
  async function action(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void action(initialize);
  }, []);
  useEffect(() => {
    setCenterId(initialCenter === "none" ? "schiffert" : initialCenter);
  }, [initialCenter]);
  async function portalAction(command: string, slot?: PortalSlot) {
    const result = await companion(command, slot);
    setPortal(result);
    setPortalSelection(null);
    setNotice(
      result.message || "Companion is installed. Open the portal to begin.",
    );
  }
  return (
    <section className="booking-page">
      <div className="booking-heading">
        <span className="eyebrow">YOUR NEXT STEP</span>
        <h1>One place to plan your care.</h1>
        <p>
          Choose a center, see how it connects, and keep your demo appointments
          together.
        </p>
      </div>
      <div className="center-tabs" aria-label="Choose appointment center">
        {centers.map((c) => (
          <button
            key={c.id}
            aria-pressed={centerId === c.id}
            onClick={() => {
              setCenterId(c.id);
              setSelection(null);
              setError("");
              setNotice("");
            }}
          >
            {c.name}
            <small>
              {c.kind === "demo"
                ? "Demo booking"
                : c.kind === "portal"
                  ? "Portal companion"
                  : "Official service"}
            </small>
          </button>
        ))}
      </div>
      <div role="alert">
        {error && (
          <p className="booking-error">
            {error}{" "}
            {!ready && (
              <button onClick={() => void action(initialize)}>Retry</button>
            )}
          </p>
        )}
      </div>
      <p className="booking-notice" role="status">
        {busy ? "Working…" : notice}
      </p>
      {!ready && !error && <p>Loading your appointment hub…</p>}
      {center && (
        <div className="booking-grid">
          <div className="booking-panel">
            <span className="booking-badge">
              {center.kind === "demo"
                ? "FICTIONAL DEMO TIMES"
                : center.kind === "portal"
                  ? "BROWSER COMPANION · PREVIEW"
                  : "OFFICIAL SERVICE"}
            </span>
            <h2>{center.name}</h2>
            <p>{center.description}</p>
            <p className="booking-context">{center.note}</p>
            <a
              className="booking-source"
              href={center.source_url}
              target="_blank"
              rel="noreferrer"
            >
              Official access details <ArrowUpRight size={15} />
            </a>
            {center.kind === "demo" && (
              <>
                <label className="booking-date">
                  Choose a demo date{" "}
                  <input
                    type="date"
                    value={day}
                    onChange={(e) => {
                      setDay(e.target.value);
                      setSlots([]);
                      setSelection(null);
                    }}
                  />
                </label>
                <button
                  className="booking-primary"
                  disabled={busy || !day}
                  onClick={() =>
                    void action(async () => {
                      const result = await api<{ slots: Slot[] }>(
                        "/api/booking/demo-times",
                        "POST",
                        { day },
                      );
                      setSlots(result.slots);
                      setSelection(null);
                      if (!result.slots.length)
                        setNotice(
                          "All demo times are reserved for this date. Choose another weekday.",
                        );
                    })
                  }
                >
                  Load fictional times
                </button>
                <p className="booking-small">
                  Weekdays in the next 30 days · All times Eastern · 45 minutes
                </p>
                <div className="time-grid">
                  {slots.map((s) => (
                    <button
                      key={s.id}
                      aria-pressed={selection?.slot.id === s.id}
                      disabled={busy}
                      onClick={() =>
                        setSelection({
                          slot: s,
                          request_id: crypto.randomUUID(),
                        })
                      }
                    >
                      {timeOnly(s.starts)}
                    </button>
                  ))}
                </div>
                {selection && (
                  <div className="booking-review">
                    <h3>Review demo appointment</h3>
                    <p>
                      Cook Counseling Center
                      <br />
                      {fmt(selection.slot.starts)}
                    </p>
                    <p>
                      This saves a fictional reservation. Cook will not receive
                      it.
                    </p>
                    <button
                      className="booking-primary"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          const saved = await api<Appointment>(
                            "/api/booking/appointments",
                            "POST",
                            {
                              slot_id: selection.slot.id,
                              request_id: selection.request_id,
                            },
                          );
                          setRecords((old) =>
                            [
                              ...old.filter((a) => a.id !== saved.id),
                              saved,
                            ].sort((a, b) => a.starts.localeCompare(b.starts)),
                          );
                          setSlots((old) =>
                            old.filter((s) => s.id !== selection.slot.id),
                          );
                          setSelection(null);
                          setNotice(
                            "Demo appointment saved. Your agenda is updated.",
                          );
                        })
                      }
                    >
                      Confirm demo appointment
                    </button>
                  </div>
                )}
              </>
            )}
            {center.kind === "portal" && (
              <>
                <ol className="companion-steps">
                  <li>Open the VT portal and sign in with Duo.</li>
                  <li>
                    Choose your department, complete screening, and search for
                    appointments.
                  </li>
                  <li>
                    Read times here and select one. Finish booking in the
                    portal.
                  </li>
                </ol>
                <div className="booking-actions">
                  <button
                    className="booking-primary"
                    disabled={busy}
                    onClick={() => void action(() => portalAction("open"))}
                  >
                    Open VT portal
                  </button>
                  <button
                    className="booking-secondary"
                    disabled={busy}
                    onClick={() => void action(() => portalAction("read"))}
                  >
                    Read portal times
                  </button>
                </div>
                <p className="booking-small">
                  VT login opens in a companion window. Your credentials and
                  screening answers stay with VT. Live times remain in this
                  browser and are not saved to the demo database.
                </p>
                <details className="companion-install">
                  <summary>Install the companion / connection help</summary>
                  <p>
                    Developer preview for Chrome or Edge.{" "}
                    <a href="/hokiecare-companion.zip" download>
                      Download companion ZIP
                    </a>
                    , extract it, open your browser’s Extensions page, enable
                    Developer mode, then Load unpacked and select the extracted
                    folder. Reload HokieCare in that browser.
                  </p>
                  <p>
                    Keep the extension in the same browser as HokieCare. This
                    preview has no extension-store installer.
                  </p>
                  <button
                    className="booking-secondary"
                    disabled={busy}
                    onClick={() => void action(() => portalAction("ping"))}
                  >
                    Check connection
                  </button>
                  <p>
                    <a
                      href={center.booking_url!}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open the official portal directly ↗
                    </a>
                  </p>
                </details>
                {portal.fetched_at && (
                  <p className="booking-small">
                    Read at {timeOnly(portal.fetched_at)} · Showing{" "}
                    {portal.slots?.length} of {portal.total} times · Recheck
                    before booking
                  </p>
                )}
                <div className="portal-times">
                  {portal.slots?.map((s) => (
                    <button
                      key={s.id}
                      disabled={busy}
                      onClick={() => setPortalSelection(s)}
                      aria-pressed={portalSelection?.id === s.id}
                    >
                      <strong>
                        {s.date} · {s.time}
                      </strong>
                      <span>{s.provider}</span>
                      <small>{s.location}</small>
                    </button>
                  ))}
                </div>
                {portalSelection && (
                  <div className="booking-review">
                    <h3>Select this time in the portal?</h3>
                    <p>
                      {portalSelection.date} · {portalSelection.time}
                      <br />
                      {portalSelection.provider}
                    </p>
                    <p>
                      This selects a time only. Finish and verify your booking
                      with Schiffert.
                    </p>
                    <button
                      className="booking-primary"
                      disabled={busy}
                      onClick={() =>
                        void action(() =>
                          portalAction("select", portalSelection),
                        )
                      }
                    >
                      Select in portal
                    </button>
                  </div>
                )}
              </>
            )}
            {center.kind === "external" && (
              <a
                className="booking-primary"
                href={center.booking_url!}
                target="_blank"
                rel="noreferrer"
              >
                Continue to {center.name} <ArrowUpRight size={16} />
              </a>
            )}
          </div>
          <aside className="booking-panel agenda">
            <CalendarDays size={25} />
            <h2>Your demo agenda</h2>
            <p className="booking-small">
              Private to this browser’s demo session. Records expire after 24
              hours. No name or health details are collected.
            </p>
            {!records.length ? (
              <div className="agenda-empty">
                Your agenda is empty.
                <br />
                <span>Try the Cook demo to add your first appointment.</span>
              </div>
            ) : (
              records.map((a) => (
                <article className={"agenda-item " + a.status} key={a.id}>
                  <span className="booking-badge">
                    DEMO · {a.status === "reserved" ? "RESERVED" : "CANCELLED"}
                  </span>
                  <h3>{fmt(a.starts)}</h3>
                  <p>
                    {a.center_name}
                    <br />
                    Not booked with the provider
                  </p>
                  {a.status === "reserved" && (
                    <div className="booking-actions">
                      <button onClick={() => downloadCalendar(a)}>
                        Export calendar
                      </button>
                      <button disabled={busy} onClick={() => setCancelId(a.id)}>
                        Cancel demo
                      </button>
                    </div>
                  )}
                  {cancelId === a.id && (
                    <div>
                      <p>Cancel this fictional reservation?</p>
                      <button
                        className="booking-secondary"
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            await api(
                              `/api/booking/appointments/${a.id}/cancel`,
                              "POST",
                            );
                            setCancelId(null);
                            await refresh();
                            setSlots([]);
                            setNotice(
                              "Demo reservation cancelled. The time is available again.",
                            );
                          })
                        }
                      >
                        Confirm cancellation
                      </button>{" "}
                      <button onClick={() => setCancelId(null)}>Keep it</button>
                    </div>
                  )}
                </article>
              ))
            )}
            <details className="companion-install">
              <summary>Manage demo data</summary>
              <p>
                Delete this session’s demo records and start with an empty
                agenda.
              </p>
              <button
                className="booking-secondary"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await api("/api/booking/session", "DELETE");
                    setRecords([]);
                    setSlots([]);
                    setSelection(null);
                    await session();
                    setNotice(
                      "Your demo records were deleted. A new empty session is ready.",
                    );
                  })
                }
              >
                Delete my demo records
              </button>
            </details>
            <p className="booking-small">
              <ShieldCheck size={15} /> Real portal bookings remain in
              Schiffert’s system. Selecting a portal time does not add a
              confirmed appointment here.
            </p>
          </aside>
        </div>
      )}
    </section>
  );
}

type Answer = {
  answer: string;
  action: Navigation | null;
  model: string;
  tool: string;
  sources: { name: string; url: string }[];
};
export function CareAssistant({
  navigate,
}: {
  navigate: (action: Navigation) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  async function send() {
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      await session();
      setAnswer(await api<Answer>("/api/assistant", "POST", { message: text }));
      setText("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="assistant-wrap">
      <button
        className="assistant-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Bot size={20} />
        {open ? "Close assistant" : "Ask HokieCare"}
      </button>
      {open && (
        <section
          className="assistant-panel"
          aria-label="HokieCare navigation assistant"
        >
          <h2>Where can I help you go?</h2>
          <p>
            Ask about services, appointments, or using HokieCare. Keep questions
            general—don’t enter names, credentials, or medical details.
          </p>
          <p className="booking-small">
            Powered by Databricks AI. Your question is sent there for
            processing; HokieCare does not save chat history. This is navigation
            help, not medical advice.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor="care-question">Your question</label>
            <textarea
              id="care-question"
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={600}
              placeholder="Help me try the Cook appointment demo"
              required
            />
            <button className="booking-primary" disabled={busy || !text.trim()}>
              <Send size={16} />
              {busy ? "Finding your next step…" : "Ask assistant"}
            </button>
          </form>
          <div role="alert">
            {error && <p className="booking-error">{error}</p>}
          </div>
          <div aria-live="polite">
            {answer && (
              <>
                <p>{answer.answer}</p>
                {answer.action && (
                  <button
                    className="booking-secondary"
                    onClick={() => {
                      navigate(answer.action!);
                      setOpen(false);
                    }}
                  >
                    Open{" "}
                    {answer.action.view === "appointments"
                      ? "appointments"
                      : "matching services"}
                  </button>
                )}
                <details>
                  <summary>Sources and AI action</summary>
                  <p className="booking-small">
                    Model: {answer.model}
                    <br />
                    Tool: {answer.tool}
                  </p>
                  {answer.sources.map((s) => (
                    <a
                      className="booking-source"
                      key={s.url}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {s.name} ↗
                    </a>
                  ))}
                </details>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
