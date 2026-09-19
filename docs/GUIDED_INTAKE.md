# Guided intake and academic calendar

Implemented September 19, 2026. This replaces the chat-first landing interaction with a required appointment-request form. Health Intelligence and the sourced directory remain available.

## User flow

Complete the required name/alias, support category, brief request, center preference, modality, date range, weekdays, time window, student status, applicable counseling status, and sample acknowledgment. The submit button stays disabled until valid; the backend independently validates the same fields. A 60-minute window is required for the 30-minute visit and 30-minute buffer.

The Databricks Qwen endpoint selects suitable allowlisted services from sourced context. The backend enforces explicit preferences and Cook/TimelyCare concurrency restrictions, selects the earliest stored available slot, and creates one owner-bound two-minute review. Confirmation is a separate explicit user action and transaction. No-match and model/network failures preserve answers for editing or retry; there is no follow-up chat interview. Uncertain confirmation retries use the same review, and replacement proposals require fresh confirmation.

A live-model regression exposed an overbroad general-wellness match. Backend topic restrictions now prevent unrelated BASICS, recovery, or financial consultations from being proposed; the model must still verify fit. Service scope follows [the published consultations](https://hokiewellness.vt.edu/students/our_services/consultations.html).

The booking name is excluded from model context. The brief request is sent for inference, but is not persisted in our database, browser storage, or application logs. Idempotency uses a keyed input digest, not retained request text. This does not assert a Databricks inference-log retention policy.

## Databricks and data

- Existing target: `projects/hokiecare-booking/branches/production/endpoints/primary`, database `databricks_postgres`, schema `hokiecare`, developer profile `sam`. No new paid resource was provisioned.
- `calendar_dates`: 262 dates, August 24, 2026 through May 12, 2027, including term, year/month/day/weekday, and exclusion reason.
- `slots`: 12,488 active version-3 slots across ten scheduled services / five centers, with canonical UTC timestamps, Eastern date, visit end, buffer end, and active status. Existing legacy slot rows are preserved separately.
- Exclusions: weekends, Labor Day September 7, fall break October 9, Thanksgiving November 21–29, winter December 17–January 18, and spring break March 6–14. Weekday reading/exam days are included. No summer or winter-session slots.
- Starts are hourly; visits last 30 minutes and block the owner/resource for a full hour. Cards and ICS exports show visit duration. Database triggers enforce conflicts, including buffers and legacy reservations.
- Published general Cook/Schiffert weekday windows are retained; other service windows remain explicitly assumed 9–5 weekday sample schedules. Academic exclusions apply to every sample service and do not claim official clinic closures. [VT calendar](https://www.registrar.vt.edu/dates-deadlines/academic-calendar.html), [Schiffert hours](https://healthcenter.vt.edu/faq.html), [TimelyCare constraints](https://ucc.vt.edu/timelycare.html).
- `appointments`: user-created and seeded records share the store and conflict controls. Record origin, private booking name, retention deadline and seed batch distinguish them. Neither origin means a provider-confirmed appointment.
- `seed_batches`: reproducible seed `20260919`, batch `academic-2026-27-v3`, generation version, source/rule snapshot and counts. Faker generates fictional names for 250 synthetic owners; weighted occupancy favors early weekdays and midday. Two slots per service/day are left open when existing user reservations permit. This is illustrative occupancy, never a measured demand metric.

Production migration committed 262 date rows, 12,488 active slots, and **4,394 seeded reservations**. At migration time there were 20 legacy slot rows and six existing appointments; every existing appointment ID, slot, and status was preserved. Total immediately after migration: 12,508 slot rows and 4,400 appointment rows. A private pre-migration backup is in ignored `.secrets/`; names and credentials were not printed. The hosted service principal independently read the new inventory over verified TLS. The same batch was replayed without adding records.

## API, ownership, and retention

`POST /api/assistant/intake` accepts the typed form plus request ID. Returns `proposal`, `no_match`, or `urgent_support`, an explanation and sources, and a review only when suitable inventory exists. Names are owner-only; public availability and SSE contain no visitor identities.

Existing `/api/booking/proposals/{id}/confirm`, cancellation, rescheduling, availability, events, catalog, and agenda interfaces remain. `DELETE /api/booking/proposals/{id}` invalidates an unconfirmed review. Manual frontend calendar selection prefills the required intake; existing appointments retain their direct rescheduling workflow. The legacy conversational and booking APIs remain compatible.

Visitor records are retained until 30 days after their appointment. Confirmation extends the secure HTTP-only ownership cookie; same-browser access can survive restarts. Clearing cookies loses management access because this release adds no login or cross-device recovery. Unused visitor sessions and structured legacy AI tasks remain short-lived; seeded owners are separately classified and cannot authenticate as browser visitors. Expired records are removed by the existing request-driven cleanup path, not a new background service.

## Operations and verification

The additive Postgres migration is `backend/hokiecare/lakebase_intake_migration.sql`. SQLite test/local initialization applies matching changes and materializes inventory without seeded occupancy. Confirmed legacy times remain unchanged; old pending reviews expire and old unreserved slots are retired. Rolling back application code does not require deleting new data.

Read-only inspection: `.venv/Scripts/python.exe scripts/seed_calendar.py`. Apply/replay: append `--apply`. On Windows include the documented WinGet Links directory in PATH for SDK CLI OAuth. The script uses the explicitly selected `sam` profile, backs up existing records, performs transactional migration/materialization/seeding, checks exclusions, duration, referential preservation and overlaps, then verifies the hosted identity. Never delete/reseed visitor records or change the batch ID just to rerun it.

Validation completed before release: 68 backend tests; nine frontend/companion checks; TypeScript/Vite production build. Actual Databricks inference and Lakebase checks passed required-field rejection, automatic proposal, explicit confirmation, same-key retry, private names, retention, same-browser restoration, shared busy-state updates and cancellation. Separate two-session checks passed simultaneous conflict, owner isolation, durable SSE replay, atomic reschedule and cancellation. Test sessions were deleted using their own ownership cookies.

Browser checks verified a real AI proposal, confirmation, immediate agenda update, cancellation, required form completion, native date/time entry, retained answers across section changes, and the real Health Intelligence chart/source/draft. Release SHA and successful hosted validation are recorded in `HANDOFF.md`. This pass visually checked the narrow 550–566px layout and mobile calendar sheet; exact 390px and 1440px viewport reruns and downloaded export-file contents were not verified in this pass.

Remaining boundary: provider connections, authenticated real patient identity, cross-device recovery, and actual clinic booking are not implemented. Sample data is now populated; it must remain distinguishable from official availability and regional public-health observations. The original project Requirements block is unchanged.
