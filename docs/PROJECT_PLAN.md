# Project choices

Research date: September 19, 2026. Rankings are engineering judgment, not predictions of winning. The user supplied the detailed sponsor briefs; several public Devpost sponsor descriptions remain TBD.

## 1. HokieAccess: campus access and disruption agent

**Recommendation.** Serve students with mobility constraints, visitors, and students temporarily using crutches; give Facilities and accessibility staff a view of where disruptions create the largest access problems.

A student asks, "I need step-free access to this building before class. What do the current notices change?" The agent retrieves map and disruption records, calls a deterministic route tool, and returns a sourced plan with visible uncertainty. A staff screen compares a baseline with a clearly marked simulated closure and shows affected destinations and extra travel distance.

### Why this has substance

VT already has an access map. Our proposed contribution is linking that geographic information to dated notices, individual trip constraints, explicit evidence, and impact analysis. We should show this difference in the demo instead of claiming to invent campus mapping.

Read-only probes of VT's public ArcGIS service returned 1,559 route features, 583 accessible-entrance features, and 230 elevator features. Counts are records, not a claim of complete coverage or current physical accessibility. Route connectivity, floor transitions, operational status, and freshness still need validation. [GIS source](https://arcgis-central.gis.vt.edu/arcgis/rest/services/vtcampusmap/Accessibility/MapServer)

VT's [Facilities notices](https://www.facilities.vt.edu/campus-impacts.html) list access disruptions. A listing is evidence of a published notice, not proof the disruption remains active.

### Small enough to finish

- Cover approximately five verified buildings and a connected outdoor corridor first.
- Offer destination/constraint inputs plus natural-language requests.
- Show the map, source links, notice dates, and what is unknown.
- Compute paths from verified graph edges; the language model never invents geometry.
- Demonstrate one baseline trip, one closure replan, and one no-supported-route outcome.
- Provide an impact dashboard using labeled sample trips, not invented real student demand.
- Export a trip summary or calendar reminder; link to official support/reporting forms.

**Main risk:** GIS linework might not form a usable routing graph. In the first two implementation hours, validate representative paths and data joins. If it fails, deliver a building access and disruption advisor with official map handoff; remove turn-by-turn routing claims. If that version lacks enough demo value, choose HokieBridge before expanding implementation.

**Prize fit:** Deloitte × Databricks first; DEI, Ut Prosim, UI/UX, Gemini, and Vultr naturally support the same product. Voice and ANS are conditional extensions. Peraton is only a possible fit after sponsor clarification; this prototype is not an emergency-response system.

## 2. HokieBridge: basic-needs resource navigator

**Best lower-risk alternative.** Serve the Dean of Students and The Market by helping a student turn food, transport, equipment, or financial-support needs into an actionable plan.

Example: "I need groceries this week, have no car, and don't know which program I can use." The agent checks sourced access requirements and published schedules, distinguishes drop-in support from enrollment programs, and creates a short next-step list. The department demo shows gaps in service coverage using clearly labeled sample needs.

This addresses a documented issue: VT reports nearly one in six students affected by food insecurity. [VT food security](https://dos.vt.edu/food_security.html) Public program information distinguishes immediate access options from programs with limited capacity. [The Market programs](https://foodaccess.vt.edu/programs.html)

**Databricks:** resource directory, source snapshots, normalized hours and access requirements, matching queries, and service-gap analytics. **Risks:** stale hours and overstating eligibility; no automatic benefit decisions. **Prize fit:** Deloitte campus life, Ut Prosim, DEI, UI/UX, Gemini, and optionally ElevenLabs. Nessie could support a sandbox cash-flow feature, but this is extra scope.

## 3. HokieLaunch: career-fair action planner

Serve Career and Professional Development. Combine a student's interests, a public or sponsor-provided employer/event dataset, preparation resources, and available time into a prioritized fair plan and follow-up checklist.

Include practical access to preparation, such as [Career Outfitters](https://career.vt.edu/channels/career-outfitters/). Use Databricks for employer/event normalization, matching, and transparent explanations of recommendations. Demo a change of goal or time budget that changes the plan.

**Strength:** exceptionally direct fit to Deloitte's career-navigator brief. **Risks:** crowded idea space and authenticated Handshake data. Do not assume API access, scrape private profiles, or promise live job availability. MVP uses public or explicitly supplied data and synthetic student profiles.

## 4. HokiePulse: campus disruption intelligence

Serve Facilities and campus operations with an agent that explains how a dated closure affects buildings and services, consolidates supporting notices, and compares operational scenarios. This is the staff-facing part of HokieAccess developed as a standalone product.

**Strength:** strongest departmental analytics story. **Risk:** weaker student-facing demo and a temptation to invent occupancy or traffic data. Use explicit scenarios and public notices; do not claim forecasting accuracy without evidence. Good Deloitte smart-campus fit; Peraton fit requires sponsor confirmation.

## Decision

Proceed with HokieAccess as the proposed direction, contingent on the initial routing/data gate and the user's selection. Keep HokieBridge as the fast pivot. Do not combine all four ideas into one product.
