# Appointment email handover for Claude

September 19, 2026. Branch: `codex/encrypt-user-data` (name retained at user request).

## Current direction

The user cancelled the user-data encryption/hashing integration. Existing standalone Node hashing files are historical and unused by this feature. The requested feature sends **real emails about mock appointments**: match a submitted email to the scheduling table, send a confirmation, and remind 24 hours before. The user explicitly removed signup/verification and email-limit tables. Assume the Databricks tables exist; do not provision cloud resources just to answer table-name questions.

Only two email tables are required in Databricks Lakebase Postgres, under the existing `hokiecare` search path:

- `hokiecare.mock_email_schedule`: `id`, normalized `email`, `health_center`, `starts_at` (UTC ISO-8601 text), `status` (`scheduled`/`cancelled`), `revision` (integer).
- `hokiecare.appointment_email_jobs`: recipient, appointment/revision, confirmation/reminder kind, due epoch, delivery state, attempts, lease, stop token. See `backend/hokiecare/email_schema.sql` for exact definitions.

The mock email schedule is independent of the existing 24-hour browser demo agenda and provider redirects. A redirect does not insert a row. No browser submits a center or time. No matching data is exposed in the API response; emails go only to the address in the schedule. VT and Gmail addresses are both supported. There is a consent checkbox, but no inbox-verification flow or separate signup/limit table. The existing global API middleware limiter remains.

User-supplied mock times, all America/New_York: Schiffert Health Center on September 21, 2026 at 10:00 AM; Cook Counseling Center on September 25 at 1:30 PM; TimelyCare on October 1 at 4:45 PM (PM explicitly confirmed). Real recipient addresses are in the conversation; do not publish them in sample source files. The user subsequently said to assume these records/tables exist. Nothing has been inserted into live Databricks and no real email has been sent by this task.

## Code and operations

`appointment_emails.py` implements settings, POST request, token-authorized POST stop, and the worker. Requests create durable jobs in one transaction. Uniqueness prevents repeat form submissions from duplicating deliveries. The worker re-queries matching stored recipient/time/center before each send. Increase `revision` whenever editing a schedule record. Prior requested recipients follow revisions; a changed recipient requires a new request. Cancelled, past, stale-revision and stopped jobs are skipped. Within 24h, only the confirmation is sent. Stop links affect all jobs for the same appointment and recipient, including later revisions; restarting that appointment's emails requires operator intervention.

SMTP transport (`mailer.py`) requires TLS and supports password-authenticated SMTP. **Microsoft OAuth2 is not implemented yet.** User has asked about Outlook; personal vs school/work account clarification is pending. Outlook.com requires OAuth2, so changing host alone is insufficient. Do not recommend using their ordinary Microsoft password.

Set backend environment variables from `.env.example`; no automatic dotenv loading. Required: `HOKIECARE_EMAIL_ENABLED=true`, `SMTP_HOST`, `SMTP_FROM`, `HOKIECARE_PUBLIC_ORIGIN`. Normally also `SMTP_USERNAME`, `SMTP_PASSWORD`; defaults: port 587, `SMTP_SECURITY=starttls`. Alternative implicit TLS uses `tls`/465. Set identical configuration in web and worker processes. Use the deployed origin in production and HTTP localhost only for development.

PowerShell from the repo root, after exporting configuration:

```powershell
$env:PYTHONPATH='backend'
.venv/Scripts/python.exe -m uvicorn hokiecare.app:app --app-dir backend --host 127.0.0.1 --port 8000 --no-access-log
```

Run the worker in another terminal with the same environment:

```powershell
$env:PYTHONPATH='backend'
.venv/Scripts/python.exe -m hokiecare.appointment_emails
```

The worker checks every 15 seconds; `--once` runs one pass for a scheduler. It retries delivery up to five times with backoff and stores only error class names. SMTP cannot guarantee exactly-once delivery when a send succeeds but acknowledgment/database update is lost. A cancellation racing an in-flight SMTP send cannot retract it. Message IDs are stable across retries. There is no new hosting worker configured or deployed.

SQLite is the explicit local preview fallback and migrates additively to version 5. Lakebase web processes do not create tables. `email_schema.sql` is an optional operator migration; `setup_booking_lakebase.py` includes it for operator setup. `scripts/seed_email_schedule.py --file PATH` loads a private JSON array with `id,email,health_center,starts_at`, validates full center names and offset-aware timestamps, and reads rows back without printing addresses. It requires `HOKIECARE_BOOKING_STORE=lakebase`; `--local` explicitly selects SQLite. `--apply-schema` requires the selected schema owner's privileges. No live schema/seed commands were run here.

## Local checkout and preview

The team GitHub checkout is `C:\Users\cjf12\AppData\Local\Temp\hokiecare-hashing-08f7c3427403496c8b8c3785ba1a9860`. The task's original workspace is a different uncommitted Next.js prototype; do not push it over the team repo. Team app is FastAPI + React/Vite.

Preview: http://127.0.0.1:8000/ with `HOKIECARE_BOOKING_DB=runtime/email-preview.sqlite3`, `HOKIECARE_BOOKING_STORE=sqlite`, `HOKIECARE_EMAIL_ENABLED=false`, local insecure cookie allowed only for HTTP. Codex browser displays Appointments and the email form. Live directory/trends/assistant report unavailable without Databricks credentials; do not substitute made-up live data. This machine has no configured Databricks profile or SMTP credentials. No live table creation, deployment or delivery verification is claimed.

Tests: `python -m pytest -q`, `npm --prefix frontend run build`. New tests cover exact recipient lookup, two-table schema, duplicate suppression, reminder timing, invalid input, cancellation/recipient changes, rescheduling, stop links, concurrent claims, bounded failures, and SMTP TLS ordering. All transport tests fake SMTP; passing tests do not establish inbox delivery.
