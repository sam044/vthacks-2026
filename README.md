# VTHacks 2026

HokieCare repository for a four-person VTHacks 14 team. Primary targets are the Deloitte × Databricks student experience challenge and Impiricus HCP engagement challenge.

**Status:** build planning and Databricks tooling setup complete. Existing workspace OAuth access is verified and 31 official Databricks skills are installed. Application implementation, data import and deployment have not started. Read the [implementation plan](docs/IMPLEMENTATION_PLAN.md) and [verified setup](docs/DATABRICKS_SETUP.md).

## Current product

**HokieCare** combines student care navigation with a healthcare-professional briefing and resource-card workflow. The user has asked to begin building, starting with the plan. Public VT service pages and New River respiratory records are accessible; private VT appointment/capacity records are not secured. Earlier ExpoFlow and HokieHarvest ideas remain background research.

Preserve the existing VT GIS evidence and HokieAccess concept. Databricks data processing, analytics, and a Genie Agent are proposed core components. Campus-wide Wi-Fi data, dining operational records, and building controls are not available to this project at present.

**Submission requirements:** September 20, 8:00 a.m. ET; public source repository; working demo/presentation links; four-minute presentation; full team present for judging. The user's full requirements are preserved in the project plan. Repository visibility must be made public before submission; it is currently private.

This is an independent hackathon prototype, not an official Virginia Tech service.

## Planning documents

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

No API keys, billing information, student records, or account credentials belong in this repository. `.env.example` contains placeholders for the proposed architecture, not an implemented application configuration.
