import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import {
  api,
  easternDate,
  easternTime,
  fullTime,
  serviceLabel,
  type InventorySlot,
} from "./api";
import { useBooking } from "./booking-state";

type Day = {
  day: string;
  state: string;
  reason: string | null;
  available: number | null;
};
type Inventory = {
  days: Day[];
  slots: InventorySlot[];
  revision: number;
  fetched_at: string;
  storage: string;
};
export const shiftMonth = (month: string, amount: number) => {
  const d = new Date(month + "-01T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + amount);
  return d.toISOString().slice(0, 7);
};

export function BookingReview({onEdit}:{onEdit?:()=>void} = {}) {
  const { review, confirm, dismissReview, busy, error, uncertainSave } = useBooking();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [review?.id]);
  if (!review) return null;
  return (
    <section className="booking-review" aria-label="Review appointment">
      <span className="booking-badge">
        Appointment details
      </span>
      <h3 ref={heading} tabIndex={-1}>
        {review.operation === "reschedule"
          ? "Review your new time"
          : "Review your appointment"}
      </h3>
      <strong>{serviceLabel(review.service_name)}</strong>
      {review.booking_name && <p>{review.booking_name} · {review.center_name}</p>}
      <p>
        {fullTime(review.slot.starts)} – {easternTime(review.slot.ends)} Eastern
      </p>
      <p>
        Confirm to save this appointment in HokieCare.
      </p>
      <details>
        <summary>Review details</summary>
        <p>
          Reviews last two minutes. Availability is checked
          again when you confirm.
        </p>
      </details>
      {error && (
        <p className="booking-error" role="alert">
          {error} If the connection failed, retry this same confirmation to
          check whether it saved. If the review expired or the time was taken,
          go back and choose a time again.
        </p>
      )}
      <div className="booking-actions">
        <button
          className="booking-primary"
          disabled={busy}
          onClick={() => void confirm()}
        >
          {busy ? "Saving…" : "Confirm appointment"}
        </button>
        <button
          className="booking-secondary"
          disabled={busy || uncertainSave}
          onClick={onEdit || dismissReview}
        >
          {onEdit ? "Edit answers" : "Back to times"}
        </button>
      </div>
    </section>
  );
}

export function SharedCalendar({ active }: { active: boolean }) {
  const b = useBooking();
  const {
    selection,
    services,
    records,
    changeSelection,
    rescheduling,
    setRescheduling,
  } = b;
  const centerId = selection.center_id,
    service =
      services.find(
        (s) => s.id === selection.service_id && s.center_id === centerId,
      ) || services.find((s) => s.center_id === centerId);
  const serviceId = service?.id,
    mode = selection.mode || "provider",
    day = selection.day || easternDate(),
    month = day.slice(0, 7);
  const [data, setData] = useState<Inventory | null>(null),
    [error, setError] = useState(""),
    [live, setLive] = useState(false);
  const generation = useRef(0),
    focusDay = useRef<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    if (!serviceId || !active) return;
    const id = ++generation.current;
    try {
      const result = await api<Inventory>(
        "/api/booking/availability?service_id=" +
          serviceId +
          "&from=" +
          month +
          "-01&to=" +
          shiftMonth(month, 1) +
          "-01&mode=" +
          mode,
      );
      if (id === generation.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (id === generation.current) setError((e as Error).message);
    }
  }, [serviceId, month, mode, active]);
  useEffect(() => {
    setData(null);
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  useEffect(() => {
    if (!active || !serviceId || mode !== "demo") {
      setLive(false);
      return;
    }
    let stream: EventSource | null = null;
    function connect() {
      stream?.close();
      stream = new EventSource("/api/booking/events?service_id=" + serviceId);
      stream.onopen = () => setLive(true);
      stream.onerror = () => setLive(false);
      stream.addEventListener("availability", () => void load());
    }
    function visible() {
      if (document.hidden) {
        stream?.close();
        stream = null;
        setLive(false);
      } else {
        connect();
        void load();
      }
    }
    if (!document.hidden) connect();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("hokiecare-booking-changed", load);
    return () => {
      stream?.close();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("hokiecare-booking-changed", load);
    };
  }, [active, serviceId, mode, load]);
  useEffect(() => {
    if (focusDay.current && data) {
      grid.current
        ?.querySelector<HTMLButtonElement>(
          '[data-day="' + focusDay.current + '"]',
        )
        ?.focus();
      focusDay.current = null;
    }
  }, [data, day]);
  const selected = data?.days.find((d) => d.day === day),
    slots = data?.slots.filter((s) => easternDate(s.starts) === day) || [];
  const title = new Date(month + "-01T12:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
  const dayTitle = new Date(day + "T12:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const firstWeekday = new Date(month + "-01T12:00:00Z").getUTCDay();
  const maxMonth = "2027-05", maxDay = "2027-05-12";
  const selectDay = (value: string) => changeSelection({ day: value });
  return (
    <section className="shared-calendar" aria-label="Service calendar">
      <label className="booking-date">
        Service
        <select
          disabled={b.busy}
          value={serviceId || ""}
          onChange={(e) => {
            changeSelection({ service_id: e.target.value });
            setRescheduling(null);
          }}
        >
          {services
            .filter((s) => s.center_id === centerId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {serviceLabel(s.name)}
              </option>
            ))}
        </select>
      </label>
      {centerId === "timelycare" && (
        <p className="booking-small">
          TalkNow is on demand and does not need a calendar reservation.{" "}
          <a
            href="https://ucc.vt.edu/timelycare.html"
            target="_blank"
            rel="noreferrer"
          >
            Access TalkNow ↗
          </a>
        </p>
      )}
      <div className="inventory-switch" aria-label="Appointment data">
        <button
          disabled={b.busy || !!rescheduling}
          aria-pressed={mode === "provider"}
          onClick={() => changeSelection({ mode: "provider" })}
        >
          Provider availability
        </button>
        <button
          disabled={b.busy}
          aria-pressed={mode === "demo"}
          onClick={() => changeSelection({ mode: "demo" })}
        >
          Appointment calendar
        </button>
      </div>
      <p className="booking-context">
        {mode === "demo"
          ? "Your HokieCare appointment calendar."
          : "Provider availability is not connected. Use the official booking route above."}
      </p>
      {rescheduling && (
        <p className="booking-context">
          Choose a new time. Your original reservation stays saved until the
          move succeeds.{" "}
          <button
            disabled={b.busy}
            onClick={() => {
              b.dismissReview();
              setRescheduling(null);
            }}
          >
            Stop rescheduling
          </button>
        </p>
      )}
      <div className="calendar-toolbar">
        <button
          aria-label="Previous month"
          disabled={b.busy || month <= easternDate().slice(0, 7)}
          onClick={() => selectDay(shiftMonth(month, -1) + "-01")}
        >
          <ChevronLeft size={18} />
        </button>
        <h3>{title}</h3>
        <button
          aria-label="Next month"
          disabled={b.busy || month >= maxMonth}
          onClick={() => selectDay(shiftMonth(month, 1) + "-01")}
        >
          <ChevronRight size={18} />
        </button>
        <button disabled={b.busy} onClick={() => selectDay(easternDate())}>
          Today
        </button>
      </div>
      <div ref={grid} className="calendar-grid" aria-label={title}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <span className="calendar-weekday" key={d}>
            {d}
          </span>
        ))}
        {Array.from({ length: firstWeekday }, (_, i) => (
          <span key={"blank-" + i} />
        ))}
        {data?.days.map((d) => {
          const hasAppointment = records.some(
            (a) =>
              a.status === "reserved" &&
              a.service_id === serviceId &&
              easternDate(a.starts) === d.day,
          );
          const label =
            d.state === "not_connected"
              ? "Availability unknown"
              : d.reason || d.available + " available start times";
          return (
            <button
              disabled={b.busy}
              key={d.day}
              className={
                "calendar-day " +
                d.state +
                (hasAppointment ? " has-appointment" : "")
              }
              aria-pressed={day === d.day}
              aria-current={d.day === easternDate() ? "date" : undefined}
              aria-label={
                d.day +
                ": " +
                label +
                (hasAppointment ? ", your appointment" : "")
              }
              data-day={d.day}
              onClick={() => selectDay(d.day)}
              onKeyDown={(e) => {
                const delta = (
                  {
                    ArrowLeft: -1,
                    ArrowRight: 1,
                    ArrowUp: -7,
                    ArrowDown: 7,
                  } as Record<string, number>
                )[e.key];
                if (delta) {
                  e.preventDefault();
                  const next = new Date(d.day + "T12:00:00Z");
                  next.setUTCDate(next.getUTCDate() + delta);
                  const value = next.toISOString().slice(0, 10);
                  if (
                    value >= easternDate().slice(0, 7) + "-01" &&
                    value <= maxDay
                  ) {
                    focusDay.current = value;
                    selectDay(value);
                  }
                }
              }}
            >
              <strong>{Number(d.day.slice(8))}</strong>
              <small>
                {hasAppointment
                  ? "Yours"
                  : d.state === "not_connected"
                    ? "—"
                    : d.state === "outside_window"
                      ? "—"
                      : d.reason
                        ? "Closed"
                        : d.available + " free"}
              </small>
            </button>
          );
        })}
      </div>
      <label className="booking-date">
        Choose a date (Eastern)
        <input
          disabled={b.busy}
          type="date"
          value={day}
          min={easternDate().slice(0, 7) + "-01"}
          max={maxDay}
          onChange={(e) => {
            if (e.target.value && e.target.validity.valid)
              selectDay(e.target.value);
          }}
        />
      </label>
      {!data && !error && active && <p role="status">Loading calendar…</p>}
      {error && (
        <p className="booking-error" role="alert">
          {error} Calendar may be stale.{" "}
          <button onClick={() => void load()}>Refresh</button>
        </p>
      )}
      <h3 className="selected-day">
        <CalendarDays size={18} />
        {dayTitle}
      </h3>
      <p className="booking-small">
        All times Eastern
        {service ? " · " + service.duration_minutes + " minutes" : ""}
      </p>
      {selected?.reason && <p>{selected.reason}</p>}
      {data && mode === "demo" && !slots.length && !selected?.reason && (
        <p>No times on this date. Try another day.</p>
      )}
      <div className="time-grid">
        {slots.map((slot) => {
          const yours = records.some(
            (a) => a.slot_id === slot.id && a.status === "reserved",
          );
          return (
            <button
              key={slot.id}
              disabled={b.busy || b.waitlistBusy || yours || (slot.state === "busy" && !!rescheduling) || !!error}
              className={slot.state + (yours ? " yours" : "")}
              onClick={() => slot.state === "busy" ? void b.joinWaitlist(slot) : void b.selectSlot(slot, rescheduling?.id)}
            >
              {easternTime(slot.starts)}
              <small>
                {yours
                  ? "Your appointment"
                  : slot.state === "busy"
                    ? "Join waitlist"
                    : "Available"}
              </small>
            </button>
          );
        })}
      </div>
      {mode === "demo" && (
        <details className="calendar-info">
          <summary>Schedule and connection details</summary>
          <p className="booking-small">
            Scheduling hours:{" "}
            {service?.weekly[
              String((new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7)
            ]
              ?.map((x) => x.join("–"))
              .join(", ") || "Closed"}
            . Each 30-minute visit includes a 30-minute buffer; starts are one hour apart.
          </p>
          <p className="booking-small">
            {live
              ? "Live updates connected"
              : "Reconnecting; refreshing every 5 seconds"}{" "}
            ·{" "}
            {data?.storage === "lakebase"
              ? "Saved in Databricks Lakebase"
              : "Local storage"}
            {data && " · Refreshed " + easternTime(data.fetched_at)}
          </p>
          <p className="booking-small">
            This calendar follows the academic-year scheduling policy. Check official sources for provider hours.
          </p>
        </details>
      )}
      {service && (
        <a
          className="booking-source"
          href={service.source_url}
          target="_blank"
          rel="noreferrer"
        >
          Service details and official source ↗
        </a>
      )}
    </section>
  );
}
