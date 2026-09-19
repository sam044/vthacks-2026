# HokieCare unified appointment hub

Updated September 19, 2026 after the user's five-service rundown. This is a tailored implementation plan, not an implemented booking service. It refines and supersedes the scheduling section and related storage choice in [PROTOTYPE_EVOLUTION_PLAN.md](PROTOTYPE_EVOLUTION_PLAN.md). Keep that document's agent, evidence, evaluation, and submission requirements.

## Decision

Build one appointment hub inside HokieCare, backed by our own scheduling service. Give it **both a student experience and a scheduler workspace**. The student can select a center, explore service types, choose a published demo slot or express a time preference, and see their records in one calendar/list. The scheduler can publish slots and accept, propose alternatives, or decline requests. All demonstration actions stay inside HokieCare; calling or logging into an external website is not a prerequisite for using the demo.

The missing link is provider participation, not a calendar widget. A booking saved only in our database does not reserve a clinician's time. Replacing phone scheduling becomes real when the provider adopts our scheduler workspace or authorizes an integration that reads/writes its actual schedule. We have neither agreement today. Show the complete working workflow using synthetic appointments and clearly identify it as a demonstration for the named center, with no implied affiliation.

For public service navigation, preserve a small official-access section as factual reference. Do not erase the actual booking instructions or make real users think that saving an unsent request replaces them. The main demo path itself requires no calls, external forms, credential entry, or portal automation.

## Research: the five places are different kinds of services

All sources below were checked during this planning update. Public instructions establish available access routes, not our integration permission or current appointment capacity.

| Center | What the sources establish | HokieCare design |
| --- | --- | --- |
| Schiffert | Official instructions support the Healthy Hokies portal and phone scheduling. The user's `hokies.healthcenter.vt.edu/Home` URL redirects to VT SAML login. The earlier unauthenticated login test returned `frame-ancestors 'none'` and `X-Frame-Options: DENY`. | Medical service card and internal demo calendar. No embedded VT login or claimed real-time feed. Actual integration remains a separate provider-access investigation. [Appointments](https://healthcenter.vt.edu/appointments.html) · [User's portal](https://hokies.healthcenter.vt.edu/Home) |
| Cook Counseling | Published appointments start with calling 540-231-6557 during weekday business hours; embedded counselor arrangements can differ. Psychiatry has referral/counseling requirements. | Internal demo request/acceptance workflow shows how staff could replace calls by using our queue. Saving a public unsent request cannot book Cook. [Cook appointments](https://ucc.vt.edu/appointment.html) |
| TimelyCare | VT lists scheduled counseling, on-demand TalkNow, coaching, and self-care. The provider describes scheduled counseling with licensed counselors and TalkNow with mental health professionals. | Keep it. Separate scheduled appointments from on-demand services; only appointment-based services get a slot calendar. Do not replace human care with our chatbot. [VT services](https://ucc.vt.edu/timelycare.html) · [Provider support](https://timelycare.com/support/) |
| Carilion | The supplied VT page describes a regional health-system partner, not a student booking portal. Carilion MyChart supports both direct scheduling and appointment requests; some requests need a scheduler callback. | External-care category with specific practice/location and visit type required before a real booking. Demo can use a clearly fictional practice scenario; no generic promise of a Carilion appointment or VT-student eligibility. [Supplied overview](https://medicine.vtc.vt.edu/campus-tour/health-system.html) · [MyChart](https://www.carilionclinic.org/mychart) · [Scheduling guide](https://www.carilionclinic.org/MyChart-Schedule-a-Visit) |
| Hokie Wellness | Student consultations include BASICS, financial coaching, and recovery meetings, with service-specific scheduling or interest forms. It is not one general medical clinic. | Separate consultation choices and request flows. Do not give all wellness programs a medical appointment calendar. Workshops/events can have registration actions later. [Consultations](https://hokiewellness.vt.edu/students/our_services/consultations.html) |

TimelyCare does have a distinct AI product, **TimelyGuide**, described separately in its [terms](https://timelycare.com/terms-conditions/). Its availability to VT was not verified. That does not make its human counseling services an AI chatbot. Keep only VT-supported services in our directory; do not import every product on the vendor's national site into VT's benefits.

Preserve the Cook-versus-TimelyCare scheduled-therapy constraint from VT's page. On-demand support, wellness coaching, counseling, and medical appointments are not clinically interchangeable. The agent explains published service purposes and access requirements; it does not diagnose or decide eligibility.

Hokie Wellness currently links BASICS through `https://tinyurl.com/AODintake2425`, financial coaching through an Impact Feedback interest form, and recovery through an Impact Feedback intake survey. The shortlink's destination could not be verified by the web fetch in this turn; the public link alone is not proof of a working slot picker. Retain the consultations page as the canonical source and recheck individual forms before presenting direct handoffs.

## Empty database and frontend behavior

Initialize a **public center/service catalog**, but initialize all appointment, request, and slot tables empty. Five center cards do not mean five providers have joined the platform. The current app has six service cards, including two TimelyCare services and SSD; add a center-to-service relationship instead of overwriting that directory. Preserve SSD as a resource outside the five scheduling targets.

The first My appointments screen says “No appointments yet.” The first scheduler screen says “No availability published.” A student cannot reserve an arbitrary time from an empty availability table. There are two explicit paths:

- **Pick an available demo slot:** a demo scheduler has published it; confirmation reserves it within the scenario.
- **Suggest a preferred time:** save a request for the scenario's scheduler to review. A date preference is not offered availability.

Provide a deliberate “Start example scenario” action for judging that creates a labeled set of fictional slots. Never silently populate fake appointments on first visit or substitute fixture data for a failed live provider request. The user can reset only their own demo scenario.

Keep the interface in our frontend, but put the authoritative records in the backend. A browser-only array or localStorage cannot reliably coordinate a student's choice with a scheduler, stop another student taking the same slot, or survive clearing browser storage. React state is for display and unfinished selections, not the source of truth.

## Student flow

1. Start through the agent or ordinary center/service cards. Use short, non-identifying needs/preferences. Do not ask for diagnoses, DOB, medical records, or VT credentials.
2. The agent retrieves sourced service facts and asks only a necessary service/preference clarification. Published urgent-support guidance remains available; the agent does not assign a medical urgency score.
3. Show why an option is relevant, its constraints, and whether it is scheduled, on-demand, an interest form, or informational.
4. Open an internal appointment panel containing center, service, modality, timezone, data origin, and connection state. For demo scheduling, keep “Demo — not connected to this provider” visible next to the calendar and confirmation.
5. Choose a published demo time or enter a preferred date/time window for a request. Review the exact record before saving.
6. Show the record in My appointments, with list/calendar views, center, service, time/window, status, and a next action.
7. Support cancellation/rescheduling within the demo. Rescheduling reserves a replacement atomically or leaves the old reservation intact if unavailable. No local action claims to cancel or change an external appointment.

Avoid storing the chat alongside the appointment. For the public MVP, persisted records are synthetic scenarios only. Real personal appointment tracking or live clinical scheduling is a separate authenticated release; center/service metadata can itself reveal sensitive information.

## Status language must match what happened

| Display | Meaning | Allowed next action |
| --- | --- | --- |
| Demo request awaiting review | Saved to a scenario queue operated by the team; no actual provider received it | Demo scheduler proposes/accepts/declines; student may withdraw |
| Demo time proposed | Demo scheduler offered a time; student has not accepted it | Student accepts if still available or declines |
| Demo appointment reserved | Our backend reserved a fictional slot | Demo cancellation or rescheduling |
| Saved preference — not sent | A draft exists, but no provider connection exists | Edit/delete; no implied pending response from clinic |
| Awaiting provider confirmation | Future integration actually submitted a request and recorded its receipt | Wait for verified response; timeout remains unknown, not failed or confirmed by guess |
| Provider confirmed | Future connected provider accepted, with an external confirmation reference, or authorized staff operating its actual schedule confirmed | Provider-supported changes only |
| Reported by you | Optional future personal tracker entry, entered by the user | Edit personal record; not independently verified |

Use distinct enums for origin (`demo`, `local_draft`, `provider`, `user_reported`) and status. For the current release, reject attempts to create `provider` origin at the API. An agent cannot set a confirmation reference or promote a demo reservation to provider-confirmed. Calendar exports and downloaded summaries retain the origin/status label.

## Scheduler and HCP workspace

This is the essential addition to the previous plan. Keep the existing HCP trend/briefing feature and add a separate appointments tab with:

- A center/service-scoped weekly availability editor and published demo slots.
- A request queue with preferred windows, accepted/proposed/declined states, and relevant published service constraints.
- A calendar showing booked and open slots within the scenario.
- Accept, propose another time, decline, cancel, and reschedule actions with audit events.
- Aggregate scenario metrics: requests received, requests resolved, open slots, cancellations, and slots rebooked after actual cancellations. All are labeled simulated and remain separate from real VDH surveillance.

A request does not hold every time in its preferred window. A pending proposal has an expiry; availability is rechecked on acceptance. Published slots and existing reservations share a transactional store. Each slot has a fixed resource, start/end, timezone, and version; prevent overlapping appointments for the same resource, not only duplicate IDs.

For judging, the team operates the scheduler. No one is presented as an actual Cook counselor or Carilion clinician. Future provider participation would require approved staff accounts and ownership of actual schedules; a new calendar cannot safely replace existing schedules while both independently accept bookings.

## Architecture and data model

Keep React, FastAPI, Databricks, and Railway. For the **single-replica demonstration**, use SQLite through the backend on a Railway persistent volume, with migrations and transactional reservations. This supersedes the previous process-memory scheduling choice because the user now wants saved records. Verify volume availability, mount permissions, restart persistence, and a backup/restore before claiming durability. [Railway volumes](https://docs.railway.com/volumes) · [SQLite isolation](https://www.sqlite.org/isolation.html)

SQLite is scoped to a low-volume, single-instance synthetic demo. Do not claim multi-region or production clinic readiness. If the MongoDB prize returns to scope, Atlas can replace this transactional store through the same repository interface; do not implement two reservation databases. No database or volume was provisioned during this planning turn.

| Entity | Minimal fields / purpose |
| --- | --- |
| Centers and services | Stable IDs, source URL/date, service type, modality, geography, constraints, official access route, connection mode |
| Scenarios and sessions | Random identifiers, hashed session credentials, role/membership, expiry; no student identity |
| Availability | Scenario, center/service/resource, start/end, timezone, version, open/closed state, synthetic origin |
| Requests | Owner/scenario, center/service, preferred window, status, proposal/expiry; no symptom narrative |
| Reservations | Owner/scenario, slot, status, idempotency key, timestamps; demo confirmation only |
| Events | Actor role, object ID, action, time, previous/new state; no prompts or credentials |
| Provider connections (future) | Provider scope, verified capabilities, connection status, external references; no browser-session copying |

The browser receives an opaque secure HttpOnly session cookie. Enforce ownership and scenario membership on every route, restrict scheduler writes to the scenario creator or authorized demo operator, validate request origins/CSRF protections, and rate-limit writes. Joining a student scenario must not confer scheduler permission. A visible view selector does not grant roles. Expire demo scenarios after a stated period (initial target: 24 hours) and offer immediate deletion; clearing the cookie alone does not delete backend records.

Databricks continues to serve the public directory/trends and the real model/tool flow. Once scheduling works, a reproducible job may publish **synthetic aggregate workflow metrics** to separate project-owned tables for the HCP demo. Do not mix them into VDH tables or send appointment details/chat to model telemetry. Prediction remains lower priority than reliable coordination.

## Agent tools and provider connections

Use the existing planned Databricks orchestration, with bounded tools: `find_services`, `get_service_details`, `get_booking_capabilities`, `list_demo_slots`, `prepare_demo_request`, and `list_my_demo_appointments`. Confirmation buttons call validated write endpoints after the student reviews the exact center/time. The agent does not gain scheduler privileges from a prompt or create a provider confirmation.

Add a provider adapter contract for `capabilities`, `list_slots`, `submit_request`, `confirm`, `cancel`, and `get_status`. Capability flags decide which UI controls exist. An unsupported adapter returns “not connected,” never an empty successful live result. The initial demo adapter is fully functional; official-source adapters provide factual guidance only and perform no bookings.

Do not spend this build embedding VT login or automating portal credentials. The previous test established a VT login framing restriction; the authenticated booking flow has not been inspected. No approved appointment API, embedding agreement, or delegated-access mechanism has been verified for any of the five targets. This is an evidence limit, not proof that no integration exists. A future short discovery step can inspect public developer information and, with the user's participation, the booking-only UI after user-controlled sign-in. No real booking or account access happens as part of this plan.

## Build sequence and acceptance gates

| Stage | Work | Pass condition |
| --- | --- | --- |
| 1 | Center/service capabilities and empty appointment hub | Five scheduling targets, service-specific modes, existing SSD resource retained; zero invented live slots or appointments |
| 2 | Backend store, sessions, migrations, demo slots and requests | Two browsers share a scenario correctly; ownership enforced; empty state and restart persistence tested |
| 3 | Student calendar/list and scheduler queue | Publish → request → propose → accept → cancel → rebook works entirely inside HokieCare |
| 4 | Databricks agent | A natural-language request retrieves facts, opens the right panel, and proposes valid actions; model outage leaves manual scheduling usable |
| 5 | HCP briefing and aggregate scenario metrics | Staff reviews a request and an independently sourced brief; synthetic and observed data remain distinct |
| 6 | Deploy and evaluate | Hosted API/browser checks, mobile/keyboard use, exports, concurrency, isolation, reset, and source/status review pass |

This brings the appointment hub forward in priority. Retain the previous submission buffer and cut forecasting, Genie, and additional integrations before cutting the real agent or complete student/scheduler flow. Re-estimate remaining time at implementation start; do not assume the prior time estimate remains available.

Required tests: two clients competing for a slot yield one reservation; a repeated submission is idempotent; overlapping resource bookings fail; a failed reschedule preserves the original; a student cannot read/cancel another student's record or publish slots; client-supplied `confirmed`/`provider` states are rejected; deleting a scenario removes its records; a stale proposal cannot be accepted; unconnected providers cannot generate live availability; demo labels survive export; on-demand services have no invented calendars; model/warehouse failure never fabricates booking success.

## What this solves and how to present it

The hackathon build can prove a complete central scheduling workflow and persistent shared state without depending on five incompatible external portals. It shows what a participating clinic could use to reduce phone-based administration. It does not prove those clinics have adopted it or that a real student has reserved care.

Suggested demo: start with an empty student calendar, let a team operator publish synthetic availability for a clearly labeled Cook scenario, ask the agent for service guidance, submit a preferred window, have the operator propose a slot, accept it, and show both calendars updating. Cancel and rebook with another demo student. Then show the HCP's sourced local brief. This gives Deloitte a visible tool-using campus agent and Impiricus an active professional workflow.

Accurate pitch: **“We built a shared appointment workflow that students and participating care teams can use in one place. Our demo uses fictional schedules; real deployment requires clinic participation or authorized integration.”** No measured wait reduction, recovered real slots, clinical equivalence, or institutional endorsement is claimed.

This update changes planning documentation only. No credentials were entered, forms submitted, providers contacted, appointments created, new services provisioned, or application code deployed.
