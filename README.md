# VTHacks 2026

HokieCare repository for a four-person VTHacks 14 team. Primary targets are the Deloitte × Databricks student experience challenge and Impiricus HCP engagement challenge.

**Live demo: [HokieCare](https://vthacks-2026-production.up.railway.app)**

**Status:** the first Databricks-backed application is deployed and verified on Railway. Six VT care resources and 700 New River observations are served by FastAPI to a React frontend. Public HTTPS, data readiness, filters and source suppression passed live checks. Read [deployment evidence](docs/DEPLOYMENT_VALIDATION.md), [run/deploy instructions](docs/OPERATIONS.md), and the [implementation plan](docs/IMPLEMENTATION_PLAN.md).

## Current product

**HokieCare** combines a filterable student care directory with a healthcare-professional trend and editable resource-card workflow. Real public data is imported into Databricks Unity Catalog and queried by the app. Private VT appointment/capacity records are not available. Earlier ExpoFlow and HokieHarvest ideas remain background research.

The existing VT GIS evidence and HokieAccess concept are preserved. Databricks ingestion and SQL reads work; conversational generation, a curated Genie Agent, and forecasting remain next milestones. The current resource card is a sourced template, not AI-generated output. Campus-wide Wi-Fi data, dining operational records, and building controls are unavailable.

**Submission requirements:** September 20, 8:00 a.m. ET; public source repository; working demo/presentation links; four-minute presentation; full team present for judging. The user's full requirements are preserved in the project plan. Repository visibility must be made public before submission; it is currently private.

This is an independent hackathon prototype, not an official Virginia Tech service.

## Planning documents

- [Next-build plan: frontend agent, HCP workflow, scheduling sandbox, and award strategy](docs/PROTOTYPE_EVOLUTION_PLAN.md)
- [Run, test, deploy and operate the app](docs/OPERATIONS.md)
- [Current implementation order and architecture](docs/IMPLEMENTATION_PLAN.md)
- [Verified Databricks workspace and skill setup](docs/DATABRICKS_SETUP.md)
- [HokieCare data feasibility, verified downloads, and limits](docs/HEALTHCARE_DATA_FEASIBILITY.md)
- [Ideas and recommendation](docs/PROJECT_PLAN.md)
- [Expanded food, expo, Wi-Fi, and energy research](docs/EXPANDED_IDEAS.md)
- [Prize priorities and evidence](docs/PRIZE_STRATEGY.md)
- [Accounts and access](docs/SETUP.md)
- [Earlier HokieAccess module build reference](docs/BUILD_PLAN.md)
- [Research sources and verified data](docs/RESEARCH.md)
- [Team workflow](CONTRIBUTING.md)
- [Continuation notes](docs/HANDOFF.md)

## Team

| GitHub account | Repository access |
| --- | --- |
| sam044 | Owner |
| S-Gollu | Write access verified |
| cjf123x | Write access verified |
| andyshah17 | Write access verified |

All three teammates now appear as collaborators with write access. Everyone also needs to join the Devpost submission as a contributor.

No API keys, billing information, student records, or account credentials belong in this repository. `.env.example` documents local and hosted environment variables. The public container uses a dedicated Databricks OAuth service principal; no developer OAuth cache is deployed.
