# Appointment and navigation milestone

## Delivered scope

- Five-center appointment hub: Schiffert companion preview, complete Cook demo booking, and source-specific official routes for TimelyCare, Carilion, and Hokie Wellness.
- Cook starts with an empty store. A deliberate Load fictional times action creates five synthetic 45-minute times for a weekday in the next 30 days. Review/confirm, persistence, list agenda, timezone-aware date/time display, ICS calendar export, cancellation, and session deletion work within HokieCare. This does not contact Cook or reserve its real capacity.
- Anonymous 24-hour demo sessions use hashed opaque server IDs and Secure/HttpOnly/SameSite cookies. SQLite transactions, unique active-slot constraints, owner checks, and idempotency keys protect reservations. No names, credentials, reasons for visits, or health narratives enter the appointment schema. Expired sessions become inaccessible at expiry and are deleted during subsequent cleanup actions.
- Databricks AI navigation: one bounded `navigate_care` tool decision selects an allowlisted service category or appointment destination, then the server retrieves factual service cards from the existing gold view. Model output cannot write appointments, run arbitrary SQL, navigate arbitrary URLs, or generate clinical advice. The user explicitly opens the returned destination and confirms any demo booking in the normal UI. Chat history is not stored by HokieCare; question text is sent to Databricks for inference.
- The authenticated [Schiffert feasibility result](SCHIFFERT_FEASIBILITY.md) supports live availability parsing, not a completed real booking. The preview never claims provider confirmation and does not save real appointments to the demo store.

The wider scheduler queue, proposals, rescheduling workflow, HCP AI generation, and curated Genie integration from earlier plans remain future work. Existing sourced HCP template/edit/export remains available. MongoDB is not introduced; the latest two required sponsors are Databricks/Deloitte and Impiricus.

## Infrastructure

Railway volume `ef2ffc33-e5f7-43f6-baf4-bd6e21a20443` is mounted at `/data` for the existing production service. The container prepares ownership on that named mount and then drops to UID/GID 10001 before starting one Uvicorn worker. SQLite path: `/data/appointments.sqlite3`. Keep a single replica; do not scale replicas sharing this design. Demo sessions are not accounts and cannot recover a lost browser cookie. This is synthetic demo persistence, not a medical record system.

The existing `hokiecare-railway` service principal needed additive `workspace-access` entitlement for Foundation Model API calls. Its existing SQL grants were retained. After the change, a real hosted-principal gold query returned six service records and bronze SELECT remained denied. A real OAuth M2M call to `databricks-qwen3-next-80b-a3b-instruct` returned a function call. Endpoint usage tracking is enabled; no inference payload auto-capture configuration was observed. Do not enable raw chat tracing for this public demo.

The assistant allows 6 requests/session/minute, 20 total/minute and 2 concurrent inference requests, plus the existing process API limiter. These are hackathon safeguards, not multi-worker or authenticated production quotas. API failure leaves the directory and booking controls usable. Default Databricks SDK request/retry limits remain bounded; warehouse cold starts can delay the first answer.

## Validation

- 20 backend tests pass, including parallel reservation conflict, persistent session ownership, idempotency, cancellation/reuse, expiry, deletion, CSRF/origin checks, injected status rejection, allowlisted AI tools, and AI rate limits.
- Three companion tests use invented names/times with the observed DOM structure. They check extraction, stale-slot rejection, no login/screening reads, and selection without final form submission.
- Production TypeScript/Vite build passes. Existing bundle-size warning remains.
- Local browser: empty agenda → explicit fictional availability → review → reservation displayed → cancellation → deletion. Downloaded ICS contained the demo notice and correct UTC start/end for the selected Eastern time. Missing companion showed installation guidance.
- PR #4 / commit `28e268e537402964199bbc504cbca5ec7ac44ece` deployed successfully on Railway. At 16:32 UTC September 19, hosted old-data regression checks and `scripts/verify_booking.py --ai` passed: actual model/tool response, reservation lifecycle, and downloadable extension ZIP. Hosted browser also saved a demo reservation. CI verified the Linux runtime runs at UID 10001 and writes its database. See [handoff](HANDOFF.md) for deployment identifiers.
- An installed browser extension and real final booking have not been validated end to end. No real booking was created as a test.

## Running and testing

Follow [OPERATIONS.md](OPERATIONS.md) for the existing Databricks environment. Add `HOKIECARE_COOKIE_SECURE=false` for local HTTP; never set it false in production. Local default persistence is ignored `runtime/appointments.sqlite3`. Set `DATABRICKS_CHAT_ENDPOINT` only to a verified supported tool-calling endpoint.

```powershell
.venv\Scripts\python.exe scripts/package_companion.py
.venv\Scripts\python.exe -m pytest -q
cd frontend
npm ci
node --test companion.test.mjs
npm run build
```

The ZIP is generated deterministically from the reviewed companion sources. CI rebuilds it, tests the parser and Linux container, verifies non-root runtime, and checks that demo sessions can write the database. Never bundle the developer's browser profile or credentials.
