# HokieCare 8-week respiratory forecast: summary

## What the data looked like
Read from the live app's `/api/trends` (same query as `gold_new_river_trends`).

| | |
|---|---|
| Rows | 700 |
| Distinct weeks | 350 (2020-01-04 to 2026-09-12), every gap exactly 7 days |
| Series | **2**: Emergency Department and Urgent Care, 350 clean weekly points each |
| Columns (13) | week, district, facility, report_date, retrieved_at, source_url, snapshot_id, combined_pct, covid_pct, influenza_pct, rsv_pct, combined_count, count_suppressed |
| Metrics | 4 percentages (combined, COVID-19, influenza, RSV) + 1 count |
| Nulls | `combined_count`: **64** (20 ED, 44 Urgent Care). Every other column: 0 |

So this is two complete weekly series, not one gappy series. Forecasting is supported. The 700 = 2 facilities x 350 weeks.

## How nulls were handled (one rule: skip)
Suppressed counts are null in `combined_count`. That column is never used, filled or forecast.
The forecast target is `combined_pct`, which is published every week (0 nulls). No suppressed value is
turned into zero or estimated. The state-space model would also tolerate a NaN if a future snapshot had one.

## Method
* Time split: train on the first 320 weeks, hold out the **last 30** (2026-02-21 to 2026-09-12). Model choice
  (3 fixed SARIMA candidates) uses AIC on training weeks only. Nothing was tuned on the test window.
* Baselines: A = same as last week, B = same week last year (52 weeks back).
* Scoring: rolling origin. From each week in the hold-out, every method predicts 1-8 weeks ahead using only
  data available at that origin (212 forecasts per method per facility). SARIMA parameters stay frozen.
* Production forecast: same SARIMA spec refit on all 350 weeks, 8 weeks ahead, 95% intervals.

## Results (hold-out, 1-8 weeks ahead, percentage points; MAPE in %)

**Emergency Department** (SARIMA(1,1,1)(0,1,1,52))

| Method | MAE | RMSE | MAPE | MAE 1 wk ahead |
|---|---|---|---|---|
| Same as last week | 0.916 | 1.360 | 157.1 | **0.430** |
| Same week last year | **0.608** | **0.951** | **132.8** | 0.817 |
| SARIMA | 0.880 | 1.300 | 216.9 | 0.535 |

**Urgent Care** (SARIMA(1,0,1)(0,1,1,52))

| Method | MAE | RMSE | MAPE | MAE 1 wk ahead |
|---|---|---|---|---|
| Same as last week | 2.491 | 4.206 | 282.4 | **0.913** |
| Same week last year | 1.864 | 2.740 | **253.2** | 2.080 |
| SARIMA | **1.836** | **2.321** | 288.5 | 1.044 |

## Did it beat the baseline? Not cleanly.
* **Emergency Department: no.** SARIMA beat "same as last week" on MAE and RMSE only slightly, and lost to
  "same week last year" on every metric. Unadjusted, last year's value is the better ED forecast here.
* **Urgent Care: partly.** Best on MAE and RMSE at 1-8 weeks, but the MAE margin over same-week-last-year is
  tiny (1.836 vs 1.864). It lost on MAPE to both baselines.
* **1 week ahead: no.** For both facilities, "same as last week" is best for next-week prediction.
* Not tuned to win. These are the first numbers the pre-chosen candidates produced.

## Current forecast (regional, week ending)
* ED: 1.5% (Sep 19) rising to 1.9% (Nov 7); 95% range up to 6.9%.
* Urgent Care: 2.0% (Sep 19) rising to 5.1% (Nov 7), peak 5.8% (Oct 31); 95% range up to 13.6%.

## Limitations
* The hold-out is Feb-Sep 2026, a low-activity stretch with many values near 0%. MAPE is dominated by tiny
  denominators (100%+), so it is reported but is not a trustworthy headline. MAE/RMSE are more meaningful.
* The hold-out contains no winter peak, so this says little about accuracy during a surge.
* Only ~6.7 years, including COVID-era regime shifts; a yearly seasonal pattern rests on 6 cycles.
* Intervals are too wide to be useful: the 95% band contained the truth 98.6% (ED) and 99.1% (UC) of the time,
  and the lower bound is clipped at 0. Present direction and range, not a point value.
* 30 weeks of overlapping forecasts is a small, correlated test sample; treat differences of a few hundredths
  (Urgent Care MAE) as ties.
* District-level aggregate data, not VT students; not medical advice. Percentages are unrevised-at-publication
  and VDH may revise history.

## How it is wired
* `notebooks/new_river_forecast.py`: Databricks notebook (serverless). Reads the view, runs the baselines and SARIMA,
  logs one MLflow run per facility (params + every method's MAE/RMSE/MAPE), appends to new Delta tables
  `gold_new_river_forecast` and `gold_new_river_forecast_eval`, and creates views `gold_new_river_forecast_latest`
  and `gold_new_river_trends_and_forecast`. It never touches an existing table.
* `backend/hokiecare/app.py`: new `GET /api/forecast`. Reads the Delta view; until the notebook has run it serves
  `forecast_snapshot.py` (precomputed locally with the same functions) and the page badge says "Precomputed snapshot".
* `frontend/src/main.tsx` + `styles.css`: the "Next 8 weeks" panel on Health Intelligence (stat tiles, chart with
  95% band, computed verdict, baseline scorecard).

## Not verified
* The Databricks half of the notebook (`main()`: MLflow logging, Delta writes, views) has **not been run**. The
  team's `workspace.hokiecare` workspace was not reachable from this machine, so only the modelling code and the
  app were tested, on the real data.
* statsmodels is assumed available on serverless (add it as an environment dependency if not).
