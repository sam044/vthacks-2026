# Continuation notes

## User's intended workflow

**Latest steering:** data-first evaluation of the HokieCare idea in `C:\Users\sam\Downloads\message.txt`; research only. Both Deloitte × Databricks and Impiricus are primary targets. Read [HEALTHCARE_DATA_FEASIBILITY.md](HEALTHCARE_DATA_FEASIBILITY.md) before implementing. It supersedes earlier recommendations as the current research focus, not as an approved final build scope.

Verified local downloads include all 28,700 VDH respiratory aggregate records (700 New River records, 350 weeks), 49,593 external CER appointments, NHS aggregate appointment files, six VT service/appointment pages, VT calendar/report material, NPI provider sample and NASA weather sample. Provenance and profiles are in `research/healthcare/`; raw downloads are ignored. No Databricks import or app implementation exists. Private VT scheduling, availability, swipes and clinical data remain unavailable. Do not infer current VT waits from the 2019 report: the 2024–2025 annual report says waits decreased. VDH's catalog does not specify a reuse license; do not label it CC0.

Build and deploy a VT-focused hackathon project, but begin with brainstorming, research, repository setup, and account preparation. Target Deloitte × Databricks and Impiricus. Use Databricks materially. Paid services are acceptable; no paid resources were created in this planning phase.

Earlier exploration covered food waste, career-fair matching/queues, Wi-Fi occupancy, and energy. ExpoFlow and HokieHarvest were recommendations, not selections. Preserve HokieAccess and GIS research for potential reuse. No final build scope has been selected. Do not treat planning documents as application implementation.

## Completed

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

1. Discuss the researched HokieCare scope and remaining data gaps with the user; obtain any sponsor brief/workspace link. The current request is research, not application implementation.
2. Recheck remaining event time and build-window instructions. The user's deadline is September 20, 2026, 8:00 a.m. ET; target 7:00 a.m. submission. The old public 10:00 a.m. listing is superseded for planning. Public repo access is required before submission; repository is currently private.
3. Authenticate the Databricks workspace, Gemini, and chosen host. Account owner handles sign-in/MFA/billing.
4. Run the selected product's data/auth/deployment gate from EXPANDED_IDEAS.md and BUILD_PLAN.md, then build the first complete flow. No authorized Wi-Fi controller, dining operations, building controls, or external ATS access exists yet.
5. Keep current facts, implementation status, validation results, and live URL updated here.

## Important boundaries

Sponsor details supplied by the user are more specific than the public TBD entries, but organizer acceptance is still unverified. Do not use last year's Deloitte categories. Disclose AI assistance and outside resources. Keep synthetic scenarios separate from official notices and never infer that a published notice means an outage is still active.

No Databricks, model, hosting, ANS, or HokieAI account has been verified in this task. The GitHub CLI was not on PATH; normal Git credentials work, so avoid asking the user to log in again unnecessarily. Never print credentials while using them.
