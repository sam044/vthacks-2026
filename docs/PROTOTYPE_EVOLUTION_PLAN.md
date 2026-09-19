# HokieCare: prototype evolution and award strategy

**Latest scheduling revision:** [Unified appointment hub](APPOINTMENT_HUB_PLAN.md) refines this plan following the user's five-center research request. Build a student calendar and scheduler workspace with initially empty records, persistent backend storage, and explicit demo/request/confirmation states. That document supersedes the process-memory scheduling design below and brings the hub forward in delivery priority. Existing agent, HCP briefing, evidence, and submission guidance remains applicable.

Planning update: September 19, 2026. This document is the current next-build plan, based on the existing repository, the user's latest two sponsor requirements, and `message2.txt`. It supersedes the delivery order in the earlier [implementation plan](IMPLEMENTATION_PLAN.md), while retaining its data architecture and safeguards. This update implements no new application features.

## Product decision

Evolve HokieCare into a **campus care coordination assistant** with two connected experiences:

- Students ask for help, receive sourced service options, and take a concrete next step through the interface.
- Healthcare professionals ask a local-health question, inspect evidence, and create an editable resource brief for a student conversation.

Add a separately labeled **coordination sandbox** to demonstrate time-slot discovery, user-confirmed demo reservations, cancellations, and capacity scenarios. Keep real service facts, district surveillance, external research benchmarks, and simulated appointment activity visibly distinct.

The strongest award submission is a complete student-to-professional workflow with demonstrable tools and evidence. More sponsor logos or disconnected dashboards will not improve that story. Award outcomes cannot be guaranteed.

### Request versus attachment

The user's latest request makes Impiricus and Deloitte × Databricks the primary targets and explicitly asks for an agent on the frontend. The attachment contributes the coordination concept, forecasting ambitions, and privacy narrative. Its assertions about current waits, five isolated systems, unused appointments, and already-enforced privacy are claims to investigate, not verified facts or instructions to access health records.

MongoDB was required in the interrupted earlier message and omitted from the revised request. This plan therefore treats Atlas as an optional extension, not a prerequisite for the two primary tracks. A useful Atlas workload, if restored to scope, is described below.

## What the repository actually has

Baseline inspected: `main` at `c3ffade14cb69396288dcf5efee9b39076b23af4`. The worktree was clean. The public verifier passed again on September 19 at 07:19 UTC against that deployed SHA:

- Six service cards, category/modality filtering, official handoffs, and source timestamps.
- 700 New River observations: 350 ED weeks and 350 urgent-care weeks, ending September 12, 2026. All 64 suppressed combined counts remain unavailable.
- Working Databricks-backed readiness/services/trends routes, input rejection, frontend response, and security header.
- Successful query IDs: services `01f1b3fa-7384-1a32-bcf1-ad01b5f3d968`; trends `01f1b3fa-7490-1531-ac77-e5d4371e1719`.

Code inspection confirms a React interface with `FindCare`, `HealthTrends`, evidence panels, and a deterministic editable/exportable briefing. FastAPI uses fixed bounded SQL, a five-minute public-result cache, and query/rate bounds. There is no agent route, model call, scheduling adapter, appointment state, forecast model, or application user authentication. Previous browser and CI checks are documented in [deployment validation](DEPLOYMENT_VALIDATION.md); this planning turn refreshed HTTP checks, not those browser tests.

The existing hosted identity's restricted gold-view access and denied bronze-table query are useful evidence of service-level least privilege. They do not prove student-versus-scheduler access control.

## Map every promise in message2.txt

| Attachment ambition | Buildable hackathon demonstration | What full real-world implementation still requires |
| --- | --- | --- |
| One coordination screen | Shared service directory, agent actions, HCP brief, and separately labeled scheduling sandbox | Authorized adapters and compatible definitions across participating providers; no evidence establishes that the named services never communicate |
| Point students to the right door | Tool-based search, published constraints, official booking handoff, visible next action | A maintained directory and provider-confirmed eligibility; navigation must not become diagnosis or clinical substitution |
| Pull time slots / schedule | Team-authored slots and atomic demo reservations; real provider mode returns an official handoff until integrated | Authorized availability and booking APIs, authentication, consent, idempotency, cancellation policy, and confirmation reconciliation |
| Predict the rush around exams | Verified calendar overlay and explicit what-if capacity inputs; optional separate district respiratory forecast | Sufficient local service-level demand/capacity history and evidence that calendar predictors improve held-out performance |
| Predict empty appointments | Optional chronological no-show benchmark using the existing external CER research, with aggregate scenario output | Authorized local outcomes, prospectively available features, local calibration, professional review, and prospective evaluation |
| Reuse an empty slot | Demo cancellation releases a slot; another session can reserve it after confirmation | A provider-approved waitlist process; predicted absence alone must never release a booked slot or trigger overbooking |
| Privacy enforced at the data layer | Existing public-view isolation plus a tested scheduler-versus-analyst permission example over synthetic rows | Real identity/role provisioning, provider-specific policies, institutional review, audit/retention controls, and applicable legal review |
| Make existing resources go further | Measure task completion and briefing preparation; report sandbox counts as simulated | Actual utilization/wait-time studies before claiming recovered appointments, staffing savings, or reduced waits |

Do not claim the full attachment is implemented when only these demonstrations exist. The production dependencies are part of the roadmap, not invisible assumptions.

## Priority 1: a frontend agent that acts on the website

Keep the current service cards and charts. Add an accessible assistant panel available in both views, with starter actions such as “Find evening support,” “Show the latest local trend,” and “Help me use this page.” On mobile, use a full-height sheet with keyboard focus management and a clear close action. Always keep ordinary navigation available.

Move page/filter state from isolated components into shared application state. The agent should be able to select the relevant view, set filters, reveal a service card, and propose a valid next step. This directly satisfies the requested website-help behavior.

### Backend and tool contract

Add `POST /api/agent/messages`, backed by a small server-side orchestration loop and an existing Databricks model endpoint. Reuse the hosted OAuth identity, adding only the necessary model permission after verifying it. Discover a suitable endpoint in profile `sam`; prove tool selection, result consumption, and a hosted call before declaring the agent operational. No GPU provisioning or additional model vendor is needed for the first attempt.

| Tool | Grounding / effect |
| --- | --- |
| `find_services(category, modality)` | Reuses validated service retrieval; returns service IDs and citations |
| `get_service_details(service_id)` | Returns published access steps, constraints, audience, verification date |
| `navigate_app(view, category, modality, service_id)` | Produces an allowlisted UI action; frontend applies only supported routes and filter values |
| `get_official_handoff(service_id)` | Produces a verified official destination; user clicks to open it |
| `get_local_trends(facility, weeks)` | Reuses the existing bounded analytics read, including units and provenance |
| `prepare_hcp_brief(topic, audience, evidence_ids)` | Creates a reviewable draft anchored to retrieved records; no sending |
| `get_demo_slots(service_id, date_range, modality)` | Enabled only in explicit sandbox mode; returns simulated slots and expiry/version metadata |

Do not expose arbitrary SQL, arbitrary URLs, shell execution, or arbitrary browser selectors to the model. Refactor reusable data functions out of HTTP handlers so tools and routes use the same validation and service logic.

Return structured `answer`, `citations`, `actions`, `cards`, `data_mode`, and sanitized `tool_steps`. Source URLs and numeric evidence come from validated tool results. A tool-step panel should show the operation, source IDs, time, and result status, not private chain-of-thought. The browser accepts known action types only; a model-produced claim of success cannot change appointment state.

Initial engineering limits: at most four sequential tool rounds, bounded message history/input length, per-session and global inference limits, output-token limits, and a configurable deadline. Measure latency before fixing the release threshold. Handle invalid tool arguments, unavailable models, timeouts, and empty results explicitly. Keep manual service search usable when AI fails.

[Databricks function calling](https://docs.databricks.com/aws/en/machine-learning/model-serving/function-calling) supports tool schemas but documents model-dependent limits; use simple schemas, sequential calls, server-side validation, and an actual multi-turn smoke test. Treat retrieved documents as untrusted evidence. Do not log student free text or enable raw production prompt tracing; inspect serving/gateway logging settings before release. Only team-authored non-identifying cases belong in evaluation traces.

### Student demonstration

1. Ask: “Help me find evening virtual counseling.”
2. The agent queries service facts, switches to Find care, sets the relevant filters, and displays a source-backed result.
3. Ask about combining it with Cook therapy. It cites the published constraint and distinguishes scheduled therapy from TalkNow, without deciding clinical suitability.
4. Click the official next step. If asked for a specific live time, it explains that no scheduling connection exists and offers the official booking channel or the explicitly separate sandbox.

VT currently publishes that concurrent individual Cook therapy and scheduled TimelyCare therapy are restricted; TalkNow is a different service. Preserve that distinction in deterministic card content as well as generated text. [VT TimelyCare](https://ucc.vt.edu/timelycare.html)

## Priority 2: strengthen the Impiricus professional workflow

The existing chart and editable card are a good base, but the HCP should visibly perform a task. Rename the professional entry point to “HCP workspace,” retain the trend view within it, and add:

- A short “What changed?” brief with observation date, report date, geography, exact units, and a link to underlying evidence.
- A scoped question such as “What changed in New River ED respiratory visits, and which campus medical resource can I include?”
- A draft builder with audience, concise/professional tone, supporting sources, and relevant official resource cards.
- A review step where the HCP edits, previews, and explicitly exports a text resource card. Generating a revision must not silently overwrite manual edits.
- Clear separation between observed facts, suggested communication, and missing information. No inferred campus outbreak, mental-health surge, treatment advice, or outreach recipient list.

Use fixed tools for the first complete workflow. A curated Genie Agent over the two public gold views is a later enhancement if creation, permissions, actual query execution, and hosted access all pass. Its SQL/result evidence can appear in an optional panel. Genie is not a prerequisite for calling this a tool-using AI agent, and adding it must not delay the frontend agent.

**Impiricus story:** help a healthcare professional prepare a relevant, sourced conversation more efficiently. Demonstrate engagement through an interactive professional workflow. Do not assume the sponsor considers a student chatbot or a chart alone sufficient. The user's supplied brief is the planning basis; public sponsor details remain TBD.

## Priority 3: a truthful scheduling and coordination sandbox

Add a visible “Demo scheduling” entry with persistent “Simulated appointments; no real booking” labeling. Use fictional service-slot fixtures with explicit `data_origin=synthetic`; do not display invented slots as official Cook, Schiffert, or TimelyCare availability. Real service cards continue to link to their official processes. Schiffert currently directs users to its portal or phone. [Official appointment instructions](https://healthcenter.vt.edu/appointments.html)

Define a scheduling adapter now: `list_slots`, `reserve`, `cancel`, and `get_confirmation`. The sandbox implements these methods. The official-handoff adapter explicitly reports unsupported live availability/booking. A future authorized provider adapter can implement the same contract without redesigning the interface.

A minimal sandbox slot has a slot ID, fictional service, modality, start/end time, `America/New_York` timezone, version, state, and expiry. Reservation records use a random demo-session ID and confirmation ID; no names, emails, symptoms, or health narratives. Keep state isolated per demonstration scenario; two browser sessions can join the same scenario to test conflicts.

Use process-local state with an atomic lock and short expiry for the first single-process demo; show that restart resets the scenario. Do not claim durable or multi-replica booking. A durable transaction store is a production prerequisite, or the optional Atlas extension below.

The model may propose a slot. The user confirms the exact slot in a UI card, then a validated endpoint performs the write. Check session ownership, slot version, availability, expiry, and idempotency; return a conflict if the slot was taken. Only the server's successful reservation response may produce a confirmation card. Canceling requires ownership and an explicit action. Re-query availability after every change.

Acceptance demonstration: search slots → confirm one → second session cannot take the same slot → cancel → slot reappears → second session confirms. Also prove cross-session cancellation is denied and duplicate clicks do not create duplicate reservations. Exporting a calendar file, if added, must retain the demo label and must not imply provider confirmation.

For the HCP view, show aggregate simulated open/booked/canceled slots and a short proposed operational response. Keep the sandbox on its own panel rather than blending these totals into the real New River chart. The synthetic fixture proves application behavior; it is not a source for model performance or campus impact.

## Priority 4: prediction and privacy, with measurable gates

### Predict the rush

There are two different targets. A district respiratory forecast can use the existing VDH series, but cannot predict VT counseling demand or staffing needs. A VT demand forecast requires local operational history that we do not have.

For the hackathon, add a small capacity scenario with explicitly user-assumed weekly requests, available slots, cancellation/no-show assumptions, and a verified campus calendar annotation if time permits. Label exam uplift as an assumption, not a learned effect. Capacity shortfall is `max(0, assumed requests - offered slots)`; it is not an estimated wait time. Never treat a predicted no-show as an actually free slot.

Optional real-data experiment: predict next-week New River ED respiratory-visit percentage using last-week/seasonal baselines and a small lagged regression model. Use chronological holdout and rolling validation, MAE in percentage points, and a dated MLflow report. Fit transforms on training folds, disclose revised-history limitations, and validate interval coverage before showing uncertainty bands. Display observed trends or the named baseline when the learned model does not improve held-out results.

### Predict empty seats

The existing research downloaded an external CER appointment dataset; it is not imported into the production app. A separate research benchmark can explore appointment attendance, using only features available before an appointment, without diagnoses, DOB, outcome reasons, or same-day observed weather. Preserve its source geography and attribution. Booking-created timestamps and stable patient IDs are absent, so do not invent lead-time features or claim patient-disjoint validation.

Use a chronological split and a constant-rate baseline. Evaluate Brier score, calibration, and precision/recall at a disclosed review threshold; accuracy alone is misleading for rare no-shows. Publish aggregate results only. If it fails to outperform the baseline, report that result. It must not score real VT students or cause slot release, overbooking, or messaging. This is lower priority than a working agent and HCP flow.

### Demonstrate the privacy boundary

Keep the public demo on public data and fictional scheduling records. Retain existing gold-view permissions. For the attachment's specific scheduler narrative, create a small project-owned synthetic operational table and aggregate view, then test separate least-privileged identities: the scheduler reads weekly capacity aggregates and is denied detailed rows; an explicitly authorized test analyst can read the synthetic detail. Record both successful and denied queries.

Do not place the privileged analyst credential in the public app, expose permission-test endpoints, or use a browser role switch as authorization. A recorded test is acceptable evidence if the additional identities cannot safely be made interactive. If these permission tests are unfinished, describe the architecture as planned and show only the existing, narrower gold-versus-bronze proof. This is not a claim of compliance or readiness for real student records.

## Implementation map

| Existing location | Planned change |
| --- | --- |
| `frontend/src/main.tsx` | Extract care/HCP views, lift shared navigation/filter state, connect assistant actions; preserve existing cards, table, and source panel |
| `frontend/src/components/AssistantPanel.tsx` (new) | Conversation UI, result cards, suggested actions, accessible loading/error states, sanitized tool activity |
| `frontend/src/components/DemoScheduler.tsx` (new) | Explicit sandbox selection, slot confirmation/conflicts/cancellation, scenario reset |
| `backend/hokiecare/app.py` | Register validated agent/sandbox routes; apply appropriate rate/concurrency limits to new endpoints |
| `backend/hokiecare/agent.py`, `tools.py`, `services.py` (new) | Model adapter, bounded orchestration, allowlisted tools, shared retrieval functions |
| `backend/hokiecare/scheduling.py` (new) | Adapter contract, atomic sandbox transitions, session ownership, idempotency |
| `data/contracts/services.json` | Add explicit capabilities/booking mode and structured constraints; handle `modality=varies` as unknown/mixed rather than silently in-person |
| `evals/` and `tests/` | Agent cases, tool/action validation, scheduling races, grounding, model/data outages, ownership and permission tests |
| `research/healthcare/` | Dated evaluation summaries with data origin and methodology; no private inputs or raw health records |
| `docs/DEPLOYMENT_VALIDATION.md`, `docs/HANDOFF.md` | Record what actually shipped, evidence, limitations, and next step |

Keep React/FastAPI/Railway and Databricks as the analytical system of record. Do not rewrite hosting, add vector search for six service records, or migrate to a different frontend framework. A reproducible data refresh with validation and an explicit freshness state is more valuable than adding another database just for a logo.

## Delivery sequence and stop rules

Planning snapshot was approximately 03:20 EDT on September 19. The user-supplied deadline is September 20 at 08:00 EDT; target submission by 07:00. That gives about 28 hours of wall time, not 28 hours of guaranteed engineering time. Recompute available time when implementation starts.

| Order | Estimated focused effort | Exit gate |
| --- | --- | --- |
| 1. Model/hosted access and shared tools | 1–2 hours | Actual model tool call and follow-up answer work locally and with hosted identity; manual app still works |
| 2. Student agent and UI actions | 2–3 hours | Cited lookup changes page/filters correctly, exposes official next action, and handles unsupported availability |
| 3. HCP assistant and reviewed export | 2–3 hours | Data question → grounded brief → manual edit → export works on public deployment |
| 4. Scheduling sandbox | 2–3 hours | Search/reserve/conflict/cancel flow passes two-session tests and stays visibly synthetic |
| 5. Scenario and permission proof | 1–2 hours | Explicit assumptions and verified allow/deny evidence; no expanded public credentials |
| 6. Optional prediction OR Genie | Up to 2 hours initially | One validated additional capability; stop if access, evaluation, or integration does not pass |
| 7. Reliability, usability, demo evidence | At least 3 hours | Browser/API evaluation, mobile/keyboard checks, regression tests, deployed smoke checks and backup recording |
| 8. Submission and rehearsal | At least 2 hours | Contributor/category checks, authorized public-source publication, working links, four-minute rehearsal |

The core engineering estimate is 7–11 hours before scenarios/polish. Optional work is conditional on remaining time. Freeze optional features by September 19 at 22:00 EDT; freeze features by September 20 at 02:00 EDT, leaving five hours for validation, documentation, recording, and submission. Move those freezes earlier if fatigued or behind schedule.

Cut in this order: external no-show model, district forecast, Genie, calendar enrichment, then the sandbox if it threatens the two primary working flows. A cut feature remains explicitly unfinished; do not claim the attachment's entire vision is complete. Preserve the real frontend agent, HCP review/export, source accuracy, live URL, and submission buffer.

## Evidence that makes the entry competitive

The public [event listing](https://vthacks-14.devpost.com/) names technical execution, innovation, usefulness, and presentation/completeness. The recommendations below are our strategy against those criteria, not extra sponsor rules.

| Target | Evidence to put in front of judges |
| --- | --- |
| Deloitte × Databricks | A student request triggers an actual model/tool flow, Databricks read, visible interface action, and cited next step; inspect the query/tool evidence |
| Impiricus | A professional asks a question, receives relevant sourced context, edits a usable brief, and exports it; explain the intended HCP benefit |
| Technical execution | Public hosted agent, bounded tools, verified numeric answers, honest unavailable states, and a reproducible deployment; include a failed double-booking attempt if sandbox ships |
| Innovation | Service constraints, actionable UI, and professional context in one coherent workflow; explain why a static directory or generic chat window is insufficient |
| Impact/usefulness | Small observed navigation and briefing-preparation study; report participant count, task outcomes, and limitations |
| Presentation/completeness | One end-to-end story, a reliable four-minute demo, visible labels for public/benchmark/synthetic data, and a clear built-versus-future slide |
| Secondary UI/UX / Ut Prosim | Keyboard/mobile operation, accessible chart/table, plain language, and an evidenced student task; check category eligibility before selecting |

Use 20 non-identifying team-authored evaluation cases: six navigation, four HCP/numeric, four ambiguity/unsupported/stale-data, three injection/invalid-tool, and three availability/confirmation cases. Add dedicated deterministic scheduling and authorization tests beyond that set. Release gates: every displayed citation resolves to a retrieved record; every factual number matches evidence; zero fabricated booking confirmations; all ownership and constraint cases pass. Record the actual pass count and model version, not a prospective “accuracy” claim.

If willing testers are available, run a small counterbalanced comparison: find an official service/next step and prepare a sourced brief using the old interface versus the new workflow. Record elapsed time, completion, errors, and whether the source was found. Report sample size and observed results; a few teammates demonstrate usability, not clinical effectiveness or general HCP adoption. Without HCP participants, say that professional validation is pending.

## Four-minute demo and corrected pitch

Suggested positioning: **“HokieCare helps VT students find a clear next step and gives healthcare professionals the local context to guide that conversation.”**

| Time | Demonstration |
| --- | --- |
| 0:00–0:25 | Explain the friction of navigating separate service entry points; identify student and HCP users |
| 0:25–1:20 | Student asks for evening support; agent retrieves facts, changes filters, explains a constraint, and provides the official next step |
| 1:20–2:15 | HCP asks a local-trend question, inspects dates/sources, edits a brief, and exports it |
| 2:15–2:50 | If shipped, demonstrate sandbox slot discovery and confirmed reservation with the synthetic label visible; otherwise show tool failure handling and provenance |
| 2:50–3:25 | Show Databricks data/model contribution, one permission-test result, and actual evaluation evidence |
| 3:25–4:00 | State what works, what needs an authorized VT partnership, and the next validation step |

For Impiricus's user-supplied five-minute pitch option, prepare a separate five-minute version that adds the HCP user, adoption hypothesis, validation plan, and why the professional returns to the tool. Do not overrun the general four-minute judging slot.

The attachment's current “students wait weeks while slots go unused” opening is unsupported by our live operational data. VT's [2024–2025 annual report](https://students.vt.edu/content/students_vt_edu/en/about/_jcr_content/nav-briefs/vtmultitab/vt-items_0/vtcontainer/vtcontainer-content/download_1364104811/file.res/2024-2025%20Annual%20Report.pdf) reports improved waits, so historical numbers must not be presented as today's queue. Neither five named organizations nor their separate websites proves a lack of clinical coordination. Carilion is not currently one of the six verified app records.

Keep the air-traffic-control analogy as a future coordination vision if useful, but say the current product coordinates public information and demonstrates scheduling logic. Replace claims of making doctors more productive with the goal of helping students and professionals find and use existing resources. Quantify improvements only after measuring them.

## Optional Atlas extension and production path

If MongoDB is restored as a target, use Atlas for meaningful application transactions: synthetic slot inventory and atomic reservations with unique identifiers, idempotency, expiry checks, and ownership. Expired holds must be rejected by application logic even before background cleanup. Prove a persisted reservation survives restart and concurrent clients cannot claim the same slot. Do not duplicate VDH analytics merely to claim Atlas usage. Databricks remains the analytical store; only aggregate synthetic workflow metrics would feed an additional demo view. Atlas setup/access is not completed or needed for this plan.

Beyond the hackathon, the full attachment requires a VT/provider partnership: authorized service adapters, institution-provisioned identities, agreed record boundaries, sufficient historical local demand/outcome data, maintained eligibility rules, and a reviewed operational pilot. Start with aggregate exports and read-only live availability. Add provider-confirmed bookings only after sandbox reliability and authorization are established. Evaluate local forecasting/calibration before professional review queues; never free appointments based on risk predictions alone.

No external contact, real booking, new service provisioning, repository visibility change, or application deployment is part of this planning update. Before submission, follow the preserved [Requirements](PROJECT_PLAN.md#requirements), opt into the desired tracks, and publish the source during the authorized publication step. The public listing still leaves the primary sponsors' detailed challenges TBD, so use the supplied briefs and confirm any additional sponsor requirements through the team's event materials.
