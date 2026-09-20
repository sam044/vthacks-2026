# Exact-time appointment waitlist

Implemented September 19–20, 2026 for the existing fictional appointment calendar.

## Student flow

Select a taken calendar time to **Join waitlist**. **My waitlist**, beside **My appointments**, shows only this browser's entries. Cancellation makes eligible entries available, and the Care Assistant displays a private offer banner. **Review appointment** prefills the required intake for that exact service/time. The existing Databricks service-fit check and explicit **Confirm appointment** remain required. Confirmation saves to the agenda and fulfills the entry atomically.

Offers do not hold capacity or assign clinical priority. All matching waiters may see the opening; the first successful confirmation wins. A losing waiter remains waiting. Leaving invalidates unconfirmed associated reviews. No provider booking, email, SMS, new authentication, or clinical eligibility verification is introduced. Existing provider links remain separate.

## Storage and interfaces

- `hokiecare.waitlist` in the existing `hokiecare-booking` Lakebase project stores owner, exact slot, created time, status, and result appointment. Statuses: waiting, available, fulfilled, left, expired. A partial unique index prevents duplicate active owner/slot entries. `proposals.waitlist_id` binds review to entry. SQLite schema version 6 mirrors the additive migration.
- `POST /api/booking/waitlist`: slot ID and request ID; joining an already active owner/slot returns the same entry. At most 50 historical entries per browser session. Joining extends the cookie/session through one day after the requested visit, without shortening existing retention.
- `GET /api/booking/waitlist`: private entries and anonymous outbox revision. `DELETE /api/booking/waitlist/{id}` leaves an active entry. `POST /api/booking/waitlist/{id}/review` accepts the same required intake body as the assistant, restricts it to the exact service/time, and returns the existing intake result contract.
- `GET /api/booking/events` now optionally omits `service_id` to receive anonymous global invalidations. Payload still contains only service/revision metadata. The private list supplies a starting cursor so new streams do not replay the full inventory history.
- Cancellation, confirmation/rescheduling, legacy reservation, and explicit session deletion reconcile offers within the booking transaction. Private list reads also reconcile under the existing advisory lock, recovering missed events, expiry, owner conflicts, and out-of-band capacity changes. Polling every five seconds and refresh-on-return recover disconnected streams. Updates pause while the Care Assistant or browser page is hidden.
- Slot validity, resource capacity, owner overlaps, and 30-minute buffers are rechecked at review and confirmation. A normal booking of the exact requested slot also fulfills its waitlist entry. Passed/retired slots expire. Session deletion cascades private entries; no waitlist identities, names, or narratives enter public availability/events.

## Migration and rollback

Use the established `sam` profile and WinGet CLI path. `python scripts/migrate_waitlist.py` inspects the exact existing endpoint/schema. `--apply` privately backs up affected tables, locks existing writers briefly, applies `lakebase_waitlist_migration.sql`, grants only hosted table DML, and compares existing records. It does not reseed or modify appointments. A hosted OAuth M2M TLS transaction proves actual waitlist read/write and rolls its probe back.

The applied migration preserved 258 sessions, 12,508 slots, 4,406 appointments, and 12 proposals. Backups are untracked under `.secrets`. The migration is repeatable. Deploy compatible application code after the migration; application rollback leaves the added table and nullable association intact. Do not reverse-migrate to an old SQLite snapshot.

## Validation

Automated coverage includes the two-session refill flow, two-waiter confirmation race, owner isolation, duplicate membership, leave/review invalidation, competing bookings, exact-service intake restrictions, no silent time substitution, expired reviews/retired inventory, owner conflicts, rescheduling, persistence, session cleanup, and missed-event recovery. Frontend tests exercise offer updates, exact-slot intake prefill, leaving, view lifecycle, and Home preserving membership.

`python scripts/verify_waitlist.py URL` runs actual hosted-role Lakebase transactions and two live Databricks intake calls, racing confirmations and checking private projections, anonymous event replay, retries and cleanup. It creates and deletes only its own synthetic sessions. Local execution against real Lakebase passed; cancellation plus two private reads took 1.5 seconds in that observation, not an SLA.

Browser checks at 1440px and 390px verified calendar joining, private available offers, readable review/leave controls, required exact-time intake, live model review, explicit confirmation and the saved agenda entry. Only the browser verification appointment was cancelled; earlier browser records were preserved. Local regression suite passed 77 tests, then the additional buffer/passed-time case passed with all eight waitlist tests. All 14 frontend checks and the production build passed. Release-specific final checks and commit/deployment evidence are in `HANDOFF.md`.
