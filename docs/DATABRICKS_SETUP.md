# Databricks setup: verified state and next actions

## Implementation update: September 19, 2026

The first import/query milestone is complete. `workspace.hokiecare` now contains a managed source Volume, immutable hash-addressed bronze/normalized Delta snapshots, and two gold views. Actual SQL checks returned 28,700 source records, 700 New River rows (350 weeks), six service records, and 64 suppressed combined counts. See `research/healthcare/databricks_import.json` and [operations](OPERATIONS.md).

A dedicated `hokiecare-railway` principal can query both views through OAuth M2M, with CAN_USE on the existing warehouse and SELECT on those views. Its 30-day secret is configured in Railway server variables and an ignored recovery file. No user OAuth cache is deployed. Genie One successfully explored the trend view during development; a curated application Genie agent and model inference are still unimplemented. All 31 installed skills are now exposed in Codex's skill catalog.

The remainder of this file records the earlier planning-stage checks; its statements about absent data/resources describe that earlier point in time.

Checked September 19, 2026. The user explicitly selected the existing `sam` profile for HokieCare. That selection persists; do not ask again unless the destination changes.

## Verified locally

| Item | Result |
| --- | --- |
| Existing AI Dev Kit marker | `C:\Users\sam\.ai-dev-kit\version` contains `0.2.0`; a marker alone did not establish a complete install |
| Databricks CLI | v1.17.0, satisfying the installed core/setup-local skills' version floors |
| CLI binary | `C:\Users\sam\AppData\Local\Microsoft\WinGet\Links\databricks.exe` |
| Shell discovery | This task's inherited PATH did not find `databricks`; the existing WinGet binary works by absolute path. No reinstall was necessary |
| Profile | `sam`, OAuth via `databricks-cli`; authenticated identity check succeeded |
| Workspace | `https://dbc-f9a07f6d-dee2.cloud.databricks.com` |
| Catalogs visible | `workspace`, `samples`, `system` |
| SQL warehouse | `Serverless Starter Warehouse`, ID `3d3974209bf81d4b`; serverless enabled; STOPPED when inspected |
| Model endpoints | 11 visible endpoints reported READY, including chat and embedding models |
| Databricks Apps | Listing succeeded; no apps present |
| Skills | All 31 stable Databricks skills installed in this repository; 311 upstream skill files, pinned and hashed |

No query, inference, data import, schema/Volume creation, Genie creation or cloud deployment was performed during this planning turn. Model READY status does not prove a successful application inference request. Workspace edition/billing and service-principal provisioning rights were not established by these checks.

## Official AI Dev Kit skill installation

The user supplied [AI Dev Kit's existing-project instructions](https://github.com/databricks-solutions/ai-dev-kit#install-in-existing-project). Current upstream documentation redirects maintained skills to [Databricks Agent Skills](https://github.com/databricks/databricks-agent-skills); the older bundled copies are deprecated. We installed those current skill files with Codex's skill-installer helper, using an exact upstream commit:

`e0af9245dd88c9d2c1c6a2de9f7133beac0cdb2d`

- Location: `.agents/skills/<skill-name>/SKILL.md`.
- Inventory and individual hashes: [lock file](../.agents/databricks-skills.lock.json).
- Upstream license and notice: [license](../.agents/DATABRICKS_LICENSE), [notice](../.agents/DATABRICKS_NOTICE).
- This is a project-scoped raw-skill installation. It is not registered as an `aitools`-managed install or a Codex marketplace plugin, so CLI/plugin update metadata is not claimed.
- Codex's [documented project skill location](https://developers.openai.com/codex/skills) is `.agents/skills`. Skills should be available in the catalog on the next turn; if discovery does not refresh, reopen the task/app. We already read and applied the relevant SKILL.md guidance directly during this turn.
- No extra Databricks MCP server is active in this task. It is not required: actual workspace operations work through the CLI, and the planned backend will use the SDK. Skills provide guidance; they do not themselves grant authentication or create workspace resources.

Priority skills for implementation: `databricks-core`, `databricks-unity-catalog`, `databricks-python-sdk`, `databricks-dbsql`, `databricks-genie-agents`, `databricks-jobs`, `databricks-dabs`, `databricks-model-serving`, `databricks-ml-training`, and `databricks-mlflow-evaluation`. The remaining product skills are available when needed, not a mandate to use their products. No synthetic-data generator is part of the core-data plan.

## First workspace milestone

1. Inspect access to catalog `workspace`; use a proposed `hokiecare` schema only if it does not collide with existing objects.
2. Test a bounded query on the selected warehouse. Starting a query can wake stopped compute; keep the warehouse's auto-stop setting and account quotas in view.
3. Test a minimal model request against a discovered chat endpoint; validate tool/structured-output behavior before selecting the final model.
4. Create project-owned schema/Volume and import a small real-data sample, then the validated core snapshots.
5. Query expected source counts and the New River subset. Produce a source-backed service lookup.
6. Verify Genie creation/query permissions and the least-privilege identity needed for external hosting.

We can develop curated schemas and UI contracts locally while these checks run. There is no need to build all of Databricks first; one import and one real query are the gate.

## Commands for this Windows machine

```powershell
& "$env:LOCALAPPDATA\Microsoft\WinGet\Links\databricks.exe" --version
& "$env:LOCALAPPDATA\Microsoft\WinGet\Links\databricks.exe" auth profiles
& "$env:LOCALAPPDATA\Microsoft\WinGet\Links\databricks.exe" warehouses list --profile sam
```

Avoid printing tokens, auth caches or configuration secrets. If OAuth expires, reauthorize with the same explicitly selected profile using the documented browser login flow. No new account signup is currently necessary.

The maintained upstream install path for a fresh machine is `databricks aitools install`; inspect its current help to target Codex/project scope or raw skills. Teammates who clone this repository already receive the pinned raw skill files and should avoid installing duplicate copies with identical names into multiple discovery locations. Each teammate uses their own workspace identity if they need direct Databricks access.

## Public deployment access

Local user OAuth is for development. Railway needs a dedicated scoped OAuth service principal supported by the workspace. Verify this before committing to the public runtime. Store generated secrets directly in ignored local configuration or hosting secrets; never paste them into chat or commit them. Do not deploy the local OAuth cache. No service principal or secret was created in this planning turn.

Free Edition features have [documented quotas and limitations](https://docs.databricks.com/aws/en/getting-started/free-edition-limitations), but the presence of a starter warehouse does not itself prove the account's edition. Inspect actual permissions rather than promising enterprise governance, always-on compute or unrestricted outbound access.
