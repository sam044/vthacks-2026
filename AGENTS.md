# HokieCare project guidance

Read `docs/IMPLEMENTATION_PLAN.md`, `docs/DATABRICKS_SETUP.md`, and `docs/HANDOFF.md` before substantive work. Preserve the user's Requirements block in `docs/PROJECT_PLAN.md`.

The selected product is HokieCare: a sourced VT student service navigator and an HCP-facing local health briefing. Primary sponsors are Deloitte × Databricks and Impiricus. Start with real data import and one complete deployed read flow. Existing research is not an implemented application; update status with evidence as work completes.

## Databricks

- Use project skills in `.agents/skills`, beginning with `databricks-core` and the relevant product skill. The user explicitly selected OAuth profile `sam` on September 19, 2026; use `--profile sam` for this target and do not request the same selection again. A changed workspace needs a new explicit selection.
- CLI v1.17.0 was verified at the Windows WinGet Links path documented in setup. Use that path if the inherited shell PATH is stale.
- All data/resources must live in project-owned objects. The proposed namespace is `workspace.hokiecare`; check existence and permissions before creating or modifying it. Do not edit `samples`, `system`, or unrelated user assets.
- Do not treat a listed warehouse or READY endpoint as proof that a query/inference succeeded. Record the actual checks.
- Keep secrets server-side and untracked. Never print auth caches or tokens. Local OAuth and unattended hosting OAuth are different setup steps.

## Data and product integrity

- Retain real source geography, reporting dates, provenance and reuse caveats. VDH district data is not a VT student dataset; suppressed counts are not zero. CER/NHS are external benchmarks only.
- Use factual VT resource summaries with citations. Published care options do not establish live appointment availability or clinical interchangeability.
- No private medical records, individual crisis scoring, campus tracking, autonomous clinical decisions or external messages are part of the MVP. HCP drafts remain user-editable and are not sent automatically.
- Public demo uses public data. A role/view switch is not an access-control demonstration. Avoid collecting or persisting student health narratives; evaluation uses non-identifying team-authored cases.
- Preserve earlier GIS/HokieAccess research for optional later use.

## Workflow

- Inspect Git status/diffs; preserve unrelated user changes. Use `codex/` branches and avoid force-pushes or destructive resets.
- Complete authorized work and verify the relevant data, API and browser behavior before reporting success. Run checks proportionate to the change.
- Commit and push validated project work for teammates unless the user asks to keep it local. Verify the remote SHA. Do not change repository visibility until the authorized submission/publication step.
- Keep account access, imported data, implemented features and deployment status distinct in the handoff. No unnecessary new services or sponsor integrations.
