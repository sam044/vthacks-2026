# Healthcare data research evidence

Read the [decision and source analysis](../../docs/HEALTHCARE_DATA_FEASIBILITY.md) first. These files establish local public-data access on September 19, 2026; they do not establish Databricks access, production readiness, clinical validity or blanket redistribution rights.

| File | Contents |
| --- | --- |
| `sources_initial.json` / `access_checks.json` | First-pass official pages and their HTTP outcomes |
| `sources_downloads.json` / `download_checks.json` | NHS files, CER file metadata, NPI sample and NASA sample |
| `sources_followup.json` / `followup_checks.json` | CER CSV, VDH metadata and additional VT pages |
| `sources_virginia.json` / `virginia_checks.json` | VDH records/dictionary, failed CSV route, downloaded VT annual report |
| `data_profiles.json` | Full CER/national NHS profiles; two full members of each NHS ZIP; VDH completeness/dates; NPI/weather sample coverage |

Raw source downloads are deliberately kept outside version control under `data/raw/healthcare/`. Reproduce using the commands in the research report. Checksums describe this exact snapshot. CSV/ZIP/PDF files use a `.bin` local suffix because the download probe preserves bytes rather than inferring a trusted file extension.

The profile's category counts are **row frequencies**, not weighted NHS appointment totals. No patient-level rows, provider addresses, DOBs, clinical notes or credentials are included in the committed evidence. Public CER records contain sensitive health attributes and must be minimized before any later model or hosted demo. `no_show_reason` is target leakage and should never be a prediction feature.

Access != reuse license. CER: CC BY 4.0. NHS: OGL with publisher terms. VDH: public use/download stated, catalog license unspecified. VT pages: factual summaries with links; no open corpus-republication license verified. NASA and NPPES: public federal data with source-specific guidance described in the report.

No model has been trained and no source has been imported into Databricks. No synthetic student dataset has been substituted for the required real-data research.
