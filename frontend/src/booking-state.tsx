import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  ApiError,
  session,
  prepareReview,
  easternDate,
  type Appointment,
  type Center,
  type Service,
  type InventorySlot,
  type Review,
  type Navigation,
  type WaitlistEntry,
} from "./api";

const initialSelection = (): Navigation => ({
  view: "appointments", category: "all", center_id: "schiffert",
  mode: "demo", day: easternDate(),
});

function useBookingState(active: boolean) {
  const [panel, setPanel] = useState<"calendar" | "directory" | null>(null);
  const [tab, setTab] = useState<"calendar" | "agenda" | "waitlist">("calendar");
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [waitlistError, setWaitlistError] = useState("");
  const [waitlistBusy, setWaitlistBusy] = useState(false);
  const waitlistGeneration = useRef(0);
  const waitlistCursor = useRef(0);
  const refreshWaitlist = useCallback(async () => {
    const generation = ++waitlistGeneration.current;
    try {
      const result = await api<{ entries: WaitlistEntry[]; revision: number }>("/api/booking/waitlist");
      if (generation === waitlistGeneration.current) { waitlistCursor.current = result.revision; setWaitlist(result.entries); setWaitlistError(""); }
    } catch (e) {
      if (generation === waitlistGeneration.current) setWaitlistError((e as Error).message);
    }
  }, []);
  const [selection, setSelection] = useState<Navigation>(initialSelection);
  const [centers, setCenters] = useState<Center[]>([]),
    [services, setServices] = useState<Service[]>([]);
  const [records, setRecords] = useState<Appointment[]>([]),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [review, setReviewState] = useState<Review | null>(null),
    [saved, setSaved] = useState<Review | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null),
    [busy, setBusy] = useState(false);
  const [canReplaceReview, setCanReplaceReview] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const [uncertainSave, setUncertainSave] = useState(false);
  const currentReview = useRef<Review | null>(null),
    resetQueued = useRef(false), uncertain = useRef(false);
  const setReview = useCallback((next: Review | null) => {
    currentReview.current = next;
    setReviewState(next);
  }, []);
  const revision = useRef(0),
    locked = useRef(false),
    loaded = useRef(false),
    refreshGeneration = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++refreshGeneration.current;
    const result = await api<{ appointments: Appointment[] }>(
      "/api/booking/appointments",
    );
    if (request === refreshGeneration.current) setRecords(result.appointments);
  }, []);
  const initialize = useCallback(async () => {
    const attempt = revision.current;
    const restoredId = sessionStorage.getItem("hokiecare-review-id");
    try {
      await session();
      const catalog = await api<{ centers: Center[]; services: Service[] }>(
        "/api/booking/catalog",
      );
      setCenters(catalog.centers);
      setServices(catalog.services);
      await refresh();
      await refreshWaitlist();
      setReady(true);
      setError("");
      if (!loaded.current) {
        loaded.current = true;
        const id = restoredId;
        if (id) {
          try {
            if (attempt !== revision.current) {
              void api(`/api/booking/proposals/${id}`, "DELETE").catch(() => {});
              return;
            }
            const restored = await api<Review>(`/api/booking/proposals/${id}`);
            if (attempt !== revision.current) {
              void api(`/api/booking/proposals/${id}`, "DELETE").catch(() => {});
              return;
            }
            setReview(restored);
            setSelection((s) => ({
              ...s,
              center_id: restored.slot.center_id,
              service_id: restored.slot.service_id,
              day: easternDate(restored.slot.starts),
              mode: "demo",
            }));
            setPanel(restored.intake ? null : "calendar");
          } catch {
            if (attempt === revision.current) sessionStorage.removeItem("hokiecare-review-id");
          }
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [refresh, refreshWaitlist, setReview]);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  const hasWaiting = waitlist.some(w => w.status === "waiting" || w.status === "available");
  useEffect(() => {
    if (!ready || !active) return;
    let stream: EventSource | null = null;
    const changed = () => { void refreshWaitlist(); };
    const visibility = () => {
      stream?.close(); stream = null;
      if (!document.hidden) {
        changed();
        if (hasWaiting) {
          stream = new EventSource("/api/booking/events?cursor=" + waitlistCursor.current);
          stream.addEventListener("availability", changed);
        }
      }
    };
    visibility();
    const timer = hasWaiting ? window.setInterval(() => { if (!document.hidden) changed(); }, 5000) : null;
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("hokiecare-booking-changed", changed);
    return () => { stream?.close(); if (timer !== null) window.clearInterval(timer); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("hokiecare-booking-changed", changed); };
  }, [ready, active, hasWaiting, refreshWaitlist]);
  useEffect(() => {
    if (!active) return;
    const changed = () => void refresh().catch((e) => setError(e.message));
    window.addEventListener("hokiecare-booking-changed", changed);
    if (ready && panel === "calendar") changed();
    return () =>
      window.removeEventListener("hokiecare-booking-changed", changed);
  }, [active, panel, ready, refresh]);
  const dismissReview = useCallback(() => {
    if (locked.current || uncertain.current) return false;
    revision.current++;
    const previous = currentReview.current;
    if(previous) void api(`/api/booking/proposals/${previous.id}`, "DELETE").catch(() => setError("Could not dismiss the old review. It will expire automatically."));
    setReview(null);
    setError("");
    sessionStorage.removeItem("hokiecare-review-id");
    sessionStorage.removeItem("hokiecare-pending-review");
    return true;
  }, [setReview]);
  const resetRequest = useCallback(() => {
    if (!dismissReview()) return;
    resetQueued.current = false;
    setSaved(null); setRescheduling(null); setCanReplaceReview(false);
    setPanel(null); setTab("calendar"); setSelection(initialSelection());
    setResetVersion(v => v + 1);
    window.dispatchEvent(new Event("hokiecare-request-reset"));
  }, [dismissReview]);
  useEffect(() => {
    const cleared = () => {
      waitlistGeneration.current++; setWaitlist([]); setWaitlistError("");
      uncertain.current = false; setUncertainSave(false);
      resetRequest();
    };
    window.addEventListener("hokiecare-session-cleared", cleared);
    return () => window.removeEventListener("hokiecare-session-cleared", cleared);
  }, [resetRequest]);
  useEffect(() => {
    const home = () => {
      resetQueued.current = true;
      if (locked.current) return;
      if (uncertain.current) {
        setError("We still need to check whether your appointment saved. Retry this confirmation before starting a new request.");
        setPanel(currentReview.current?.intake ? null : "calendar");
        return;
      }
      resetRequest();
    };
    window.addEventListener("hokiecare-home-request", home);
    return () => window.removeEventListener("hokiecare-home-request", home);
  }, [resetRequest]);
  const changeSelection = useCallback(
    (next: Partial<Navigation>) => {
      if (!dismissReview()) return;
      setSelection((s) => ({ ...s, ...next }));
    },
    [dismissReview],
  );
  const navigate = useCallback(
    (action: Navigation) => {
      if (!dismissReview()) return;
      setRescheduling(null);
      setSelection((s) => ({
        ...s,
        ...action,
        center_id: action.center_id === "none" ? s.center_id : action.center_id,
        service_id: action.service_id,
        mode: action.mode || "provider",
      }));
      setPanel(action.view === "care" ? "directory" : "calendar");
      setTab("calendar");
    },
    [dismissReview],
  );
  async function selectSlot(slot: InventorySlot, appointmentId?: string) {
    if (locked.current || uncertain.current) return;
    if (!appointmentId) {
      dismissReview();setSaved(null);setPanel(null);
      window.dispatchEvent(new CustomEvent("hokiecare-intake-prefill", {detail:slot}));
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    setReview(null);
    const attempt = ++revision.current;
    setSelection((s) => ({
      ...s,
      center_id: slot.center_id,
      service_id: slot.service_id,
      day: easternDate(slot.starts),
      mode: "demo",
    }));
    setPanel("calendar");
    setTab("calendar");
    try {
      await session();
      const next = await prepareReview(slot, appointmentId);
      if (attempt === revision.current) setReview(next);
    } catch (e) {
      if (attempt === revision.current) setError((e as Error).message);
    } finally {
      locked.current = false;
      setBusy(false);
      if (resetQueued.current) resetRequest();
    }
  }
  async function joinWaitlist(slot: InventorySlot) {
    if (waitlistBusy || locked.current || uncertain.current) return;
    setWaitlistBusy(true); setWaitlistError("");
    try {
      await session();
      await api("/api/booking/waitlist", "POST", { slot_id: slot.id, request_id: crypto.randomUUID() });
      await refreshWaitlist(); setTab("waitlist");
    } catch (e) { setWaitlistError((e as Error).message); }
    finally { setWaitlistBusy(false); }
  }
  async function leaveWaitlist(id: string) {
    if (waitlistBusy || locked.current || uncertain.current) return;
    setWaitlistBusy(true); setWaitlistError("");
    try {
      await api(`/api/booking/waitlist/${id}`, "DELETE");
      if (currentReview.current?.waitlist_id === id) dismissReview();
      await refreshWaitlist();
    } catch (e) { setWaitlistError((e as Error).message); }
    finally { setWaitlistBusy(false); }
  }
  function reviewWaitlist(entry: WaitlistEntry) {
    if (!dismissReview()) return;
    setSaved(null); setRescheduling(null); setPanel(null);
    window.dispatchEvent(new CustomEvent("hokiecare-intake-prefill", { detail: { ...entry.slot, waitlist_id: entry.id } }));
  }
  function adoptReview(next: Review) {
    setCanReplaceReview(false);
    setReview(next);setError("");setSaved(null);setRescheduling(null);setPanel(null);
    setSelection(s=>({...s,center_id:next.slot.center_id,service_id:next.slot.service_id,day:easternDate(next.slot.starts),mode:"demo"}));
    sessionStorage.setItem("hokiecare-review-id",next.id);
  }
  async function confirm() {
    if (!review || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await api(`/api/booking/proposals/${review.id}/confirm`, "POST");
      uncertain.current = false; setUncertainSave(false);
      setSaved(review);
      setReview(null);
      setRescheduling(null);
      setTab("agenda");
      sessionStorage.removeItem("hokiecare-review-id");
      sessionStorage.removeItem("hokiecare-pending-review");
      window.dispatchEvent(new Event("hokiecare-booking-changed"));
    } catch (e) {
      const replaceable = e instanceof ApiError && (e.status === 409 || e.status === 404);
      uncertain.current = !(e instanceof ApiError && e.status < 500);
      setUncertainSave(uncertain.current);
      setCanReplaceReview(replaceable);
      setError((e as Error).message);
      void refreshWaitlist();
    } finally {
      locked.current = false;
      setBusy(false);
      if (resetQueued.current && !uncertain.current) resetRequest();
    }
  }
  function beginReschedule(a: Appointment) {
    if (locked.current || uncertain.current) return;
    changeSelection({
      center_id: a.center_id,
      service_id: a.service_id,
      day: easternDate(a.starts),
      mode: "demo",
    });
    setRescheduling(a);
    setTab("calendar");
  }
  return {
    active,
    waitlist,
    waitlistError,
    waitlistBusy,
    refreshWaitlist,
    joinWaitlist,
    leaveWaitlist,
    reviewWaitlist,
    resetVersion,
    uncertainSave,
    panel,
    setPanel,
    tab,
    setTab,
    selection,
    changeSelection,
    navigate,
    centers,
    services,
    records,
    ready,
    error,
    setError,
    initialize,
    refresh,
    review,
    dismissReview,
    selectSlot,
    adoptReview,
    canReplaceReview,
    confirm,
    busy,
    saved,
    setSaved,
    rescheduling,
    setRescheduling,
    beginReschedule,
  };
}
type BookingState = ReturnType<typeof useBookingState>;
const BookingContext = createContext<BookingState | null>(null);
export function BookingProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const state = useBookingState(active);
  return (
    <BookingContext.Provider value={state}>{children}</BookingContext.Provider>
  );
}
export function useBooking() {
  const state = useContext(BookingContext);
  if (!state) throw Error("BookingProvider is required");
  return state;
}
