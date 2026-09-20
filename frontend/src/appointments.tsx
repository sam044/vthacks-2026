import { useEffect, useState } from "react";
import {
  CalendarDays,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import "./appointments.css";
import { SharedCalendar } from "./calendar";
import { AppointmentEmails } from "./appointment-emails";

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
  service_id: string;
  center_id: string;
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
  mode?: "demo" | "provider";
  service_id?: string;
  day?: string;
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
function companion(
  command: string,
  slot?: PortalSlot,
  timeout = 10000,
): Promise<Companion> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", receive);
      reject(
        Error(
          "Companion not detected. Install it in this browser, then reload HokieCare.",
        ),
      );
    }, timeout);
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
    `SUMMARY:DEMO - ${a.center_name}` ,
    "DESCRIPTION:Fictional HokieCare demo. Not booked with the provider.",
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
  destination,
}: {
  destination?: Navigation;
  initialCenter?: string;
}) {
  const [centers, setCenters] = useState<Center[]>([]);
  const [centerId, setCenterId] = useState(
    initialCenter === "none" ? "schiffert" : initialCenter,
  );
  const [records, setRecords] = useState<Appointment[]>([]);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [portal, setPortal] = useState<Companion>({});
  const [connection, setConnection] = useState<
    "checking" | "connected" | "unavailable"
  >("checking");
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
  useEffect(() => { const changed=()=>void refresh().catch(()=>{}); window.addEventListener("hokiecare-booking-changed",changed); return()=>window.removeEventListener("hokiecare-booking-changed",changed); }, []);
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
    let active = true;
    companion("ping", undefined, 1500).then(
      (result) => {
        if (active)
          setConnection(
            result.state === "installed" ? "connected" : "unavailable",
          );
      },
      () => {
        if (active) setConnection("unavailable");
      },
    );
    return () => {
      active = false;
    };
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
  async function checkCompanion() {
    setConnection("checking");
    try {
      const result = await companion("ping", undefined, 1500);
      setConnection(result.state === "installed" ? "connected" : "unavailable");
    } catch {
      setConnection("unavailable");
    }
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
              setRescheduling(null);
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
            {center.kind === "portal" && (
              <>
                <ol className="companion-steps">
                  <li>Open the VT portal and sign in with Duo.</li>
                  <li>
                    Choose your department, complete screening, and search for
                    appointments.
                  </li>
                  <li>
                    Select a time and finish booking in the official portal.
                  </li>
                </ol>
                <div className="booking-actions">
                  <a
                    className="booking-primary"
                    href={center.booking_url!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open VT portal
                    <ArrowUpRight size={16} />
                  </a>
                </div>
                <p className="booking-small">
                  Opens the official portal in a new tab. No extension is
                  needed. Your credentials and screening answers stay with VT.
                </p>
                <details className="companion-install">
                  <summary>Optional: view portal times in HokieCare</summary>
                  <p>
                    The companion adds the ability to read and select displayed
                    times here. It requires our Chrome/Edge extension in the
                    same browser as HokieCare. You can book directly through
                    Open VT portal without it.
                  </p>
                  <p role="status">
                    {connection === "checking"
                      ? "Checking for the optional companion…"
                      : connection === "connected"
                        ? "Companion connected. Open its window to pair it with this page."
                        : "Optional companion not detected. Direct portal booking is available above."}
                  </p>
                  {connection === "connected" && (
                    <div className="booking-actions">
                      <button
                        className="booking-secondary"
                        disabled={busy}
                        onClick={() => void action(() => portalAction("open"))}
                      >
                        Open companion window
                      </button>
                      <button
                        className="booking-secondary"
                        disabled={busy}
                        onClick={() => void action(() => portalAction("read"))}
                      >
                        Read portal times
                      </button>
                    </div>
                  )}
                  <p>
                    After opening the companion window, sign in, complete
                    screening, and search there. Then return here to read times.
                    Final booking stays in the portal. Live times stay in
                    browser memory and are not saved to the demo database.
                  </p>
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
                    disabled={connection === "checking"}
                    onClick={() => void checkCompanion()}
                  >
                    Check connection
                  </button>
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
            <AppointmentEmails />
            <SharedCalendar destination={destination?.center_id===centerId ? destination : undefined} centerId={centerId} records={records} onSaved={() => void refresh()}
              reschedule={rescheduling} onStopReschedule={() => setRescheduling(null)} />
          </div>
          <aside className="booking-panel agenda">
            <CalendarDays size={25} />
            <h2>Your demo agenda</h2>
            <p className="booking-small">
              Private to this browser’s demo session. Records expire after 24
              hours. This agenda is separate from the mock email schedule.
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
                      <button disabled={busy} onClick={() => {setCenterId(a.center_id);setRescheduling(a)}}>Reschedule demo</button>
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
                            window.dispatchEvent(new Event("hokiecare-booking-changed"));
                            await refresh();
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
                          await session();
                    sessionStorage.removeItem("hokiecare-pending-review");
                    sessionStorage.removeItem("hokiecare-review-id");
                    window.dispatchEvent(new Event("hokiecare-booking-changed"));
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

export { CareAssistant } from "./care-assistant";
