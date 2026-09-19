# Project choices

Research updated: September 19, 2026, after team feedback. Rankings are engineering judgment, not predictions of winning. The user supplied the detailed sponsor briefs; several public Devpost sponsor descriptions remain TBD.

# Requirements

Submit one project per team by Sunday, September 20 at 8:00 AM ET. Every team member must have a Devpost account and be listed as a contributor. Include a clear project description, an accessible public source-code repository, and working demo or presentation links. Clearly identify libraries, frameworks, open-source code, and any work created before the hacking period. Select every prize category you want to enter. Offline judging runs Sunday from 10:30 AM to 1:00 PM ET; teams will receive presentation assignments and will have four minutes to present. The full team must be present for judging.

## Current direction after team feedback

Keep HokieAccess and the verified GIS research. The user wants a broader problem with an intuitive company-facing presentation, and has confirmed that the expo concept means career-fair matching, queues, and recruiter follow-up. Earlier HokieBridge, HokieLaunch, and HokiePulse alternatives are no longer active candidates.

The new recommendation is **ExpoFlow + HokieAccess** for the strongest live demonstration and Deloitte career-navigator fit. **HokieHarvest + HokieAccess** is the strongest sustainability alternative. Wi-Fi occupancy and energy optimization remain conditional on data access; there is no verified public VT occupancy feed or permission to control campus equipment. The user has not selected a final product.

Read [Expanded ideas and feasibility research](EXPANDED_IDEAS.md) for the food-waste workflow, expo/ATS companion, Wi-Fi feasibility, energy use cases, data requirements, Databricks Genie architecture, and four-minute demos.

The requirements above are user-supplied and authoritative for this plan: use the September 20 **8:00 a.m. ET** deadline and a public source repository. The earlier 10:00 a.m. deadline found online is superseded for our work. Target submission by 7:00 a.m. ET to leave a buffer.

## HokieAccess retained as a navigation module

**Retained capability.** Serve students with mobility constraints, visitors, and students temporarily using crutches; give Facilities and accessibility staff a view of where disruptions create the largest access problems.

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

**Main risk:** GIS linework might not form a usable routing graph. In the first two implementation hours, validate representative paths and data joins. If it fails, deliver a building access and disruption advisor with official map handoff; remove turn-by-turn routing claims. If that version lacks enough demo value, keep only venue access information and focus implementation on the selected flagship workflow.

**Prize fit:** Deloitte × Databricks first; DEI, Ut Prosim, UI/UX, Gemini, and Vultr naturally support the same product. Voice and ANS are conditional extensions. Peraton is only a possible fit after sponsor clarification; this prototype is not an emergency-response system.
