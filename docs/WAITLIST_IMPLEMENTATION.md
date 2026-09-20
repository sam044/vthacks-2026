# Exact-time appointment waitlist

Implemented September 19–20, 2026 for the existing fictional appointment calendar.

## Repeatable two-student demo

1. In a regular browser window, book Schiffert Medical clinic, September 22, 2026, 10:00–10:30 AM Eastern (in person, current VT student). If that time is already taken by another session, it is already ready for the waitlist demonstration.
2. Open HokieCare in a private/incognito window or a different browser. Another regular tab and a different entered name still share the original student session.
3. Submit the same center/date/time preferences. The result displays “this time is taken, would you like to join the waitlist?” with **Yes, join waitlist** and **No, edit request**.
4. No returns to the filled form without enrolling. Yes saves the displayed exact time and opens My waitlist. Reload, open My calendar → My waitlist, and verify the entry remains.
5. For another run, leave only the test waitlist entry, or close all private windows and open a fresh private session. Keep the original booking in place. **Delete my records** removes the booking and therefore removes the conflict.

Requesting a time overlapping your own appointment now displays “You already have an appointment at this time.” It does not create a duplicate waitlist membership or cancel your booking. Full intake-component tests cover this distinction, Yes, No, and mixed open/taken results.

## Student flow

When the intake finds suitable services but every matching time is taken, its result offers up to five exact times with **Join waitlist**. You can also select a taken calendar time to **Join waitlist**. Joining opens My waitlist and never automatically books. A conflicting appointment already owned by this browser instead produces an explicit explanation and a link to My appointments. **My waitlist**, beside **My appointments**, shows only this browser's entries. Cancellation makes eligible entries available, and the Care Assistant displays a private offer banner. **Review appointment** prefills the required intake for that exact service/time. The existing Databricks service-fit check and explicit **Confirm appointment** remain required. Confirmation saves to the agenda and fulfills the entry atomically.

Offers do not hold capacity or assign clinical priority. All matching waiters may see the opening; the first successful confirmation wins. A losing waiter remains waiting. Leaving invalidates unconfirmed associated reviews. No provider booking, email, SMS, new authentication, or clinical eligibility verification is introduced. Existing provider links remain separate.

## Storage and interfaces

- `hokiecare.waitlist` in the existing `hokiecare-booking` Lakebase project stores owner, exact slot, created time, status, and result appointment. Statuses: waiting, available, fulfilled, left, expired. A partial unique index prevents duplicate active owner/slot entries. `proposals.waitlist_id` binds review to entry. SQLite schema version 6 introduced the waitlist; version 7 removes optional buffers.
- `POST /api/booking/waitlist`: slot ID and request ID; joining an already active owner/slot returns the same entry. At most 50 historical entries per browser session. Joining extends the cookie/session through one day after the requested visit, without shortening existing retention.
- `GET /api/booking/waitlist`: private entries and anonymous outbox revision. `DELETE /api/booking/waitlist/{id}` leaves an active entry. `POST /api/booking/waitlist/{id}/review` accepts the same required intake body as the assistant, restricts it to the exact service/time, and returns the existing intake result contract.
- `GET /api/booking/events` now optionally omits `service_id` to receive anonymous global invalidations. Payload still contains only service/revision metadata. The private list supplies a starting cursor so new streams do not replay the full inventory history.
- Cancellation, confirmation/rescheduling, legacy reservation, and explicit session deletion reconcile offers within the booking transaction. Private list reads also reconcile under the existing advisory lock, recovering missed events, expiry, owner conflicts, and out-of-band capacity changes. Polling every five seconds and refresh-on-return recover disconnected streams. Updates pause while the Care Assistant or browser page is hidden.
- Slot validity, resource capacity, owner overlaps during the actual visit are rechecked at review and confirmation. A normal booking of the exact requested slot also fulfills its waitlist entry. Passed/retired slots expire. Session deletion cascades private entries; no waitlist identities, names, or narratives enter public availability/events.

## Migration and rollback

Use the established `sam` profile and WinGet CLI path. `python scripts/migrate_waitlist.py` inspects the exact existing endpoint/schema. `--apply` privately backs up affected tables, locks existing writers briefly, applies `lakebase_waitlist_migration.sql`, grants only hosted table DML, and compares existing records. It does not reseed or modify appointments. A hosted OAuth M2M TLS transaction proves actual waitlist read/write and rolls its probe back.

The applied migration preserved 258 sessions, 12,508 slots, 4,406 appointments, and 12 proposals. Backups are untracked under `.secrets`. The migration is repeatable. Deploy compatible application code after the migration; application rollback leaves the added table and nullable association intact. Do not reverse-migrate to an old SQLite snapshot.

## Validation

Automated coverage includes the two-session refill flow, two-waiter confirmation race, owner isolation, duplicate membership, leave/review invalidation, competing bookings, exact-service intake restrictions, no silent time substitution, expired reviews/retired inventory, owner conflicts, rescheduling, persistence, session cleanup, and missed-event recovery. Frontend tests exercise offer updates, exact-slot intake prefill, leaving, view lifecycle, and Home preserving membership.

`python scripts/verify_waitlist.py URL` runs actual hosted-role Lakebase transactions and live Databricks intake calls, racing confirmations and checking private projections, anonymous event replay, retries and cleanup. It creates and deletes only its own synthetic sessions. Local execution against real Lakebase passed; cancellation plus two private reads took 1.5 seconds in that observation, not an SLA.

Browser checks at 1440px and 390px verified calendar joining, private available offers, readable review/leave controls, required exact-time intake, live model review, explicit confirmation and the saved agenda entry. Only the browser verification appointment was cancelled; earlier browser records were preserved. Final Linux CI passed all 78 backend tests, 14 frontend checks, production build and container checks. Hosted waitlist/model/race verification and existing calendar/public-data checks passed on release `ba1fe4e`; hosted cancellation plus two private reads measured 3.906 seconds. Public browser join/leave checks preserved its existing appointments. Full commit/deployment evidence is in `HANDOFF.md`.


## September 20 intake discoverability and buffer correction

A user requesting a taken time through intake previously received only Edit answers. The result now exposes anonymous matching taken slots and an explicit Join waitlist action. Options respect service fit, dates, weekdays, exact visit bounds, and owner conflicts; no enrollment occurs until clicked. Same-browser tabs share an owner, so a duplicate own visit now explains that conflict. No waitlist is suggested for unsupported services, expired times, or urgent-support responses.

The user authorized removal of the extra buffer: both validation layers accept a 30-minute window, prefill uses the visit end, and availability/matching/join/review/confirmation/database triggers use half-open visit intervals. Same-resource and same-owner overlaps still fail atomically. Hourly inventory starts, IDs, visit times, and existing appointments remain unchanged.

`python scripts/migrate_visit_intervals.py --apply` uses the approved sam profile, privately backs up the tables, normalizes only blocked_until to ends, and replaces the Postgres interval trigger function under the existing lock. Its applied check preserved 258 sessions, 12,508 slot IDs/times, 4,408 appointments, 14 proposals and 2 waitlist entries. No inventory reseeding. SQLite migration 7 implements equivalent interval checks. An older application rollback must account for its one-hour form validation; retain this corrected application or restore that policy deliberately.

Validation before release: 80 backend tests, 15 frontend tests and production build passed. The real-Lakebase/model probe now begins with the taken-time intake suggestion and uses a 30-minute window; it passed through cancellation, two private offers, race, retry and cleanup (1.859 seconds for cancellation plus two private reads, one observation). Browser submission for September 22 09:00–09:30 showed Join waitlist, and clicking opened the private list. Mobile 390px controls were readable. Hosted release evidence follows in HANDOFF.md.

Hosted correction verified at main `915e779`: intake suggestion → join → cancellation offer → live-model review → confirmation and retry all passed; two waiters produced one successful confirmation. Cancellation plus two private reads measured 3.735 seconds. Public browser verified the previously missing Join waitlist action for a 30-minute request. See HANDOFF.md for commit, deployment, and cleanup evidence.
