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
  session,
  prepareReview,
  easternDate,
  type Appointment,
  type Center,
  type Service,
  type InventorySlot,
  type Review,
  type Navigation,
} from "./api";

function useBookingState(active: boolean) {
  const [panel, setPanel] = useState<"calendar" | "directory" | null>(null);
  const [tab, setTab] = useState<"calendar" | "agenda">("calendar");
  const [selection, setSelection] = useState<Navigation>({
    view: "appointments",
    category: "all",
    center_id: "schiffert",
    mode: "provider",
    day: easternDate(),
  });
  const [centers, setCenters] = useState<Center[]>([]),
    [services, setServices] = useState<Service[]>([]);
  const [records, setRecords] = useState<Appointment[]>([]),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [review, setReview] = useState<Review | null>(null),
    [saved, setSaved] = useState<Review | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null),
    [busy, setBusy] = useState(false);
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
    try {
      await session();
      const catalog = await api<{ centers: Center[]; services: Service[] }>(
        "/api/booking/catalog",
      );
      setCenters(catalog.centers);
      setServices(catalog.services);
      await refresh();
      setReady(true);
      setError("");
      if (!loaded.current) {
        loaded.current = true;
        const id = sessionStorage.getItem("hokiecare-review-id");
        if (id) {
          try {
            const restored = await api<Review>(`/api/booking/proposals/${id}`);
            setReview(restored);
            setSelection((s) => ({
              ...s,
              center_id: restored.slot.center_id,
              service_id: restored.slot.service_id,
              day: easternDate(restored.slot.starts),
              mode: "demo",
            }));
            setPanel("calendar");
          } catch {
            sessionStorage.removeItem("hokiecare-review-id");
          }
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [refresh]);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    if (!active) return;
    const changed = () => void refresh().catch((e) => setError(e.message));
    window.addEventListener("hokiecare-booking-changed", changed);
    if (ready && panel === "calendar") changed();
    return () =>
      window.removeEventListener("hokiecare-booking-changed", changed);
  }, [active, panel, ready, refresh]);
  const dismissReview = useCallback(() => {
    if (locked.current) return;
    revision.current++;
    setReview(null);
    setError("");
    sessionStorage.removeItem("hokiecare-review-id");
    sessionStorage.removeItem("hokiecare-pending-review");
  }, []);
  const changeSelection = useCallback(
    (next: Partial<Navigation>) => {
      if (locked.current) return;
      dismissReview();
      setSelection((s) => ({ ...s, ...next }));
    },
    [dismissReview],
  );
  const navigate = useCallback(
    (action: Navigation) => {
      if (locked.current) return;
      dismissReview();
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
    if (locked.current) return;
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
    }
  }
  async function confirm() {
    if (!review || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await api(`/api/booking/proposals/${review.id}/confirm`, "POST");
      setSaved(review);
      setReview(null);
      setRescheduling(null);
      setTab("agenda");
      sessionStorage.removeItem("hokiecare-review-id");
      sessionStorage.removeItem("hokiecare-pending-review");
      window.dispatchEvent(new Event("hokiecare-booking-changed"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function beginReschedule(a: Appointment) {
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
