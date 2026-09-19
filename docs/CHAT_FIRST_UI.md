# Chat-first care workspace

Implemented September 19, 2026. This is the frontend milestone requested in the chat-first design plan; mock-data creation is a separate next task.

## Experience

- Exactly two main sections: **Care Assistant** (default) and **Health Intelligence**.
- The opening screen places the existing heart/wordmark above **Less runaround. More care.** and a large composer. Placeholder: **What’s got you off your Hokie game?** Starter chips populate editable text; they do not submit.
- After the first message, the welcome area becomes a compact conversation header with New conversation and a sticky composer. Responses retain sourced access details. Up to three suggested time cards are displayed, with the complete calendar available alongside them.
- My calendar, scheduling responses, and Browse care options open a contextual panel. Desktop keeps chat beside it; below 960px it becomes a full-width sheet with Back to conversation, Escape dismissal, focus containment and focus return.
- Calendar and My appointments share center/service/date context, one review and refreshed appointment records. Booking success shows only after backend confirmation. The saved date can be opened/highlighted from the agenda. Cancel and atomic reschedule preserve existing backend semantics.
- Switching sections preserves messages, unsent text and selected calendar context in React memory. Closing panels stops calendar polling/streams; reopening refreshes results. Reloading still clears raw conversation text. Existing proposal retry metadata remains in sessionStorage; no health narratives are added to browser or database persistence.
- Health Intelligence retains the actual New River observations, filters, charts, accessible table, sources, suppression flags and editable text export. Its public-data hook now cancels the request timeout after completion; previously a successful view could turn into a timeout error 70 seconds later.

## Implementation and interfaces

The existing React/Vite, FastAPI, Railway and Databricks stack is retained. `CareWorkspace` owns the context panel and contains `CareAssistant` and `AppointmentPanel`. `BookingProvider`/`useBooking` share selection, catalog, agenda, review, reschedule and confirmed-save state. `api.ts` holds API/types, Eastern formatting and the existing proposal idempotency flow; UI components no longer import these utilities from each other.

The backend assistant's `care` and `appointments` navigation values remain unchanged and are mapped to the relevant panel. No public API, provider integration, Databricks object, scheduling rule, database schema or data import changed. New conversation clears agent preferences and the current review, not appointments. Sample-data badges and the explicit confirmation disclosure remain; removing redundant demo wording does not relabel fictional inventory as official availability. The optional Schiffert companion remains inside provider details, and direct portal access still requires no extension.

## Validation

- 45 existing Python tests passed; the TypeScript/Vite production build passed.
- `npm --prefix frontend test` runs three existing companion tests and four new UI regressions: successful public-data timeout cleanup, one shared review/duplicate confirmation protection, uncertain confirmation retry, and hidden-panel/section polling cleanup with selection preservation. CI runs the same command.
- Local browser checks covered desktop conversation/provider navigation, a real Databricks comparison, conversational next-Tuesday availability and earliest-slot review, manual reservation, calendar highlight, rescheduling, cancellation, unsent text preservation, and a single active review.
- Responsive checks at 1440px, 390px and 360px covered the landing composer, calendar sheet, keyboard focus loop and Escape return. At 360 × 640, the composer bottom was approximately 598px, inside the first viewport, with no horizontal overflow.
- The existing two-session calendar API verification passed against isolated local SQLite: interval conflicts, owner isolation, idempotency, SSE replay, atomic rescheduling and cancellation. UI test reservations were cancelled; no real provider appointment was made.
- Actual Databricks-backed local API verification passed: six directory services, 700 New River observations, 64 suppressed counts retained, both facility series, filters and invalid-input handling.
- The Health Intelligence draft was edited and its existing export button exercised. The in-app browser did not deliver a download event, so the saved text-file contents were not verified in this pass; the existing export implementation is unchanged.
- Hosted release verification follows CI/merge and is reported in the implementation task. This document's local results do not claim a production rollout before that check.

## Remaining work

Create/revise mock data only in the separately requested next milestone. Existing fictional scheduling inventory remains explicit and real provider final booking is still unconnected. App UI rollback can use the preceding deployment without a database migration. Keep the existing Lakebase runtime settings and source provenance intact.
