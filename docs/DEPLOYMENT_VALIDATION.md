# First public deployment: September 19, 2026

Live: https://vthacks-2026-production.up.railway.app

Application merge: `8ebd762f29b31f9b7d80dec8c4c304fb22ce8cd4` ([PR #2](https://github.com/sam044/vthacks-2026/pull/2)). Railway deployment `b6d27376-418b-4743-a344-7a10eff1f829` reported SUCCESS. Unauthenticated HTTPS checks completed at 06:58 UTC. Later documentation-only commits may change the live SHA without changing the application.

## Evidence

- Eleven API/data tests passed locally and on Linux CI. [Successful implementation CI](https://github.com/sam044/vthacks-2026/actions/runs/35427972301) includes TypeScript/Vite build, Docker build, container startup, liveness/static requests, and the expected 503 when Databricks credentials are absent.
- `/api/health` returned the matching deployed Git SHA and status `ok`. `/api/ready` successfully queried Databricks through the hosted service-principal identity.
- `/api/services` returned six real curated VT resources. Mental-health + virtual filtering returned exactly scheduled TimelyCare and TalkNow.
- `/api/trends` returned 350 ED weeks and 350 urgent-care weeks, January 4, 2020 through September 12, 2026. All 64 suppressed combined counts were null with flags. Invalid week limits returned 422.
- Hosted directory query statement: `01f1b3f7-8cdb-12a0-b8ac-b15c4ca23cc8`; hosted trends query statement: `01f1b3f7-8d83-1764-8aa7-3d2a530e9991`. Source snapshot: `7c681c4a6cc19c11723d077d788dadba9a9df8e836d1e28ce66341e6eab9a84d`.
- Import checks verified 28,700 source records, matching normalized count and 700 New River rows. See the committed [import manifest](../research/healthcare/databricks_import.json).
- Reader identity accessed both gold views; a direct SELECT on the bronze source table was denied. No source-editing privileges were granted to this principal.
- Browser checks: six service cards, virtual filter, concurrent-therapy constraint, both care settings, 13-week table, editable draft, and downloaded text contents. Desktop rendering inspected. Both views fit a 390px browser viewport (375px layout area) without horizontal page overflow after a tooltip fix. Hosted browser rendered the service directory and 1.3% latest ED observation without console errors.

Re-run the unauthenticated HTTP checks:

```powershell
.\.venv\Scripts\python.exe scripts/verify_deployment.py https://vthacks-2026-production.up.railway.app
```

Use `--commit <expected-full-sha>` to verify an exact release. The verifier checks the pinned snapshot, so intentionally update it when changing data versions.

## Limits and remaining work

This is the first functional data release. The resource-card draft is a deterministic template; no AI inference or curated Genie agent runs in the application. No live scheduling feed, clinical record access or forecast is claimed. Refresh is manual, and the UI clearly dates the snapshot. A stopped warehouse can cause a temporary retryable 503; the process health check is deliberately independent. Cache entries last five minutes and are labeled.

The OAuth secret must be rotated before October 19, 2026. Railway's `railway.json` configuration currently works; its CLI reports migration to Infrastructure as Code is required before December 1, 2026. The JavaScript build has a non-failing bundle-size advisory (about 179 KB gzip); split the chart module if further features grow it. Two upstream Python test dependency deprecation warnings do not affect the passing checks.
