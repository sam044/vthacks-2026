# Shared calendars and conversational demo booking

September 19, 2026. This is the implemented demo milestone from the next-session design. The user selected a new `hokiecare-booking` Lakebase project and explicitly deferred installing/testing the Schiffert companion until after the demo.

## Delivered behavior

- Monthly calendars, Eastern Today/day highlights, month navigation, arrow-key navigation and date/agenda alternative across ten scheduled services at the five centers. TalkNow remains an on-demand link, without reservations.
- Provider mode reports unknown/unconnected availability. Explicit demo mode exposes fictional schedules, anonymous free/busy starts and an owner-only agenda. Forty-five-minute appointments start on a fifteen-minute grid; overlapping candidates share capacity one. Different demo resources can run simultaneously.
- Versioned `backend/hokiecare/schedules.json` controls weekday hours, campus-only break/holiday exceptions, effective dates and the 180-day demo horizon. Up to twelve months can be inspected. No provider closure or capacity is inferred from these rules. No holds: capacity is checked atomically when a two-minute review is confirmed.
- Calendar and assistant use the same proposal/confirmation API. Reviews bind owner, exact slot, schedule version, expiry, operation and original slot for rescheduling. A failed move preserves the old reservation. Retry the same review after an unknown network result; confirmation returns its saved result. Chat “yes” alone cannot authorize a write.
- One real Databricks Qwen call extracts validated scheduling preferences. Deterministic tools resolve common relative dates, retrieve inventory and prepare/execute reviews. Only structured preferences persist, with optimistic conversation version checks; raw questions and model prose are not saved. Calendar controls remain usable if inference fails. The existing navigation API is retained for compatibility.
- Transactional outbox triggers emit minimal service/day invalidations for booking, cancellation, moves, session deletion and expiry cleanup. SSE replays durable cursors and refetches safe availability. Visible calendars also poll every five seconds; hidden calendars stop polling and disconnect streams. Private appointment objects are never broadcast.

## Storage and cutover

Dedicated project: `projects/hokiecare-booking`, production branch, primary endpoint, `databricks_postgres` database, project-owned `hokiecare` schema. Provisioned through the selected `sam` profile after the user's explicit creation choice. The existing Railway OAuth principal has schema/table/sequence permissions, without granting it schema administration. Public lakehouse views and their existing permissions are unchanged.

The workspace rejected changing auto-suspend with `Auto-suspend timeout cannot be modified for this workspace tier.` The endpoint reports min/max 1 CU and a 86400-second suspension timeout. Do not claim a five-minute scale-to-zero configuration; account limits/costs remain workspace-dependent.

The container sets HOME to `/home/hokiecare` after a hosted check exposed libpq probing an inaccessible `/root` client-certificate path under UID 10001. Python psycopg uses verified TLS certificates, a five-connection maximum pool, idle recycling, a fresh OAuth database token before forty minutes, connection checks and bounded connection/SQL/lock waits. The demo serializes writes with one project advisory transaction lock; PostgreSQL triggers additionally check resource and owner interval conflicts. This is intentionally a small-demo capacity design, not a high-throughput scheduler. SQLite retains equivalent interval triggers and versioned schema migration as an explicit fallback.

Operator sequence:

1. Run `scripts/setup_booking_lakebase.py` as the selected owner to initialize the project schema and hosted role, then verify actual hosted writes. Configuration is saved only in ignored `.secrets/lakebase-config.json`.
2. Deploy the new application with PG connection variables but leave `HOKIECARE_BOOKING_STORE` unset/SQLite.
3. On Railway run `python -m hokiecare.cutover`. It creates `/data/appointments.paused`, freezes old SQLite writes, snapshots the volume database, copies sessions/slots/appointments/proposals/preferences in one Postgres transaction and compares every copied row and interval invariants. No identities/records are printed. Failed migration leaves SQLite intact and paused for operator recovery.
4. Set `HOKIECARE_BOOKING_STORE=lakebase` and deploy. Old SQLite processes stay write-paused. Keep the volume backup and pause marker.
5. Verify the hosted two-session flow, actual model booking and existing public-data routes. Never switch back to an old SQLite snapshot after Lakebase has accepted writes; deliberate reverse migration is required for rollback. Rolling application code back while retaining compatible Lakebase storage is separate from database rollback.

## Verification

Local automated checks cover concurrency, distinct-resource capacity, owner overlap, idempotency, cross-owner access rejection, review expiry, atomic reschedule, v1 migration preserving IDs, deletion/outbox/restart persistence, break exceptions, DST gaps/folds, unknown real inventory, bounded ranges and structured conversation continuation. Companion parser checks remain unchanged.

`scripts/verify_calendar.py URL --ai` exercises two independent cookie sessions against actual storage, anonymous SSE replay, reservation conflict, retry, owner isolation, reschedule, cancellation, a real Databricks tool call with deterministic next-Tuesday resolution, and confirmation through the same backend. Its synthetic records are cleaned up. Local and hosted Lakebase/M2M execution passed; hosted cutover and deployment evidence are recorded in HANDOFF.

Browser checks exercise the month/day timetable, review, stored agenda, shared busy rows and assistant slot/review controls. Read HANDOFF for the final hosted check.

## Remaining real-provider work

No real provider booking, private confirmation sync, durable real-user login, or final submission adapter is claimed. Schiffert's existing direct portal link and optional read/select-only companion remain intact. The user chose “Not installed; finish demo first.” A provider-approved test account or a genuine user-authorized appointment plus installed companion and durable app authentication are still required for that next milestone. Cook, TimelyCare, Carilion and Hokie Wellness real adapters remain unconnected. Local demo cancellation/export never changes provider care.

## Schedule sources checked

- [VT Registrar academic calendar](https://www.registrar.vt.edu/dates-deadlines/academic-calendar.html): fall break October 9 (offices open), Thanksgiving November 21–29, finals through December 16, spring starts January 19, spring break March 6–14 (offices open). The December 17–January 18 demo pause is explicitly an assumption; winter classes do run during that interval.
- [Cook regular hours](https://ucc.vt.edu/about/hours_location.html): official search result reports Monday–Thursday 8–5 and Friday 9–5; direct web fetch returned 404 during refresh. This is a demo constraint based on published indexed hours, not a live capacity feed.
- [Schiffert current FAQ](https://healthcenter.vt.edu/faq.html): weekday hours and urgent-care-only Saturday hours. Demo medical scheduling uses weekdays; specialty-service demo schedules remain labeled assumptions.
- [VT TimelyCare](https://ucc.vt.edu/timelycare.html), [Carilion MyChart](https://www.carilionclinic.org/mychart), and [Hokie Wellness consultations](https://hokiewellness.vt.edu/students/our_services/consultations.html): official access routes, without claims of verified live capacity or completed booking APIs.
