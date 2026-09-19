# Run and deploy HokieCare

The first release serves a VT service directory and New River respiratory charts from Databricks SQL. The editable HCP resource card is a deterministic draft, not model-generated advice. Agent/model/Genie integration is a later milestone.

## Local development

Use Python 3.12 and Node 24:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.in
npm --prefix frontend ci
npm --prefix frontend run build
$env:DATABRICKS_CONFIG_PROFILE = 'sam'
$env:DATABRICKS_WAREHOUSE_ID = '3d3974209bf81d4b'
.\.venv\Scripts\python.exe -m uvicorn hokiecare.app:app --app-dir backend --host 127.0.0.1 --port 8000 --no-access-log
```

The modern Databricks CLI must be on PATH for local OAuth. On Sam's machine its directory is `C:\Users\sam\AppData\Local\Microsoft\WinGet\Links`. Each teammate uses their own explicitly selected authenticated profile and workspace permissions. Do not copy another user's credentials. `.env.example` is a template; export variables rather than assuming automatic dotenv loading.

Open http://127.0.0.1:8000. For frontend hot reload, run `npm --prefix frontend run dev` alongside the backend; Vite proxies `/api` to port 8000. Restart FastAPI after the first production frontend build so the assets directory is mounted.

## Endpoints

| Route | Behavior |
| --- | --- |
| `/api/health` | Process liveness, version and deployed Git SHA; no Databricks query |
| `/api/ready` | Reads the service view; 503 when unavailable |
| `/api/services` | Six public resources; validated category/modality filters |
| `/api/trends` | New River observations; ED/urgent-care selection; 4–350 weeks |

Application SQL is fixed and bounded. Request filters apply to small results rather than being interpolated into SQL. Results are cached for five minutes, marked `live` or `cached` with query time/statement ID. Expired cache does not silently hide an outage. Three query slots and a 180-request/minute process-wide API budget bound workload. This is a single-worker, single-replica design; review bounds before horizontal scaling. Errors do not expose SDK configuration or secrets. No free-form health input is sent to the backend.

Charts are district surveillance, not VT student prevalence or forecasts. The pinned snapshot ends September 12, 2026, reported September 15. A warning appears when the last week is over 21 days old. Suppressed counts remain null with a flag. Disease percentages are not summed to manufacture the combined measure.

## Reproducible import

The official snapshot must exist at `data/raw/healthcare/vdh_records.json`; raw data is ignored. Retrieval scripts and source URLs are in `scripts/research_health_data.py` and `research/healthcare/`. The importer is pinned to the verified 28,700-row snapshot. A new upstream version requires reviewing counts, dates, reuse notes and validation before changing it.

```powershell
$env:DATABRICKS_CONFIG_PROFILE = 'sam'
$env:DATABRICKS_WAREHOUSE_ID = '3d3974209bf81d4b'
.\.venv\Scripts\python.exe scripts/import_databricks.py
```

The importer refuses an existing schema without the project ownership marker. Hash-addressed files live in `workspace.hokiecare.source_snapshots`. Immutable bronze/normalized snapshot tables retain raw JSON, reporting fields, hashes and suppression flags. The validated views `gold_service_directory` and `gold_new_river_trends` are the app data surfaces. Repeat imports reuse tables. Import evidence is committed in `research/healthcare/databricks_import.json`. Curated VT facts are in `data/contracts/services.json` with official page links.

## Railway

- Repository: `sam044/vthacks-2026`; connected branch: `main`.
- Project: `96a90558-cc3e-448f-930a-d79b00d63285`.
- Service: `d5abcbc7-f3d9-45c0-9d31-a3fb75b887a3`; production environment: `390e03b5-a1db-4908-b5f2-4a3d19b5a2c7`.
- Public domain: https://vthacks-2026-production.up.railway.app
- Docker builds React in Node and serves assets/FastAPI in a non-root Python image. `.dockerignore` permits only app inputs; raw datasets, skills, Git, local config and secrets never enter the image.
- Docker CMD binds `0.0.0.0:$PORT` (8000 default), one worker, no access logs. The domain targets 8000. Keep `PORT=8000` unless updating the domain target too.
- `railway.json` selects Dockerfile build and `/api/health` with a 120-second deployment timeout. Data readiness is checked separately with `/api/ready` and real API calls.

Server variables: `DATABRICKS_HOST`, `DATABRICKS_AUTH_TYPE=oauth-m2m`, `DATABRICKS_CLIENT_ID`, `DATABRICKS_CLIENT_SECRET`, `DATABRICKS_WAREHOUSE_ID`, `PORT=8000`. Never set `DATABRICKS_CONFIG_PROFILE` in production.

Dedicated principal `hokiecare-railway` has warehouse CAN_USE, catalog/schema traversal and SELECT on two gold views. Its OAuth secret lasts 30 days from September 19: rotate before October 19, 2026. The recovery copy is ignored at `.secrets/railway-databricks.json`; never commit, print or share it. `scripts/configure_hosted_identity.py` validates access and sends values to Railway via stdin. It reuses the saved secret; rotation requires creating/replacing that credential first. Subprocess errors deliberately withhold possible secret-bearing output.

The initial deploy failed because `main` had documentation only. Develop on `codex/` branches, push milestones, test and merge into `main` to deploy. Rollback uses Railway's previous successful deployment; it does not roll back Databricks views. Immutable snapshots support deliberate data rollback.

## Validation

`python -m pytest -q` checks source constraints, suppression, duplicates, API filters, cache, timeouts, rate limits and liveness. `npm --prefix frontend run build` checks TypeScript and builds assets. GitHub Actions also builds/runs the Linux container and checks static/liveness and unconfigured-data failure behavior. Live data/deployment checks are recorded separately because CI has no workspace credentials.
