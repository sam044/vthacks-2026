export type Navigation = {
  view: "care" | "appointments";
  category: string;
  center_id: string;
  mode?: "demo" | "provider";
  service_id?: string;
  day?: string;
};
export type Center = {
  id: string;
  name: string;
  kind: string;
  description: string;
  note: string;
  source_url: string;
  booking_url: string | null;
};
export type Service = {
  id: string;
  center_id: string;
  name: string;
  hours_note: string;
  source_url: string;
  duration_minutes: number;
  weekly: Record<string, string[][]>;
};
export type InventorySlot = {
  id: string;
  starts: string;
  ends: string;
  service_id: string;
  center_id: string;
  version: number;
  state: string;
};
export type Appointment = {
  id: string;
  slot_id: string;
  status: string;
  center_name: string;
  service_id: string;
  center_id: string;
  starts: string;
  ends: string;
};
export type Review = {
  id: string;
  slot: InventorySlot;
  service_name: string;
  expires_at: number;
  operation: string;
  notice: string;
  result_id: string | null;
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
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
    throw new ApiError(
      typeof data.detail === "string"
        ? data.detail
        : "Check your selection and try again.",
      response.status,
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
export const easternDate = (instant?: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant ? new Date(instant) : new Date());
export const easternTime = (instant: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(instant));
export const fullTime = (instant: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(instant));
export const serviceLabel = (name: string) => name.replace(/\s+demo$/i, "");

export async function prepareReview(
  slot: InventorySlot,
  appointmentId?: string,
) {
  const fingerprint = `${slot.id}|${slot.version}|${appointmentId || ""}`;
  let pending: { fingerprint: string; key: string } | null = null;
  try {
    pending = JSON.parse(
      sessionStorage.getItem("hokiecare-pending-review") || "null",
    );
  } catch {
    /* Discard malformed retry metadata. */
  }
  if (pending?.fingerprint !== fingerprint)
    pending = { fingerprint, key: crypto.randomUUID() };
  sessionStorage.setItem("hokiecare-pending-review", JSON.stringify(pending));
  let review = await api<Review>("/api/booking/proposals", "POST", {
    slot_id: slot.id,
    version: slot.version,
    request_id: pending!.key,
    appointment_id: appointmentId || null,
  });
  if (review.expires_at * 1000 < Date.now() && !review.result_id) {
    pending = { fingerprint, key: crypto.randomUUID() };
    sessionStorage.setItem("hokiecare-pending-review", JSON.stringify(pending));
    review = await api<Review>("/api/booking/proposals", "POST", {
      slot_id: slot.id,
      version: slot.version,
      request_id: pending.key,
      appointment_id: appointmentId || null,
    });
  }
  sessionStorage.setItem("hokiecare-review-id", review.id);
  return review;
}
