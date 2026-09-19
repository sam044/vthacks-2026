# Broader project research: food, career fairs, and campus occupancy

September 19, 2026. Planning only. The user rejected the earlier alternatives except HokieAccess, wants broader problems that resonate with companies, and confirmed that the expo idea means career-fair matching, queues, and recruiter follow-up. Preserve the GIS research and HokieAccess as a possible shared module. No final product selection has been made.

## Recommendation

**ExpoFlow + HokieAccess is the strongest choice for an independently working live demo and the Deloitte career-navigator brief.** A recruiter and student can understand the value immediately, and consenting participants can generate real demo events. **HokieHarvest + HokieAccess is the strongest sustainability alternative** and more directly addresses recurring dining operations. Energy and occupancy are credible research directions, but should not be the critical dependency without authorized data access.

| Direction | Widespread problem | Institutional data dependency | Hackathon demonstration | Databricks role |
| --- | --- | --- | --- | --- |
| ExpoFlow | Students spend limited fair time in queues; recruiters lose conversation context | Low for an independent sample fair; official participation and ATS integrations remain separate | Live phone check-in, queue changes, student match, recruiter notes | Event analytics, booth matching features, Genie answers and organizer insights |
| HokieHarvest | Preparing too much wastes food; too little causes stockouts | High for validated forecasts; public menus alone are insufficient | Real operator input plus explicitly simulated history and policy comparison | Preparation/sales/waste tables, forecasts, scenario evaluation, Genie explanation |
| HokieEnergy | Conditioning or lighting underused spaces wastes resources | High: occupancy, meters, schedules, equipment and control permissions | Explainable savings scenarios; optional owned lamp demonstration | Occupancy/energy joins, baselines, anomaly detection, advisory actions |
| Campus availability map | Students cannot easily find available spaces or less crowded services | High for comprehensive automatic sensing; lower for opt-in/manual inputs | Several verified locations with timestamped reports | Zone-level aggregates, freshness and confidence, demand summaries |

These are assessments of feasibility, not measured market demand or winning odds. Choose one flagship workflow; do not build all four products for one four-minute presentation.

## 1. HokieHarvest: prevent dining waste before it happens

**Pitch:** Help Dining Services prepare the right quantities, adjust the next batch, and direct usable surplus to an established recovery workflow.

VT's [waste-minimization page](https://dining.vt.edu/sustainability/waste_minimization.html) documents existing composting and food donation through Campus Kitchen. Its cumulative composting figure combines food and biodegradable packaging; it is not annual edible-food waste. Our proposed improvement is preparation and demand decisions, complementing existing recovery rather than claiming VT has no sustainability program.

### Working product

An operator sees a few dining venues on the campus map, selects a station, and asks: "What should we change for the next meal period?" The agent checks forecasts and recent preparation/sales/waste records, identifies the largest avoidable surplus, and proposes a smaller batch or delayed replenishment. The operator can approve a demo plan and record the actual result.

A student-facing view offers practical value: menu/hours information, available pickup offers approved by staff, and an accessible route to the venue. Any reported crowd level must show its source and freshness. Actual food offers require Dining's participation; sample offers must be explicitly marked as demo data.

### Required data versus accessible data

| Data | Current availability | Use |
| --- | --- | --- |
| Dining locations, published menus/hours | Public pages found; extraction and reuse still need verification | Venue map, menu context and opening hours |
| Item-level prepared and served quantities | No public operational feed verified | Demand and batch forecasting |
| Weighed waste, reason, station, time | No public operational feed verified | Distinguish spoilage, overproduction and plate waste |
| Recipes, yield, per-portion cost | No authorized dataset in this task | Consistent units and estimated cost |
| Inventory and production lead time | Requires operator records | Feasible recommendations |
| Calendar/weather/event signals | Potential public inputs; select and verify during implementation | Contextual predictors, not direct waste measurements |
| Aggregate occupancy | No public VT feed verified | Optional contextual input; not item-level demand by itself |

[VT dining menus](https://foodpro.students.vt.edu/) provide menu context, not kitchen waste records. Databricks can ingest data from an API, file, or our operator-entry form; it cannot obtain private records simply by enabling an agent.

### Databricks and evaluation

Create `production_batches`, `service_sales`, `waste_events`, `menus`, and `forecast_results` tables with source, units, timestamps, and `is_synthetic`. Separate pre-consumer overproduction, spoilage, post-consumer plate waste, donated portions, and packaging. Start with one or two stations and a consistent unit such as portions.

Use a same-weekday/meal baseline, then a small forecasting model only if adequate history exists. Test on later time periods rather than random rows. Compare waste and shortage outcomes together; "cook nothing" cannot win the objective. Include batch size, lead time, shelf life and service-level constraints. Genie explains the computed results and lets the operator investigate them. The forecasting/optimization code performs the numerical work.

If history is synthetic, report forecast and policy results as simulation only. Held-out prediction error does not by itself prove that a changed policy would reduce real waste. A real operational reduction requires a subsequent controlled pilot. Do not invent kilograms saved or assign an unsupported carbon factor.

### Four-minute demo

- 0:00–0:35: Explain excess preparation versus stockouts and show the venue map.
- 0:35–1:25: Enter a real demo batch/waste observation; inspect the sample history.
- 1:25–2:15: Ask Genie why one station is at risk; show its table-backed answer.
- 2:15–3:15: Adjust the next batch and compare waste/shortage scenarios.
- 3:15–4:00: Show the student pickup/access view and explain what needs a Dining pilot.

**Fit:** Deloitte smart campus/campus life, Ut Prosim, UI/UX; DEI only with meaningful access support. ANS could connect a production agent and recovery-capacity agent if access is available. Food handling stays in the existing operator process; AI does not decide safety or invent availability.

## 2. ExpoFlow: make career-fair visits and follow-up useful

**Pitch:** Help students spend their time meeting suitable employers and help recruiters retain the context of those conversations.

The user confirmed this interpretation of "expo heat map and in-person ATS." VT's [Engineering Expo](https://www.sec.vt.edu/expo.html) is a real setting for the concept. The listed 2026 dates are September 15–17, before this hackathon's judging: demonstrate a separate sample fair, not a claim that we are running that completed Expo. [VT career-fair preparation](https://career.vt.edu/resources/career-fair-prep/) already emphasizes preparation and follow-up; our addition is a shared workflow during and after the encounter.

### Student view

- Enter target roles, skills/interests and remaining time; a resume is optional for the MVP.
- See relevant booths, registered queue length, estimated waiting time and the reasons for each match.
- Receive an itinerary that balances relevance, walking time, booth hours and current queue estimates.
- Check in at a booth via QR, leave a queue, and keep private conversation/follow-up notes.
- Explicitly share chosen profile details with a recruiter; a scan alone does not broadcast a resume to every company.

### Recruiter and organizer views

Recruiters scan the student's share code, see that student's consented profile, add private notes, and move the interaction through simple statuses: met, follow-up, interview requested. Export a CSV; real Workday/Greenhouse/other ATS integrations are future work requiring separate access. Matching supports discovery and does not automatically reject candidates or infer sensitive traits.

Organizers see booth demand, waits, staffing bottlenecks and data coverage. Ask Genie: "Which booths have the longest measured waits?" or "Where could another recruiter help?" Small demo volumes should not be represented as campus-wide statistics.

### How the heat map really works

Collect `join`, `leave`, `service_start`, and `service_end` events from participant phones and recruiter controls. Pair each event with a timestamp, booth and anonymous session ID. Reconcile abandoned sessions, reject duplicate joins, and let staff correct counts. A virtual queue works only when staff agree to honor it; otherwise describe the system as check-in analytics with voluntary reporting.

Color **booths by registered demand or reported wait**. Do not label it a map of all people in the room. QR check-ins do not measure everyone standing in a physical line, and time spent near a booth does not equal service time. Mark low coverage or stale data as unknown. Derive wait estimates from recent service durations and active staffing when enough observations exist, with an interval; use an explicit default otherwise.

We can demonstrate this with the team's own phones, several sample booths, and fabricated candidate profiles. Real check-in events and sample employer/role records must have separate provenance. No campus Wi-Fi administration is required.

### Databricks architecture

FastAPI records queue transactions in a small transactional store and pushes updates to the frontend. A single-instance SQLite store with a persistent volume is enough for the demo; use Postgres if deploying multiple instances. This operational store has a distinct role: atomic queue state. Batch or incrementally ingest its event log into Databricks with idempotent event IDs. Publish real ingestion timestamps and measure lag rather than promising instantaneous warehouse updates.

Databricks holds fair/booth catalogs, cleaned event histories, wait distributions and recommendation features. A Genie Agent answers organizer questions over curated aggregate tables; student recommendations use the resulting features plus current queue state. Keep private recruiter notes and resume contents out of shared analytics. Show a real ingested phone event and a subsequent Databricks query during judging.

### HokieAccess integration

Use campus GIS for getting to the fair, accessible entrances and relevant closure notices. A booth map needs a separate floor plan or manually configured sample layout: campus GIS does not locate individual booths or guarantee indoor routes. Keep the campus and booth-map views distinct and clearly labeled.

### Four-minute demo

- 0:00–0:30: Student has limited time; recruiter receives many conversations and loses context.
- 0:30–1:20: Student sets a role goal, sees a recommended booth itinerary and access information.
- 1:20–2:10: Teammate joins a booth on a phone; another finishes service; queue and recommendation update.
- 2:10–3:00: Student shares a profile; recruiter adds a note and saves a follow-up.
- 3:00–4:00: Organizer asks Genie about bottlenecks, sees the real event data, and hears deployment/limitations.

**Fit:** Deloitte career navigator first, UI/UX, DEI through practical access and equitable discovery, optional Gemini, ElevenLabs, ANS and Cloudforce. Career navigation must remain central if using the recruiter-facing workflow for Deloitte. This is an ATS companion, not a full replacement.

## 3. Wi-Fi occupancy: possible, with specific access and limits

### What signals mean

| Signal | What it can support | What it cannot establish alone |
| --- | --- | --- |
| Bytes transferred | Network load | Number of people; one laptop can dominate usage |
| Associated clients per access point | A proxy for nearby device presence | Exact room occupancy or one device per person |
| Controller observations from multiple APs | Estimated device location with calibrated infrastructure | A universally accurate student location or identity |
| Passive probe requests | Partial device activity observations | Complete counts or stable identifiers across devices |
| Opt-in QR or browser location | A voluntary reported location | Coverage of nonparticipants or reliable room/booth precision |
| Purpose-built Wi-Fi sensing/CSI | Potential presence or movement sensing | A capability automatically available in the campus network or a web page |

[University Wi-Fi occupancy research](https://arxiv.org/abs/2104.10667) studies using managed-network metadata to estimate occupancy. This is evidence the approach is technically plausible, not a transferable accuracy guarantee for VT. [Cisco's documentation](https://documentation.meraki.com/Wireless/Operate_and_Maintain/User_Guides/Monitoring_and_Reporting/Location_Analytics) describes infrastructure-based location analytics; VT's vendor and enabled features have not been established here.

Phone operating systems use private/randomized MAC addresses, complicating passive counting and longitudinal identity linkage. This does not make all managed-network occupancy estimation impossible, but it rules out assuming every probe is a unique, persistently identifiable student. [Apple privacy documentation](https://support.apple.com/en-ca/guide/security/secb9cb3140c/web)

### Can our app see every Hokie?

**No.** Joining eduroam does not grant access to controller telemetry or other students' identities. Standard browser networking APIs provide limited connection information, not a list of neighboring campus devices. Even network administrators' records need calibration and do not establish every person's exact physical location. [Browser API](https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation)

For an authorized pilot, request **zone-level counts in time buckets**, an AP-to-zone map, and a small set of manual counts for validation. Exclude names, student IDs, device addresses, and individual movement histories from our app. Include known coverage, reporting latency and suppression rules for sparse zones. Do not assume this data will be available in a 36-hour event.

Hackathon alternative: collect voluntary check-ins or count clients on a team-owned test network with participant consent. That demonstrates the ingestion path, not campus-wide deployment. Do not bypass MAC randomization, scrape devices, or infer named students' movements.

## 4. HokieEnergy: useful occupancy decisions without pretending to control VT

**Pitch:** Identify spaces whose energy schedule does not match actual use, and recommend a change with an explanation and estimated impact.

VT already documents [building automation and energy-reduction programs](https://www.facilities.vt.edu/energy-utilities/energy-reduction-efforts/demand-side-management.html). The useful contribution is detecting persistent mismatches and prioritizing interventions, not presenting automated lighting as new.

Combine occupancy estimates with opening/class schedules, meters, weather and equipment metadata. A Facilities operator sees "this noncritical zone appears unused outside its schedule" and compares candidate schedules. The backend validates a policy, while Genie explains evidence and uncertainty. Actual building control requires a separately approved Facilities integration.

**Zero connected devices does not prove a room is empty.** Real controls need independent presence checks, an uncertainty fallback, grace periods, manual override and exclusions for egress lighting, laboratories and critical equipment. A hackathon demo should simulate building controls or use a team-owned lamp. Do not switch off campus equipment.

Estimate simple lighting savings only from explicit inputs: rated kW × avoided operating hours. Label the result as modeled; campus energy savings require meter readings and an appropriate baseline. HVAC has thermal lag and comfort/ventilation constraints and cannot be represented credibly by the same simple formula.

**Fit:** Deloitte smart campus and Ut Prosim; possible Peraton relevance needs sponsor confirmation. Main risk is unavailable occupancy, equipment and meter data.

## Other useful applications of aggregate occupancy

- Find a study area with recent evidence of available capacity; distinguish a room count from available seats.
- Choose a less crowded dining venue and help staff time replenishment.
- Identify sustained demand for library or service-desk staffing.
- Compare room utilization with schedules to inform future space allocation.
- Understand event crowd distribution; Wi-Fi alone is not an emergency accountability roster.

A general campus-demand layer could support these later. For this event, ExpoFlow's check-ins or HokieHarvest's operator inputs produce a more demonstrable product than promising ubiquitous sensing.

## Built-in Databricks agent

Use a **Genie Agent**, previously called a Genie Space, over well-described tables and tested example questions. Its APIs allow an application to ask questions and retrieve results; workspace permissions and availability still need live verification. [Genie overview](https://docs.databricks.com/aws/en/genie-agents/) · [API documentation](https://docs.databricks.com/aws/en/genie-agents/conversation-api)

Separate data collection, forecasting/calculation, and agent explanation. Genie Code is a development assistant for creating artifacts and is not automatically the deployed end-user agent. Record the configured Genie ID, test representative questions against expected aggregates, and show a real API response. If Genie is unavailable, a Databricks SQL plus Gemini tool workflow remains an honest fallback, but must not be called a built-in Genie integration.

## Next decision and access gates

Prefer ExpoFlow for the live demonstration and direct company relevance. Select HokieHarvest instead if sustainability is the team's priority or Dining provides useful records quickly. Retain HokieAccess and GIS in either case.

Before implementation: obtain the sponsor brief/workspace, test Databricks and Genie access, choose one flagship, and identify which facts will be public, participant-generated, manually entered, or synthetic. No new sensing hardware, university IT integration, or real ATS connection is required for the recommended ExpoFlow MVP.

The user's project requirements control: submit by **September 20 at 8:00 a.m. ET**, public source repository and working demo/presentation links, all four Devpost contributors, all chosen tracks, disclosed outside/pre-event work, and four minutes to present with the full team present during the 10:30 a.m.–1:00 p.m. judging window.
