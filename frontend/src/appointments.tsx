import { useEffect, useState } from "react";
import { CalendarDays, ArrowUpRight, ShieldCheck } from "lucide-react";
import {
  api,
  session,
  easternTime,
  fullTime,
  serviceLabel,
  type Appointment,
  type Center,
} from "./api";
import { useBooking } from "./booking-state";
import { SharedCalendar, BookingReview } from "./calendar";
import "./appointments.css";
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
const timeOnly = easternTime;
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
    `SUMMARY:DEMO - ${a.center_name}`,
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

function ProviderAccess({ center }: { center: Center }) {
  const [portal, setPortal] = useState<Companion>({}),
    [portalSelection, setPortalSelection] = useState<PortalSlot | null>(null);
  const [connection, setConnection] = useState<
    "checking" | "connected" | "unavailable"
  >("checking");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function checkCompanion() {
    setConnection("checking");
    try {
      const result = await companion("ping", undefined, 1500);
      setConnection(result.state === "installed" ? "connected" : "unavailable");
    } catch {
      setConnection("unavailable");
    }
  }
  useEffect(() => {
    void checkCompanion();
  }, []);
  async function action(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function portalAction(command: string, slot?: PortalSlot) {
    const result = await companion(command, slot);
    setPortal(result);
    setPortalSelection(null);
    setNotice(
      result.message || "Companion is installed. Open the portal to begin.",
    );
  }
  return (
    <div className="provider-access">
      {center.booking_url && (
        <a
          className="official-booking-link"
          href={center.booking_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {center.kind === "portal"
            ? "Open VT portal"
            : "Official scheduling & access"}
          <ArrowUpRight size={16} />
        </a>
      )}
      <details className="provider-details">
        <summary>About {center.name} & access details</summary>
        <p>{center.description}</p>
        <p className="booking-small">{center.note}</p>
        <a
          className="booking-source"
          href={center.source_url}
          target="_blank"
          rel="noreferrer"
        >
          Official source <ArrowUpRight size={15} />
        </a>
        {error && (
          <p role="alert" className="booking-error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {center.kind === "portal" && (
          <>
            <ol className="companion-steps">
              <li>Open the VT portal and sign in with Duo.</li>
              <li>
                Choose your department, complete screening, and search for
                appointments.
              </li>
              <li>Select a time and finish booking in the official portal.</li>
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
              Opens the official portal in a new tab. No extension is needed.
              Your credentials and screening answers stay with VT.
            </p>
            <details className="companion-install">
              <summary>Optional: view portal times in HokieCare</summary>
              <p>
                The companion adds the ability to read and select displayed
                times here. It requires our Chrome/Edge extension in the same
                browser as HokieCare. You can book directly through Open VT
                portal without it.
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
                After opening the companion window, sign in, complete screening,
                and search there. Then return here to read times. Final booking
                stays in the portal. Live times stay in browser memory and are
                not saved to the demo database.
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
                {portal.slots?.length} of {portal.total} times · Recheck before
                booking
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
                  This selects a time only. Finish and verify your booking with
                  Schiffert.
                </p>
                <button
                  className="booking-primary"
                  disabled={busy}
                  onClick={() =>
                    void action(() => portalAction("select", portalSelection))
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
      </details>
    </div>
  );
}

export function AppointmentPanel({ active }: { active: boolean }) {
  const b = useBooking(),
    center = b.centers.find((c) => c.id === b.selection.center_id);
  const [cancelId, setCancelId] = useState<string | null>(null),
    [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function action(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="appointment-panel" aria-label="Appointments">
      <div className="panel-tabs" aria-label="Appointment view">
        <button
          aria-pressed={b.tab === "calendar"}
          onClick={() => b.setTab("calendar")}
        >
          Calendar
        </button>
        <button
          aria-pressed={b.tab === "agenda"}
          onClick={() => b.setTab("agenda")}
        >
          My appointments{" "}
          <span>{b.records.filter((a) => a.status === "reserved").length}</span>
        </button>
      </div>
      {!b.ready && !b.error && <p role="status">Loading your calendar…</p>}
      {b.error && !b.review && (
        <p role="alert" className="booking-error">
          {b.error} <button onClick={() => void b.initialize()}>Refresh</button>
        </p>
      )}
      {b.review?.operation === "reschedule" && <BookingReview />}
      <div hidden={b.tab !== "calendar"}>
        <label className="booking-date">
          Care center
          <select
            disabled={b.busy}
            value={b.selection.center_id}
            onChange={(e) => {
              b.changeSelection({
                center_id: e.target.value,
                service_id: undefined,
                mode: "demo",
              });
              b.setRescheduling(null);
            }}
          >
            {b.centers.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {center && <ProviderAccess key={center.id} center={center} />}
        <SharedCalendar active={active && b.tab === "calendar"} />
      </div>
      <div className="agenda" hidden={b.tab !== "agenda"}>
        <p className="booking-small">
          Private sample reservations for this browser. Records remain until 30
          days after the visit. Clearing cookies loses access.
        </p>
        {error && (
          <p role="alert" className="booking-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="booking-notice">
            {notice}
          </p>
        )}
        {b.ready && !b.records.length ? (
          <div className="agenda-empty">
            <CalendarDays size={32} />
            <h3>A little room for your well-being.</h3>
            <p>
              Your calendar is empty. Pick a service and a time to plan your
              first visit.
            </p>
            <button
              className="booking-secondary"
              onClick={() => b.setTab("calendar")}
            >
              Explore the calendar
            </button>
          </div>
        ) : (
          b.records.map((a) => (
            <article
              key={a.id}
              className={
                "agenda-item " +
                a.status +
                (b.saved?.slot.id === a.slot_id ? " just-saved" : "")
              }
            >
              <span className="booking-badge">
                Sample · {a.status === "reserved" ? "Reserved" : "Cancelled"}
              </span>
              <h3>
                {serviceLabel(
                  b.services.find((s) => s.id === a.service_id)?.name ||
                    a.center_name,
                )}
              </h3>
              <p>
                {fullTime(a.starts)} – {easternTime(a.ends)} Eastern
              </p>
              <p className="booking-small">
                {a.booking_name && <>{a.booking_name} · </>}{a.center_name} · Not booked with the provider
              </p>
              {a.status === "reserved" && (
                <div className="booking-actions">
                  <button onClick={() => downloadCalendar(a)}>
                    Export calendar
                  </button>
                  <button
                    disabled={busy || b.busy}
                    onClick={() => b.beginReschedule(a)}
                  >
                    Reschedule
                  </button>
                  <button
                    disabled={busy || b.busy}
                    onClick={() => setCancelId(a.id)}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      b.changeSelection({
                        center_id: a.center_id,
                        service_id: a.service_id,
                        day: new Intl.DateTimeFormat("en-CA", {
                          timeZone: "America/New_York",
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        }).format(new Date(a.starts)),
                        mode: "demo",
                      });
                      b.setTab("calendar");
                    }}
                  >
                    Show in calendar
                  </button>
                </div>
              )}
              {cancelId === a.id && (
                <div className="cancel-review">
                  <p>Cancel this sample reservation?</p>
                  <button
                    className="booking-secondary"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await api(
                          "/api/booking/appointments/" + a.id + "/cancel",
                          "POST",
                        );
                        setCancelId(null);
                        b.dismissReview();
                        if (b.saved?.slot.id === a.slot_id) b.setSaved(null);
                        b.setRescheduling(null);
                        window.dispatchEvent(
                          new Event("hokiecare-booking-changed"),
                        );
                        setNotice(
                          "Reservation cancelled. The time is available again.",
                        );
                      })
                    }
                  >
                    Confirm cancellation
                  </button>
                  <button disabled={busy} onClick={() => setCancelId(null)}>
                    Keep it
                  </button>
                </div>
              )}
            </article>
          ))
        )}
        <details className="calendar-info">
          <summary>Manage session data</summary>
          <p>
            This deletes only this browser’s sample records and starts an empty
            session.
          </p>
          {deleting ? (
            <div className="booking-actions">
              <button
                disabled={busy || b.busy}
                onClick={() =>
                  void action(async () => {
                    await api("/api/booking/session", "DELETE");
                    await session();
                    b.dismissReview();
                    b.setSaved(null);
                    b.setRescheduling(null);
                    await b.refresh();
                    setDeleting(false);
                    window.dispatchEvent(
                      new Event("hokiecare-session-cleared"),
                    );
                    window.dispatchEvent(
                      new Event("hokiecare-booking-changed"),
                    );
                    setNotice("Your sample records were deleted.");
                  })
                }
              >
                Confirm deletion
              </button>
              <button onClick={() => setDeleting(false)}>Keep records</button>
            </div>
          ) : (
            <button onClick={() => setDeleting(true)}>
              Delete my sample records
            </button>
          )}
        </details>
        <p className="booking-small">
          <ShieldCheck size={15} /> Official provider bookings remain in their
          own systems. Selecting a portal time does not save a confirmed
          appointment here.
        </p>
      </div>
    </section>
  );
}
