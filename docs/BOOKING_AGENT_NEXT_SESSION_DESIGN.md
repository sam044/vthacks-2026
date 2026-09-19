# HokieCare: shared calendars and an appointment-booking agent

Prepared September 19, 2026. This document specifies the next implementation; it does not claim these features already exist. The companion prompt is [NEXT_SESSION_PROMPT.md](NEXT_SESSION_PROMPT.md).

## 1. User objective and scope

Make HokieCare useful for completing scheduling, not merely finding links. Every scheduled service should have a monthly calendar, a selected-day timetable, and a clear account of which times are available or booked. Booking through the calendar or conversational assistant must use the same backend, save a durable record in Databricks, and update other viewers promptly. The assistant should clarify a student's service and scheduling preferences, obtain actual available times, propose a time, execute an authorized booking, and update the student's calendar.

Minimize student effort. They handle their own provider login and Duo, plus any required clinical screening or consent that only they can honestly complete. One review of the actual center/service/time authorizes a real booking. Ordinary navigation and repeated technical steps should be automated. Never invent medical answers to achieve a login-only experience.

The user accepts approximate college-break rules for the demonstration. Apply these as explicitly labeled demo scheduling policies, not claims that actual clinics close for every academic break. Public calendars show anonymous availability or busy periods, not other students' identities, reasons for visits, or appointment details.

This is the current scheduling direction and supersedes older planning-only/no-agent/no-Databricks-booking-storage scope. Preserve the Requirements block in PROJECT_PLAN.md. Keep the working health-intelligence and HCP briefing features; do not redesign them in this milestone. Deloitte × Databricks and Impiricus remain the selected sponsor targets. This plan does not guarantee prize eligibility or awards.

## 2. Starting point: verified application, not a blank project

Repository: `C:\Users\sam\OneDrive\Documents\ChatGPT\VTHacks`; GitHub: `https://github.com/sam044/vthacks-2026`; live app: `https://vthacks-2026-production.up.railway.app`.

Last implementation baseline: `f4019608079171b2e0e86349a16cf8b857a5336a` on main. Inspect current Git state before changing it; this document's commit will be later. Use Windows/PowerShell, `.venv\Scripts\python.exe`, and the existing React/TypeScript/Vite frontend with FastAPI on Railway.

Existing features and limits:

| Component | Implemented today | Missing for this request |
|---|---|---|
| Appointments | Five-center selection; Cook-only fictional times; reserve/cancel; private session agenda; ICS export | Monthly calendar, shared busy states, multiple scheduled services, push updates |
| Persistence | SQLite on Railway `/data/appointments.sqlite3`; anonymous 24-hour sessions; atomic reservation and idempotency | Databricks transactional booking storage; durable real-user ownership |
| Chat | Databricks model chooses one validated `navigate_care` action; backend retrieves sourced directory facts | Conversation state, availability tools, preparation/confirmation, booking execution, reconciliation |
| Model | `databricks-qwen3-next-80b-a3b-instruct` | Evaluate its performance on the new tools before changing models |
| Schiffert | User login/Duo/screening followed by real availability was observed; extension code reads/selects displayed slots | Installed-extension end-to-end verification; final submission and confirmation contract |
| Direct portal access | Open VT portal is a normal link that works without an extension | Keep this fallback working throughout |
| Companion | Optional Chrome/Edge MV3 preview; paired window; browser-local slot details | Chat-controlled protocol, resumable tasks, verified confirmation import |
| Other providers | Official handoff links; Cook demo only | Separate adapters/authorized connections for each actual scheduled service |
| Databricks data | Public service directory and regional VDH trend views in `workspace.hokiecare` | Booking records are not currently in Databricks |

The prior 23 tests were 20 Python checks plus 3 companion parser checks. CI also built and ran the Linux image. Hosted demo reservations survived a deployment. These checks do not establish successful real provider booking.

Read AGENTS.md, IMPLEMENTATION_PLAN.md, DATABRICKS_SETUP.md, HANDOFF.md, BOOKING_IMPLEMENTATION.md, and SCHIFFERT_FEASIBILITY.md. Important files:

- `frontend/src/appointments.tsx`: appointment UI, companion messaging, assistant UI; split into smaller components as needed.
- `frontend/src/main.tsx`: navigation, directory, health intelligence, existing HCP template.
- `backend/hokiecare/booking.py`: SQLite schema, sessions, synthetic slots and atomic reservations.
- `backend/hokiecare/assistant.py`: one-turn tool routing; replace incrementally with an orchestrator.
- `companion/{manifest.json,bridge.js,background.js,portal.js}`: narrow browser integration; no login-domain access.
- `scripts/package_companion.py`: regenerates the downloadable ZIP; run after companion changes.
- `tests/test_booking.py`, `frontend/companion.test.mjs`, `scripts/verify_booking.py`: existing verification starting points.

## 3. Three different kinds of truth

Every slot and booking needs a declared source. Preserve that source through tools, UI, storage and exports.

1. **HokieCare demo inventory:** we own its capacity and can reserve it atomically. Show shared anonymous busy/free states. Synthetic bookings do not contact providers.
2. **Provider availability:** fresh, authorized results from a provider API or the signed-in user's portal. These may depend on visit type, clinician and eligibility. Do not treat one user's results as a universal campus calendar.
3. **My confirmed provider appointments:** a private copy of bookings confirmed by the provider. This is not the provider's complete schedule, and removing the copy does not cancel the appointment.

Absence of an appointment in our database is never proof of availability at a real clinic. A provider slot disappearing may mean it was booked, withheld, expired, or filtered; mark it unavailable/unknown, not "another student booked it." Our demo can show exactly which demo slots are booked. Real busy periods require a provider-authorized availability/capacity feed; do not scrape other patients' schedules.

## 4. Provider/service capabilities

Represent each center as multiple service types when needed. Scheduling is keyed by center + service + resource, not just center name.

| Center/service | Calendar behavior | Initial execution path |
|---|---|---|
| Schiffert scheduled medical services | Monthly calendar; private portal results for chosen department/visit type; unknown dates remain unknown | Existing companion first; final submission gated on verification |
| Cook scheduled counseling | Full shared demo calendar and complete conversational booking | Internal demo adapter; real Cook still uses phone until an authorized integration exists |
| TimelyCare scheduled counseling/coaching, where offered to VT | Separate scheduled-service calendar; user/provider-specific slots | Capability investigation; explicit demo adapter permitted for demonstration, clearly separated from official availability |
| TimelyCare TalkNow | On-demand card; no reservable calendar or made-up time slots | Official on-demand access; do not block it for campus breaks |
| Carilion | Select a practice, location and visit type before querying availability | Investigate MyChart scheduling versus appointment requests; request sent is not confirmed |
| Hokie Wellness | Separate consultations such as financial coaching, BASICS, recovery meetings | Inspect each service's actual workflow; an interest form is not a reserved time |

Give each scheduled service a calendar shell even when unconnected. Its state then reads "Connect to load availability" or "Availability not connected," with a separately labeled demo option. Never populate a real-looking green calendar from office hours alone.

Source checks: [Cook scheduling](https://ucc.vt.edu/appointment.html), [VT TimelyCare](https://ucc.vt.edu/timelycare.html), [Carilion MyChart](https://www.carilionclinic.org/mychart), [Hokie Wellness consultations](https://hokiewellness.vt.edu/students/our_services/consultations.html). TimelyCare's on-demand support is distinct from its scheduled human counseling; retain the published Cook/TimelyCare concurrent-individual-therapy constraint when applicable.

## 5. Calendar UI and scheduling rules

Build `CenterCalendar`, `DayAvailability`, `MyAppointments`, `BookingReview`, and `ConnectionStatus` components. Reuse the current visual style.

- Month/year header, previous/next month, Today, and a visible current-date highlight. Provide keyboard navigation and an accessible agenda alternative. Clicking a date opens its timetable.
- Show the selected service's opening/closing hours, slot duration, location/resource where relevant, source and refresh time. Use text/icons as well as colors.
- States: available, held, busy, your appointment, closed, outside booking window, not connected, unknown, stale, loading, and error. Future months with no released availability are not "fully booked."
- Month cells may show counts of available slots only when the inventory covers that date sufficiently. Partial provider searches must be labeled partial.
- Shared demo rows disclose start/end and busy/free state only. Never return another owner's ID, booking ID, name, email, clinician notes, reason or confirmation reference in public availability responses. My appointments is a separate owner-authorized response.
- Store instants in UTC and display `America/New_York`; store schedule rules in local wall-clock time. Resolve DST explicitly. Define date ranges with an exclusive end in the API. Avoid browser-timezone-dependent date parsing.
- Demo defaults: configurable 45-minute sessions on a 15-minute start grid, per-resource capacity one, within verified/configured hours. Overlapping start candidates share the same resource and must conflict. Multiple clinicians may legitimately offer the same clock time.
- Display up to 12 months; use a configurable demo booking horizon of 180 days and the provider's actual horizon for connected services. Query bounded month/day ranges; never fetch a whole patient portal or unbounded history.
- Include cancellation and rescheduling. For internal inventory, move the reservation atomically so a failed move preserves the old booking. For providers, obey their supported workflow and surface partial outcomes.

### Hours and breaks

Create a versioned JSON schedule configuration with center/service IDs, timezone, weekly intervals, effective dates, duration, buffer, booking horizon, source URL, checked date, and exception rules. Validate the configuration at startup and expose only needed display fields. An explicit admin edit or reviewed file change supplies exceptions; the LLM cannot change opening hours.

Use the correct VT academic year, not a generic Google Calendar result or another university's calendar. On September 19 the [VT Registrar calendar](https://www.registrar.vt.edu/dates-deadlines/academic-calendar.html) listed Thanksgiving break November 21–29, 2026; fall finals ending December 16; spring classes starting January 19, 2027; and spring break March 6–14, 2027. It explicitly says university offices are open during spring break. Academic dates must not be mislabeled clinic closures.

To meet the requested simplified demo, block Thanksgiving and spring-break ranges for campus demo services. A configurable December 17, 2026–January 18, 2027 winter demo blackout is an assumption inferred between semesters, not an official closure. Label these "Campus break — demo schedule paused." Include campus holidays from current official calendars and service overrides. Keep virtual on-demand services available and do not apply VT breaks automatically to Carilion or TimelyCare scheduled services.

[Cook's published regular hours](https://ucc.vt.edu/about/hours_location.html) are Monday–Thursday 8–5 and Friday 9–5; refresh before implementation. Published hours constrain synthetic scheduling but do not establish real appointment capacity. Schiffert's old `/about/Hours_Location.html` link returned 404 during this research: locate its current hours page rather than reusing an old PDF. For unknown demo hours, a visible configurable weekday 9–5 assumption is acceptable; for real inventory, show unknown until verified. Do not hardcode this assumption as provider fact.

## 6. Databricks persistence: preferred design and decision gate

The user now explicitly wants appointment records in Databricks. Prefer **Databricks Lakebase Postgres** for operational booking transactions, while keeping public analytics in the existing lakehouse. Databricks documents Lakebase as a managed Postgres database for transactional applications, including applications hosted outside Databricks. [Official Lakebase overview](https://docs.databricks.com/aws/en/oltp/projects)

This is an architectural recommendation, not proof that Lakebase is available in the user's workspace. This document provisions nothing. At implementation time:

1. Read `databricks-core`, `databricks-lakebase` and its connectivity/off-platform references. Use selected profile `sam`; don't ask for the same profile again. Discover current CLI syntax rather than guessing.
2. Verify availability, region/edition, project ownership, connection permissions and hosted-principal access. Resolve any existing-project versus new-project selection required by the skill. Do not attach to an unrelated database. Proposed new name: `hokiecare-booking`, only after that decision.
3. Use the existing FastAPI app on Railway with a supported Python Postgres driver, TLS, bounded pool, expiring OAuth credential refresh and reconnect handling. No frontend database credentials and no hosting-platform migration.
4. Prove a tiny synthetic create/read/transaction-conflict/delete cycle locally AND using the hosted app identity. A READY resource does not pass this gate. Record redacted evidence and latency.
5. Add migrations and migrate existing demo records with IDs/UTC timestamps intact. Back up SQLite first; compare row counts and reservation invariants. Keep a rollback path and stop writes briefly during cutover rather than maintaining two independent authorities.

Do not implement primary booking by querying a Delta table for free space and then inserting if none was found. That pattern alone does not establish an exclusive resource reservation. PostgreSQL transactions and enforced interval/capacity constraints are the preferred mechanism.

If Lakebase is unavailable, continue independent calendar/agent work against a repository interface backed by the existing SQLite demo store. Implement an atomic outbox and idempotent mirror of **synthetic** booking events to a project-owned Delta table as a documented interim path if authorized. Show replication status. This would mean operational SQLite plus Databricks copies, not a Databricks-native reservation authority; explicitly explain the unmet part of the requirement. Do not silently add another vendor or pretend the fallback is equivalent.

Optional downstream analytics: mirror synthetic/aggregate operational events to Unity Catalog using verified supported CDC or a worker. Check actual sync direction and feature availability; do not confuse lakehouse-to-Postgres synced tables with Postgres-to-lakehouse CDC. Never delay booking confirmation until an analytics mirror finishes. Do not join student bookings to regional VDH statistics to infer individual health risk.

## 7. Data contracts and transactional behavior

Suggested tables (names are proposed, not existing resources):

| Entity | Minimum fields / responsibility |
|---|---|
| centers / services / resources | IDs, timezone, duration, capacity, supported actions, connection mode, source/version |
| schedule_rules / schedule_exceptions | Local date/weekday intervals, effective range, reason, scope, official-versus-demo provenance |
| slots | Internal ID, resource/service, UTC start/end, inventory source, version, availability expiry; provider references private/scoped |
| bookings | ID, owner subject, resource/service/slot, UTC interval, demo/provider origin, state, idempotency key, version, timestamps |
| booking_attempts | Operation ID, owner, intended slot/version, authorization time, submission state, result; unique stable provider attempt key |
| provider_confirmations | Private booking link, provider booking reference, normalized confirmed interval, observed time, verification method |
| outbox_events | Event ID, aggregate ID/version, kind, minimal payload, delivery status; written with the booking transaction |
| agent_sessions / tasks | Owner, structured service/time preferences, task state, pending action, short expiry; no raw medical narrative |

Use demo states `available → held → demo_confirmed → cancelled`; expired holds return capacity. If a first milestone omits holds, reserve atomically at confirmation and handle conflicts cleanly. Set and document a short hold TTL, for example two minutes, only for inventory we control. Selecting a real portal radio button does not create a provider hold.

Real attempt states: `needs_auth → needs_user_screening → availability_ready → awaiting_confirmation → submitting → provider_confirmed`, with explicit `failed`, `unknown_outcome`, and `confirmed_sync_pending`. A request-only workflow ends in `provider_request_pending` until actual confirmation. A local copy supplied by the user is `user_reported`, never automatically `provider_confirmed`.

Enforce resource interval conflicts at the database level, not just an exact slot-ID unique index. In Postgres, use an appropriate range exclusion constraint for capacity-one resources (verify supported extensions), or transactionally lock the resource and validate all overlapping intervals. Capacity-N requires a correct capacity counter/locking strategy. Check owner overlaps separately. All writes validate current versions, hours, closure rules, future time and booking horizon.

Use one stable idempotency key for each logical operation, with a stored result. Double-clicks, tool retries and network retries must not create multiple appointments. Don't hold a database transaction open while waiting for a browser or external provider.

Suggested REST surface (adapt existing routes compatibly): `GET /api/booking/availability?service_id=...&from=...&to=...`, `POST /api/booking/proposals`, `POST /api/booking/proposals/{id}/confirm`, `GET /api/booking/appointments`, `POST /api/booking/appointments/{id}/cancel`, `POST /api/booking/appointments/{id}/reschedule`, and `GET /api/booking/events`. Availability returns timezone, source, coverage, fetched/expiry times, revision, and safe slot projections. Proposal requests carry slot ID/version and an idempotency key; the server derives owner and authoritative slot details. Confirmation requests reference an expiring proposal/authorization, not arbitrary client-supplied status or timestamps.

## 8. Cross-user updates

Implement a scoped event stream, preferably Server-Sent Events, from FastAPI to the frontend. Authenticate private streams through the app's normal secure session. Public/demo resource streams carry only changed resource/date IDs and versions; clients refetch an authorized availability projection. Do not broadcast booking objects.

Write the booking and outbox event in one transaction. Publish only after commit. Handle reconnect, Last-Event-ID or a cursor, duplicate events, missed events and a full refetch. For the current single-replica deployment a bounded in-process fanout can distribute outbox events, but persist the cursor/events so restarts recover. Before multiple replicas, use a shared distribution mechanism or database-backed polling; process memory alone is insufficient.

Target: another active browser sees a committed demo reservation within two seconds in normal conditions. This is an acceptance target to measure, not an existing guarantee. Add a five-second polling fallback with a visible reconnecting/stale indicator. User-specific provider availability is refreshed privately after a confirmed action and periodically only while the relevant screen is active; the provider remains authoritative.

## 9. A booking agent rather than a navigation router

Keep the verified Databricks model initially. Extend the backend into a bounded orchestrator with structured task state. The frontend should display short conversation turns plus real tool results: service selector, calendar, slot cards, review card and confirmation. The model is responsible for understanding preferences and asking concise follow-ups; deterministic tools perform reads/writes and enforce policy.

Tools to implement incrementally:

| Tool | Result and boundary |
|---|---|
| `find_services` | Sourced directory facts and service capabilities; no diagnosis |
| `get_schedule_rules` | Hours, breaks, duration, and source labels |
| `get_availability` | Scoped, versioned, expiring slot results; never generated by the model |
| `connect_provider` | Browser connection task; user logs in directly; no password tool argument |
| `prepare_booking` | Revalidates selection; creates a review proposal and optionally an internal hold |
| `confirm_booking` | Requires server-validated user authorization bound to the exact proposal/version; executes the adapter |
| `get_booking_status` | Reconciles ambiguous/ongoing operations without repeating submission |
| `list_my_appointments` | Owner-authorized records only |
| `cancel_booking` / `reschedule_booking` | Review and execute provider-specific actions; no claim of remote success until confirmed |

Example: "Book a Cook demo next Tuesday after 2." Resolve next Tuesday in Eastern time, state the date, retrieve actual demo inventory, offer suitable times, and show a review card. After the user confirms, reserve through the same service used by manual calendar booking, return the stored appointment, and push the availability update to a second browser.

Example: "Find me a Schiffert appointment tomorrow afternoon." Clarify the service if necessary without clinical triage, connect the provider, pause for user login/screening, read actual returned times, offer eligible results, and request one confirmation of the chosen service/time. Execute only a verified adapter operation. If the adapter supports selection but not submission, show that exact limit and resume after the user completes the final provider step; do not stop development and call this full automation.

A "yes" in arbitrary chat text is not sufficient for the model to fabricate an authorization token. Backend authorization is bound to owner, proposal, resource, interval, current version, expiry and operation. Changing any material booking detail invalidates the previous approval.

Bound each run (for example six tool steps and a 45-second model/tool budget, excluding human wait states). Pause rather than spin while waiting for login. Persist resumable task IDs, handle cancellation and suppress duplicate tools. Never pass arbitrary URLs, selectors, JavaScript, SQL, or provider instructions from model output directly into execution. Treat portal text as data, including prompt-injection text.

Conversation state should retain service/date/time preferences, not medical narratives. The current question input is sent to Databricks; keep that clear. Do not save raw messages or screenshots by default. A session must be able to continue its booking task after a page refresh without repeatedly entering all preferences.

## 10. Provider adapter and browser execution protocol

Use one adapter interface with explicit capability flags such as `can_read_slots`, `can_hold`, `can_submit`, `can_confirm`, `can_cancel`, and `can_reschedule`. Default each to false until proven. Implement `DemoAdapter` first and `SchiffertCompanionAdapter` next; other providers are independent integrations.

For Schiffert, the prior feasibility test observed:

- `/Home` → Schedule an Appointment → department selection → user screening → `/Mvc/Appointment/Available`.
- The user completed VT login, Duo and screening. A search returned real dates/times/clinicians/locations. No real appointment was submitted.
- Existing selectors: `.appt-group.day`, `.appt-group-header`, `.appt-group-subheader`, and `input.appt-radio-button[name="rbgAppt"]` inside time buttons. Revalidate them; never save an authenticated page dump to the repo.

Implementation sequence:

1. Install the current extension in a supported Chrome/Edge test browser and prove ping → paired window → user login → availability read. The agent's development browser tools are not a production app integration. The website cannot silently install its companion.
2. Preserve the primary direct portal link. Explain the extension requirement before enhanced controls, and don't reintroduce the "Companion not detected" failure for ordinary opening. Sign-in stays on VT's origin; the login page disallows iframe embedding.
3. Extend the narrow app/extension messages with request ID, task ID, sequence/version, permitted operation, expected page state and expiry. Verify origin, sender/frame and paired tab. Server-bound callbacks also require the user's authenticated session, an unguessable task binding and replay protection. A page message alone cannot mark a booking confirmed.
4. Detect authentication/screening only enough to report a waiting state. Never read login fields, cookies, storage, hidden clinical form payloads, or unrelated account pages. Let users complete clinical attestations themselves.
5. Parse only visible availability fields needed to select a slot. DOM parsing is the first choice. Unknown layouts return a recoverable error; no blind clicks. Re-fetch and compare exact slot fields immediately before an action.
6. Investigate the final review/submit/confirmation sequence using a provider-sanctioned test account, or a genuine appointment the user explicitly wants and specifically authorizes. Never make a fake real booking merely to test the app. Do not assume a Continue button is harmless.
7. Once submission semantics are verified, enable `can_submit`. Submit once, then extract the minimum confirmation evidence: provider reference where supplied, service/location, date/time/timezone and confirmed status. Selection, a vanished slot, a success-colored banner without matching details, or a URL change alone is insufficient.
8. Save the private confirmed record and emit an owner-only calendar refresh. If the provider succeeded but our write failed, record/recover `confirmed_sync_pending`; reconcile the same attempt without rebooking. If outcome is unknown after a timeout, check status or hand back a review task before retrying anything.
9. Verify actual cancellation/rescheduling separately. A local deletion never cancels provider care. Preserve remote booking details during cancellation failures.

A user-controlled browser can support a useful companion without an official API, but it is brittle and requires installation and a live authenticated browser. A provider-approved scheduling API is preferable if available. Discover actual vendor documentation, registration, scopes and scheduling operations; generic FHIR/SMART support does not prove writable appointment access. Do not reverse-engineer private authenticated network calls or copy session credentials as a shortcut.

For the concrete runtime bridge, create owner-bound browser tasks through `POST /api/agent/tasks`, deliver allowed commands over an authenticated private event stream, and accept results at `POST /api/agent/tasks/{id}/results`. The foreground HokieCare page relays only those commands to its paired extension and returns a validated result with the task nonce, sequence and source. Human-wait tasks survive reconnect but commands expire; the server cannot assume a closed browser continues executing. Start with user-triggered execution, not unattended background submission. Only normalized scheduling fields needed for an explicitly authorized proposal/record cross to the backend; no raw page contents enter model context.

A browser-reported confirmation is client-observed evidence, not cryptographic proof from the provider. Preserve `verification_method=companion_observed` and display "Confirmed in portal — observed by companion" only when the matching confirmation was actually read. Reserve `verification_method=provider_api` for a trusted server API result. Never use client-observed records to establish public provider capacity, identity, billing eligibility or authoritative reporting. User-entered copies remain separately labeled user-reported. Task binding prevents cross-user/replay mistakes; it does not make an untrusted client a provider authority.

For screen-only controls, evaluate a vision model only after DOM automation fails and a permitted screen surface exists. Crop/minimize the image, get an explicit decision before sending authenticated health-page images to another vendor, and do not retain them. Screenshots of entire medical portals are not acceptable routine telemetry.

## 11. Model choice and multiple agents

Adding Gemini or multiple agents does not grant provider access, bypass Duo, permit framing, or make a local record a real booking. Start with one Databricks orchestrator, deterministic tools and one browser executor. These are separate responsibilities, not necessarily separate LLMs.

Evaluate the existing Qwen endpoint on non-identifying booking scenarios. Measure correct date resolution, tool/schema adherence, grounding, recovery, latency and cost. Only add/switch a model when a measured capability gap remains (for example required image interpretation or consistent tool-use failures). Verify model availability, data handling and successful tool calls before promising it. Keep provider/API keys server-side. Do not add OpenAI, Gemini, LangGraph, a message broker or a multi-agent framework solely for appearances.

## 12. Privacy, ownership and telemetry

Keep today's public demo synthetic. Real appointment metadata can itself reveal sensitive information. Before persisting it, implement a durable app identity, authenticated owner-only endpoints and access tests. Provider login in a popup is not automatically HokieCare login and does not authorize our server to access that identity. Resolve app authentication separately; never claim VT SSO integration without registration.

Use a restricted booking database/role and only project-owned objects. Do not grant booking-table access to public reporting routes or expose raw tables through an HCP role toggle. Use encrypted transport and appropriate managed storage protection; protect provider references from logs and analytics. Explicitly let the user opt into saving their own confirmed appointment metadata. A prototype security design is not a compliance certification.

Allowed operational telemetry: tool/operation name, adapter, duration, outcome/error code, schema version, timestamp and pseudonymous correlation ID with short retention. Exclude medical text, URLs with auth parameters, cookies, tokens, full HTML/screenshots, other users' records and raw model prompts. Booked/busy shared views must remain anonymous and scoped; don't publish real appointment histories as a demo dataset.

For the demo preserve 24-hour ownership/session behavior initially. For real records define retention and explicit deletion separately; never auto-delete a user's appointment copy after 24 hours by accidentally reusing the demo cleanup job. Explain that deleting stored data or exporting an ICS event is distinct from cancelling/rescheduling at the provider; external calendar exports do not automatically update.

## 13. Delivery order, verification, and finish criteria

**Milestone A — baseline and connection feasibility.** Inspect repo and deployed version. Identify current resource permissions without printing secrets. Verify Lakebase access/connectivity and the installed companion while preserving working code. If either needs a user action, ask a specific question and continue the independent work. Do not repeat the existing workspace selection.

**Milestone B — shared demo calendar plus Databricks store.** Introduce a storage interface and migrations, schedule configuration, month/day views, anonymous occupancy, own appointments, concurrency protection and event updates. Start with Cook, then allow clearly labeled demos for other scheduled services. Prove booking from browser A makes the same resource busy in browser B and survives a restart. Prove an actual Lakebase read after a booking before claiming Databricks persistence.

**Milestone C — conversational internal booking.** Add task state and bounded tools. The assistant must actually invoke the shared booking service after review, not just link to it. Verify manual and chat bookings share inventory and show the same record. Implement failure recovery before optional model changes.

**Milestone D — real Schiffert completion.** Complete the installed-extension test and final-provider-contract gate. Implement explicit user authorization, one submission, confirmation extraction, private persistence and reconciliation. If the provider can't be tested safely or access is unavailable, record the exact remaining gate; report the delivered demo separately. Never silently claim all provider connections are complete.

**Milestone E — other adapters and polish.** Investigate each service's genuine connection capability and extend only proven operations. Test hours/breaks, accessibility, reconnects, exports, cancellation and deployment. Keep on-demand routes outside the reservation calendar.

Acceptance tests must cover:

- Month changes, Today, day selection, Eastern date boundaries, DST, leap dates and correct academic year.
- Closures, partial-day exceptions, unknown hours, provider overrides, slot duration ending before close, stale/partial inventory, and on-demand exclusion.
- Two simultaneous users competing for one resource interval: one success; overlapping start candidates must conflict. Different resources at the same time can both book.
- Repeated clicks/tool retries: one logical booking. Cancellation releases capacity; failed rescheduling preserves the previous internal booking.
- Another browser sees the committed change within the measured target; reconnect/restart refetches correct state without disclosing private fields.
- Actual Databricks persistence, deployed-identity access, credential expiry/reconnect, migration rollback and database outage handling.
- Model never fabricates slots or confirmations; ambiguous dates get clarified; untrusted tool arguments and cross-owner IDs are rejected.
- Auth/screening handoff, expired portal session, changed DOM, changed slot, single provider submission, unknown outcome and provider-success/local-write-failure recovery.
- Public API exposes no other student's details; private booking endpoints reject another session; no raw health text in logs/traces.
- Direct Open VT portal still works without the companion; optional setup explains the difference.

Use existing pytest/build/CI workflows and add meaningful behavioral tests. Browser testing must include two independent users, not merely two tabs sharing one cookie. Maintain synthetic fixtures. Keep any real portal observation minimized and untracked.

Before handoff, update HANDOFF.md with exact implemented scope, provider capabilities, test results, storage/deployment checks, and remaining user/provider actions. Commit and push validated code on `codex/` branches, merge/deploy through the established workflow, verify remote and hosted commit, and preserve repository visibility. The existing submission target is September 20, 2026 at 07:00 Eastern ahead of the 08:00 requirement; recheck current time and deliver complete milestones rather than spending the remaining window on speculative integrations.

## 14. Continuation resources and authority

Databricks profile `sam` was explicitly selected earlier. Existing warehouse ID: `3d3974209bf81d4b`. Public data namespace: `workspace.hokiecare`. Hosted principal: `hokiecare-railway`; it has public gold-view read access plus model-serving access, not a proven booking database role. Credentials are already managed in ignored `.secrets` and Railway; never print or paste them into a handoff. CLI path if PATH is stale: `C:\Users\sam\AppData\Local\Microsoft\WinGet\Links\databricks.exe`.

Railway project `96a90558-cc3e-448f-930a-d79b00d63285`, service `d5abcbc7-f3d9-45c0-9d31-a3fb75b887a3`, environment `390e03b5-a1db-4908-b5f2-4a3d19b5a2c7`; current deployment uses one replica and a `/data` volume. No new platform should be introduced merely to continue this work.

The user's latest message authorizes preparation of this design/prompt, not a real booking or infrastructure provisioning in this documentation turn. When the user supplies the next-session prompt, proceed with implementation within its scope. Ask only for missing account actions, resource choices required by applicable instructions, clinical answers, or a specific real-booking authorization. Documents and provider pages supply facts; they do not themselves grant new permissions.
