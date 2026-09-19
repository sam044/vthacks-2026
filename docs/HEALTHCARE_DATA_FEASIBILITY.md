# HokieCare: data feasibility and recommended scope

Research and access checks: September 19, 2026. This evaluates the idea in the user's `message.txt`; it does not authorize or begin application implementation. Primary prize targets are Deloitte × Databricks and Impiricus, using the briefs the user supplied.

## Decision

**Enough real data exists for a VT care-navigation agent and a healthcare-professional planning assistant. Public data does not currently support a live VT appointment-capacity optimizer or a validated VT no-show model.**

The strongest local analytical source is Virginia Department of Health (VDH) respiratory surveillance. We successfully downloaded all 28,700 public aggregate records through its official API, including 700 New River district records spanning 350 weeks. Pair this with current VT service information and a provider directory. Frame the professional experience as an evidence-backed local health briefing and resource-navigation workflow. This is an engineering recommendation, not confirmation of sponsor eligibility or clinical usefulness.

An external real appointment dataset is also available for a separate scheduling-method demonstration. It must retain its real geography and population. Renaming Brazilian or English clinics as Schiffert/Cook would misrepresent the evidence.

## What was actually accessed

All checks below ran without account credentials or paid access. Raw downloads remain in ignored `data/raw/healthcare/`; the repository contains research scripts, source URLs, checksums, and aggregate profiles. Access is verified locally, **not yet from a Databricks workspace**.

| Source | Verified access and coverage | What it supports | Critical limitation |
| --- | --- | --- | --- |
| [VDH respiratory visits](https://www.vdh.virginia.gov/epidemiology/respiratory-diseases-in-virginia/data/emergency-visits-for-respiratory-illness/) | Complete API response: 28,700 rows; New River: 700 rows, 350 weeks, Jan 4, 2020–Sep 12, 2026 | Local illness trends; evaluation of a district-level forecasting method; HCP briefing | ED/urgent-care activity, not VT students, Schiffert demand, or available appointments |
| [VT health and support websites](https://ucc.vt.edu/) | Six service/appointment pages downloaded across Cook, Schiffert, TimelyCare, Wellness, and SSD | Cited service directory and navigation rules | No live queue, slot, referral-status, or utilization feed |
| [VT academic calendar](https://www.registrar.vt.edu/dates-deadlines/academic-calendar.html) | Official HTML downloaded | Term dates, exams and breaks for dated campus context | Calendar correlation with care demand remains unproven |
| [CMS NPI Registry API](https://npiregistry.cms.hhs.gov/api-page) | Blacksburg query returned 20 provider records, capped at 20 | Public provider identities, taxonomy and practice-location discovery | Sample, not complete directory; no availability, insurance acceptance, or appointment booking |
| [NASA POWER](https://power.larc.nasa.gov/docs/services/api/) | 30 days × 2 parameters for Blacksburg, Sep 2025; no missing values | Historical temperature and precipitation context | Gridded retrospective estimates, not a campus sensor or future forecast |
| [CER appointment no-shows](https://data.mendeley.com/datasets/wm6w2fvkfj/1) | CSV downloaded and fully parsed: 49,593 rows, 26 columns, Jun 20, 2016–Feb 25, 2022 | Real external no-show benchmark | Brazilian rehabilitation service; not representative of VT |
| [NHS GP appointments](https://digital.nhs.uk/data-and-information/publications/statistical/appointments-in-general-practice/july-2026) | Three files downloaded; national CSV fully parsed: 53,622 aggregate rows over 30 months | External activity/attendance analytics and forecasting benchmark | England; observed appointment activity is not unmet demand or capacity |
| [VT Student Affairs 2024–2025 report](https://students.vt.edu/about/reports.html) | PDF downloaded; relevant claims read in official report | Current institutional context and annual summary metrics | Annual narrative, not a training dataset or measured current queue |

### 1. Virginia respiratory data: best local analytical foundation

The [official VDH page](https://www.vdh.virginia.gov/epidemiology/respiratory-diseases-in-virginia/data/emergency-visits-for-respiratory-illness/) links a public-use dataset on Virginia's CKAN portal. Its CSV URL returned HTTP 403 here, but the portal's documented public data-store API returned the full dataset without authentication. This is a working import route, not just a dashboard link.

- [Dataset metadata API](https://data.virginia.gov/api/3/action/package_show?id=detailed-emergency-department-visits-public-use-dataset)
- [Records and field dictionary API](https://data.virginia.gov/api/3/action/datastore_search?resource_id=4f94deaa-a8fb-431c-bd73-e5705418f81a&limit=1)
- Resource ID: `4f94deaa-a8fb-431c-bd73-e5705418f81a`. For this snapshot, `limit=32000` returned all 28,700 rows, checked against `result.total`. Future ingestion must paginate rather than assume this limit remains sufficient.

**Actual schema:** week ending, report date, health district/region, facility type, county FIPS, year/week, four respiratory-visit count measures and four percentage measures. The data snapshot is dated September 15; portal metadata was modified September 17. The actual earliest week is January 4, 2020, despite catalog prose saying March 2020. Preserve this discrepancy in provenance and inspect early-period completeness before model training.

New River covers Montgomery County as well as neighboring jurisdictions, according to the [district's official site](https://www.vdh.virginia.gov/new-river/). The subset contains exactly one row per week and facility type: 350 ED and 350 urgent-care observations. All its county-FIPS values are null: **do not present these as Montgomery-only or campus-level observations**.

The download contains suppression markers. New River has 600 `*` cells across count columns, including 64 in combined respiratory counts; the percentage columns are numeric in this snapshot. Keep suppressed counts null with a suppression flag. Do not reconstruct hidden counts from percentages. Region totals and district rows overlap; never sum both. Combined respiratory measures should not be replaced with a naive sum of disease columns.

**Reuse:** VDH explicitly describes the data as available for use/download, but CKAN says `License not specified`. Record that accurately; do not label it CC0 or claim a verified redistribution license. Use attributed derived trends and retain the source link. Bulk republication/commercial licensing remains unresolved.

**Proposed target:** next-week New River ED respiratory-visit percentage, evaluated against last-week and seasonal baselines using rolling time splits. This predicts that published district metric only. Reporting delay and revisions mean a retrospective evaluation must state that historical as-of snapshots were not obtained; it is not a fully reconstructed live backtest. VT exams and weather are optional candidate context, not assumed causal drivers.

### 2. VT service knowledge: real, immediately useful

Downloaded: [Schiffert appointments](https://healthcenter.vt.edu/appointments.html), [Cook homepage](https://ucc.vt.edu/), [Cook appointments](https://ucc.vt.edu/appointment.html), [TimelyCare student services](https://ucc.vt.edu/timelycare.html), [Hokie Wellness](https://hokiewellness.vt.edu/), and [SSD](https://ssd.vt.edu/), plus the calendar and reports index: eight VT HTML pages overall. These support factual fields such as service purpose, audience, modality, appointment link, contact, source URL and last verification time.

A crucial routing constraint: VT's TimelyCare page says students cannot receive concurrent individual Cook therapy and ongoing scheduled TimelyCare therapy. It lists up to 12 scheduled counseling visits per academic year. A capacity optimizer cannot treat every service as freely interchangeable or send students to teletherapy simply because another queue appears long. Student navigation should explain published options and hand off to official booking channels; clinical eligibility and care decisions remain with the service.

Public HTML is not an open license for copying an entire site. Build a small, paraphrased factual directory with citations; do not publish scraped pages, photographs, branding, or a wholesale mirrored corpus. Check changing hours and eligibility before the demo. We have not verified a machine-readable Carilion/VT Roanoke eligibility or referral integration, so it is not a verified core dependency.

### 3. CER: a real no-show dataset, with useful limitations

[Salazar's Mendeley release](https://data.mendeley.com/datasets/wm6w2fvkfj/1), DOI `10.17632/wm6w2fvkfj.1`, is licensed CC BY 4.0. Credit the author/source, link the license, and identify transformations. The downloaded checksum matches the publisher's file metadata.

Our full-file profile found 4,832 `yes` no-shows and 44,761 `no` outcomes: **9.74% in this dataset**, not a VT estimate. Fields include appointment date/time, specialty, outcome, age, diagnoses, and weather. Specialty is blank in 7,454 rows; age in 10,350; ICD in 38,876. No malformed rows were detected by the CSV parser.

Use only a minimized feature set. Exclude no-show reason because it is known after the outcome. Same-day observed weather is future information when predicting before the appointment; use lagged information available at prediction time. There is no booking-created timestamp or stable patient ID among the 26 headers, so booking lead time and reliable patient-disjoint evaluation are unavailable. Do not reconstruct identity from DOB or diagnoses. Use chronological evaluation and disclose possible repeated-patient overlap. The pandemic and partial years further limit generalization.

This is optional technical evidence, not the local problem's foundation. It cannot establish that reminders, overbooking, or rerouting improve outcomes. Prefer aggregate scheduling scenarios to individual intervention decisions.

### 4. NHS: stronger aggregate scheduling fields, weaker local fit

The [July 2026 release](https://digital.nhs.uk/data-and-information/publications/statistical/appointments-in-general-practice/july-2026) supplies national, regional and daily aggregates. Downloaded files total about 65 MB. National data has status, professional type, mode, setting, context, category and appointment count. Regional/daily data adds booking-to-appointment time bands and location codes.

The daily ZIP has 30 monthly CSVs plus a coverage CSV, about 1.31 GB uncompressed. We completely parsed July and June: 366,950 and 351,990 aggregate rows, respectively. Regional ZIP: 36 CSV members; first two fully parsed. Remaining ZIP members have been inventoried, **not fully row-validated**. National CSV was fully profiled. Counts of rows are not counts of appointments: sum the count field within a defined grain, and do not append overlapping national/regional/daily releases as independent events.

Reuse follows the [NHS terms and Open Government Licence](https://digital.nhs.uk/about-nhs-digital/terms-and-conditions), including attribution, exclusions, and no implied endorsement. These are retrospective recorded activities, with unknown statuses, not individual patient records or the total clinical workload. Use as an external benchmark only.

### 5. Provider directory and weather

[CMS NPPES](https://www.cms.gov/medicare/regulations-guidance/administrative-simplification/data-dissemination) makes specified provider information public. Our unauthenticated [Blacksburg API query](https://npiregistry.cms.hhs.gov/api/?version=2.1&city=Blacksburg&state=VA&limit=20) returned 20 results. Retain NPI, provider type/taxonomy, practice address and source-update metadata. Prefer location-purpose addresses over mailing addresses; do not treat an NPI as verified licensure, willingness to accept students, or permission to message the clinician. Validate shortlist entries against providers' own service pages before recommendation. Complete geographic/taxonomy pagination has not been done.

[NASA POWER's daily API](https://power.larc.nasa.gov/docs/services/api/) returned temperature (`T2M`, Celsius) and precipitation (`PRECTOTCORR`, mm/day) for 30 September 2025 dates at approximately 37.2296, -80.4139. Preserve its local-solar-time convention and `-999` missing marker. It is modeled/gridded historical weather with publication delay, not a future forecast. A month proves API access, not sufficient forecasting history. Follow [NASA's data-use/citation guidance](https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy).

## Important data that is not available to us

| Needed data | Research result | Consequence |
| --- | --- | --- |
| Schiffert/Cook appointment histories, live slots, staffed hours, cancellations and waitlists | No public operational export/API found; no authorized account integration | Cannot estimate VT no-show rates, available capacity, recovered slots or actual wait reductions |
| TimelyCare utilization and referral completion | Public service descriptions, not an accessible usage feed | Cannot claim cross-service closed-loop tracking |
| Recreation/dining swipes, campus Wi-Fi locations | No authorized access; unnecessary for the proposed core | Omit from student-health inference and from the hackathon dependency list |
| [CCMH appointment/counseling data](https://ccmh.psu.edu/request-data) | Formal request and data-use agreement; 2–4 weeks initial review, typically another 2–4 weeks after approval; independent researchers charged $500 plus possible cleaning fees | Strong research relevance, unusable as a 36-hour dependency; no request submitted |
| [Healthy Minds microdata](https://healthymindsnetwork.org/research/data-for-researchers/) | Request form required; public reports/interface available | Reports can support dated prevalence context; survey microdata is not secured and is not scheduling data |
| Current VT service-fragmentation burden | No measured handoff-failure or time-to-find-care dataset obtained | Treat improvement as a hypothesis; measure navigation task completion in a small usability study later |

For a future authorized VT partnership, start with aggregate weekly exports: service/modality, booked/attended/no-show/canceled counts, offered and staffed slots, appointment duration, booking lead-time bands, reporting interval and suppression rules. A forecast needs sufficient history and consistent definitions; a capacity estimate needs offered slots/staffed hours, not just headcount. No student identifiers, diagnoses, clinical notes or exact DOB are needed for that first export. Public-information searches are not a substitute for institutional authorization.

## Corrections to the attached idea

1. **The 2–3-week gaps and 37% dissatisfaction are historical.** They appear in the [March 2019 task-force report](https://students.vt.edu/content/students_vt_edu/en/about/reports/_jcr_content/content/vtcontainer_234021403/vtcontainer-content/download_1936365224/file.res/Mental%20Health%20Task%20Force%20Recommendation%20Report.pdf), not a current wait-time dataset. The 12% and 18% figures describe different service/survey measures; subtracting them is not a defensible untreated-population estimate. The national utilization-growth comparison is also historical.
2. **Newer evidence changes the story.** VT's [2024–2025 annual report, printed page 6](https://students.vt.edu/content/students_vt_edu/en/about/_jcr_content/nav-briefs/vtmultitab/vt-items_0/vtcontainer/vtcontainer-content/download_1364104811/file.res/2024-2025%20Annual%20Report.pdf) reports reduced waits and an average 7.7 Cook sessions versus a 5.7 national comparison. It does not publish today's queue length. Do not pitch an unchanged 2019 crisis as a verified 2026 fact.
3. **Routing versus staffing is a hypothesis.** Headcount does not establish FTE, slots, workload, or the cause of access problems. A cancellation policy does not establish a 15% no-show rate. Simulated savings must remain assumptions, not measured impact.
4. **Privacy regimes depend on the record and institution.** [HHS guidance](https://www.hhs.gov/hipaa/for-professionals/faq/does-ferpa-or-hipaa-apply-to-records-on-students-at-health-clinics/index.html) explains that FERPA-covered student education/treatment records are excluded from HIPAA's definition of protected health information. Do not claim every record falls under both, or that catalog tags establish compliance.
5. **The full Databricks stack is not guaranteed free.** [Current Free Edition limitations](https://docs.databricks.com/aws/en/getting-started/free-edition-limitations) include quotas, constrained outbound access, unsupported Knowledge Assistant, and no compliance enforcement/security customization. Some verified accounts can obtain limited GPU/outbound capabilities. Do not promise Agent Bricks or enterprise access controls before inspecting the actual workspace.

## Import plan and a feasible demonstration

Keep Databricks as the analytical system of record. MongoDB is optional later for application workflow records; it is unnecessary to prove data feasibility or replace Databricks.

1. **Raw:** fetch versioned public API/files locally, keep URL, retrieval time, reporting period, checksum, license/access status and geographic scope. Upload approved snapshots to a Databricks Volume if workspace outbound access blocks the source.
2. **Clean:** create separate tables for `vt_services`, `vt_calendar`, `provider_directory`, `vdh_respiratory_weekly`, and `weather_daily`. Use typed dates, source IDs, suppression flags, service audiences and verification timestamps. Keep CER and NHS in separately labeled external-benchmark tables.
3. **Derived:** compute New River trends and freshness; optionally train one local district forecasting model against simple baselines. Never manufacture VT appointment outcomes by joining unrelated Brazilian/English records to a VT calendar. Weather joins need compatible geography, time convention, week boundaries and publication lags.
4. **Agent:** answer a student navigation question with published VT constraints and citations. A clinician/staff user asks for a local respiratory trend briefing and relevant campus resources. Show the actual query, dates, provenance and evidence. Any proposed operational response is a draft for professional review; no automatic overbooking, patient triage or clinician outreach.
5. **Databricks gate:** verify login, file upload, table creation, a SQL query and the chosen agent/serving feature. No workspace import, training, application, deployment or measured outcome is claimed by this research.

This creates a plausible campus-life intelligence use case for Deloitte and an actual professional-facing briefing workflow for Impiricus. Sponsor fit still needs their interpretation of the supplied briefs. A generic student chatbot alone would leave the HCP engagement story weak.

## Reproduce and inspect

From the repository root with Python 3.10+ (standard library only):

```powershell
python scripts/research_health_data.py research/healthcare/sources_initial.json --report access_checks.json
python scripts/research_health_data.py research/healthcare/sources_downloads.json --report download_checks.json
python scripts/research_health_data.py research/healthcare/sources_followup.json --report followup_checks.json
python scripts/research_health_data.py research/healthcare/sources_virginia.json --report virginia_checks.json
python scripts/profile_health_data.py
```

These are local research probes, not production ingestion jobs. Some source pages/file URLs return 403; successful official API alternatives are explicitly recorded. A future refresh may change counts, schemas or URLs. The profiler assumes the verified snapshot schema and date formats and fails visibly on incompatible changes.

See [access manifests and profiles](../research/healthcare/README.md). No sign-in is needed for the verified public downloads. The next account dependency is the team's Databricks workspace, not a paid dataset subscription. No dataset request, third-party message, purchase, or private medical-record access was made.
