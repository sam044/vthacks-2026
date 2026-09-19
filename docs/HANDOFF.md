# Continuation notes

## User's intended workflow

**Latest steering:** the user has asked to begin building HokieCare, starting with architecture, implementation planning and Databricks AI Dev Kit skill setup. They explicitly selected the existing `sam` workspace. Both Deloitte × Databricks and Impiricus are primary targets. Read [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), [DATABRICKS_SETUP.md](DATABRICKS_SETUP.md), and [HEALTHCARE_DATA_FEASIBILITY.md](HEALTHCARE_DATA_FEASIBILITY.md).

Verified local downloads include all 28,700 VDH respiratory aggregate records (700 New River records, 350 weeks), 49,593 external CER appointments, NHS aggregate appointment files, six VT service/appointment pages, VT calendar/report material, NPI provider sample and NASA weather sample. Provenance and profiles are in `research/healthcare/`; raw downloads are ignored. No Databricks import or app implementation exists. Private VT scheduling, availability, swipes and clinical data remain unavailable. Do not infer current VT waits from the 2019 report: the 2024–2025 annual report says waits decreased. VDH's catalog does not specify a reuse license; do not label it CC0.

Build and deploy a VT-focused hackathon project, but begin with brainstorming, research, repository setup, and account preparation. Target Deloitte × Databricks and Impiricus. Use Databricks materially. Paid services are acceptable; no paid resources were created in this planning phase.

Earlier exploration covered food waste, career-fair matching/queues, Wi-Fi occupancy, and energy. ExpoFlow and HokieHarvest were recommendations, not selections. Preserve HokieAccess and GIS research for potential reuse. HokieCare now has the active implementation plan. Do not treat planning documents as application implementation.

## Completed

- Created the HokieCare architecture and staged implementation plan: React/TypeScript + FastAPI, Databricks data/SQL/model/Genie/evaluation, Railway public hosting. No app scaffold or deployment exists yet.
- Installed all 31 stable official Databricks skills under `.agents/skills`, with upstream license/notice, exact commit and 311 file hashes. The user-supplied AI Dev Kit README now points to this maintained upstream. No additional MCP server was installed; CLI access is usable.
- Verified existing Databricks CLI v1.17.0, valid `sam` OAuth identity, visible catalogs, one stopped serverless SQL warehouse, 11 READY model endpoints and an empty Apps listing. Query/inference, object-creation rights, Genie and external hosting OAuth remain untested. User's workspace selection persists and does not need repeating.
- Read the attached prize list and the user's detailed company briefs.
- Researched current event rules, VT problems/data, Databricks constraints, ANS, and hosting.
- Verified GitHub identity `sam044` through both the connector and existing Git credentials.
- Created private repository `https://github.com/sam044/vthacks-2026`.
- Sent write invitations to `S-Gollu`, `cjf123x`, and `andyshah17`; subsequently verified all three as collaborators with write access.
- Prepared planning, source, account, workflow, and build/deployment documents.
- Queried public VT GIS metadata/counts successfully; no routing implementation exists.
- Committed and pushed the planning files to `main`; verified remote branch and local Markdown links.
- Read the user's new Requirements block in PROJECT_PLAN.md and preserved it verbatim while revising the surrounding plan. Deadline is now September 20 at 8:00 a.m. ET; public source repo, all contributors and selected prize tracks, working demo/presentation links, and four-minute full-team judging apply.
- Researched broader ideas in EXPANDED_IDEAS.md, including the limits of Wi-Fi sensing, required operational data, Genie integration, and feasible live demos.

## Next

1. Implement the first milestone from IMPLEMENTATION_PLAN.md: core data import and a real service/trend query. Preserve the confirmed `sam` destination. The current turn delivered planning and tooling setup; no application exists yet.
2. Recheck remaining event time and build-window instructions. The user's deadline is September 20, 2026, 8:00 a.m. ET; target 7:00 a.m. submission. The old public 10:00 a.m. listing is superseded for planning. Public repo access is required before submission; repository is currently private.
3. Verify SQL and model calls, schema/Volume permissions and hosted service-principal OAuth in the selected workspace. Obtain Railway account/repository access; account owner handles sign-in/MFA/billing. No separate LLM key is required initially.
4. Deploy the first real read flow, then add the student navigator and HCP briefing/Genie interaction. Add one district forecasting experiment only after that core works. No private VT appointment, Wi-Fi or clinical integration exists.
5. Keep current facts, implementation status, validation results, and live URL updated here.

## Important boundaries

Sponsor details supplied by the user are more specific than the public TBD entries, but organizer acceptance is still unverified. Do not use last year's Deloitte categories. Disclose AI assistance and outside resources. Keep synthetic scenarios separate from official notices and never infer that a published notice means an outage is still active.

Databricks OAuth and resource listings are verified; inference and hosting access are not. ANS/HokieAI remain out of the core. The Databricks CLI and GitHub CLI are not discoverable on the inherited PATH; use the Databricks location in DATABRICKS_SETUP.md and `C:\Users\sam\AppData\Local\VTHacksTools\bin\gh.exe` for GitHub. `gh auth status` verified `sam044` keyring authentication in this turn. Normal Git credentials work. The GitHub connector returned 404 during the earlier research turn, so use the authenticated CLI for PR operations. Do not repeat login requests or claim a PR exists without evidence. Never print credentials.
