# Build and deployment plan

This is a proposed implementation plan, not a statement that the application exists.

## Architecture

Use a React/TypeScript frontend, a Python FastAPI backend, a deterministic graph-routing library, and a map renderer selected after checking VT's GeoJSON and tile options. Build the frontend into the backend's container to keep one public service. Host on a small Vultr VM with Docker and an HTTPS reverse proxy. Pin dependency versions when scaffolding begins.

```mermaid
flowchart LR
  VT[VT GIS and dated facilities notices] --> I[Ingest and record provenance]
  I --> D[Databricks Delta tables and SQL views]
  U[Student web app] --> A[FastAPI agent]
  A --> G[Gemini tool selection and explanation]
  A --> D
  A --> R[Validated route graph]
  D --> V[Staff impact dashboard]
  R --> A
```

### Databricks is part of the actual product

1. Store source snapshots and fetch metadata in bronze tables.
2. Normalize buildings, entrances, route segments, and notices in silver tables. Keep original IDs and source URLs.
3. Produce gold views for destination access summaries and scenario impact.
4. The API retrieves relevant records through the SQL Statement Execution API using bounded, parameterized queries. Do not execute arbitrary model-generated SQL.
5. Show one real application query and its provenance during judging. Include an ingestion notebook/job and SQL artifacts in the repo.

[Databricks SQL API](https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial)

Suggested fields: `source_id`, `source_url`, `retrieved_at`, `published_at`, `effective_from`, `effective_to`, `verification_status`, `is_synthetic`. Use nullable dates where unknown; publication date alone does not establish a closure's current status.

### Agent behavior

The model selects tools for destination lookup, notice retrieval, and route calculation. Tool outputs include IDs, source URLs, and validity information. Backend checks the requested destination and constraints, computes the result, and checks the final structured response. If the data cannot support a route, return an explicit unavailable/unknown result plus the official map and support link. An untrusted webpage or notice cannot authorize new tool permissions.

The dashboard uses sample trips until real, consented data exists. Report measured algorithm results such as route length and reachable destinations. Do not describe samples as live student demand or claim reductions in missed classes.

## Work schedule

The public deadline is September 20 at 10:00 a.m. EDT. The planning pass occurred shortly after midnight September 19, so approximately 34 hours remained at that point. Recheck the actual time before starting and compress these blocks accordingly.

| Block | Deliverable and gate |
| --- | --- |
| First 2 hours | Finalize idea, authenticate Databricks and model, inspect graph connectivity, deploy a basic health page. Pivot/simplify immediately if essential data or access fails. |
| Next 6 hours | Complete the first vertical slice: real data in Databricks → app query → model/tool result → map and sources. |
| Next 8 hours | Add the closure scenario, validated routing outcomes, data freshness, and staff impact view. |
| Next 6 hours | Polish mobile/keyboard UX, test failure paths, validate sample campus paths, measure demo latency. |
| Next 4 hours | Add at most one demanding extension, such as ANS. A small voice feature or HokieAI sidekick can be included only if the core stays stable. |
| Remaining time | Freeze features; verify public deployment, record the demo, prepare Devpost, and rehearse. Aim to submit by 9:00 a.m. EDT for a buffer. |

## Verification that matters

- Routes never cross a closed or unsupported edge; a disconnected graph returns no route.
- Unknown floor access, slope, or operational state is not silently treated as confirmed accessible.
- Date filters handle expired, future, and unresolved notices.
- Source IDs and citations correspond to actual retrieved records.
- Bad model output, rate limits, SQL timeouts, and Databricks quota exhaustion fail clearly.
- Keyboard and phone layouts work; map information also has a text representation.
- Credentials remain server-side. Admin/scenario mutation endpoints require authorization or operate only in an isolated demo sandbox.
- Public HTTPS page and health endpoints work outside the developer machine, and the service survives a container restart.

## Deployment and judging

Provision after account access is ready. Build the container, bind the app behind the reverse proxy, expose only required ports, configure secrets, restart behavior, and a health endpoint. Start with a provider hostname if HTTPS can be provisioned there; otherwise configure the controlled domain. Store deployment instructions and verified live URL in the repo. Confirm the public demo can be reached without a Databricks login.

Keep a dated, labeled snapshot mode and a short recorded demo for internet/API failure. A snapshot demonstrates the fallback; it must not be presented as a live Databricks query.

Three-minute story: show a student's access constraint, explain a sourced baseline route, activate a clearly labeled closure scenario, replan or honestly show unavailable access, then reveal the Databricks-backed staff impact view. Finish with the specific departmental use and known limitations.
