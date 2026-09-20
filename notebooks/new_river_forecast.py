# Databricks notebook source
# MAGIC %md
# MAGIC # HokieCare · New River respiratory forecast
# MAGIC Forecasts the weekly **share of visits diagnosed with COVID-19, influenza or RSV** (`combined_pct`)
# MAGIC for the New River Health District, 8 weeks ahead, separately for *Emergency Department* and *Urgent Care*.
# MAGIC
# MAGIC * **Regional aggregate data only.** Nothing here is about an individual person.
# MAGIC * **Reads** `workspace.hokiecare.gold_new_river_trends` (never modified).
# MAGIC * **Writes** two new Delta tables and two new views (see the last cell).
# MAGIC * Runs on serverless compute with no internet access: only statsmodels, pandas, numpy and MLflow.
# MAGIC
# MAGIC **How the nulls are handled (one explicit rule):** suppressed counts are null in `combined_count`.
# MAGIC We *skip* that column entirely. The forecast target is `combined_pct`, which VDH publishes every week
# MAGIC (0 nulls), so no suppressed value is ever turned into zero, filled in or estimated.
# MAGIC The model is also a state-space model that tolerates NaN, so if a future snapshot ever has a missing
# MAGIC percentage it is left as a gap and never imputed.

# COMMAND ----------

import warnings
import numpy as np
import pandas as pd
from statsmodels.tsa.statespace.sarimax import SARIMAX

warnings.filterwarnings("ignore")  # statsmodels convergence chatter would drown the demo output

CATALOG_SCHEMA = "workspace.hokiecare"
SOURCE_VIEW = f"{CATALOG_SCHEMA}.gold_new_river_trends"
FORECAST_TABLE = f"{CATALOG_SCHEMA}.gold_new_river_forecast"
EVAL_TABLE = f"{CATALOG_SCHEMA}.gold_new_river_forecast_eval"
FORECAST_VIEW = f"{CATALOG_SCHEMA}.gold_new_river_forecast_latest"
COMBINED_VIEW = f"{CATALOG_SCHEMA}.gold_new_river_trends_and_forecast"

TARGET = "combined_pct"   # published every week, never suppressed
HOLDOUT_WEEKS = 30        # the last 30 weeks are never seen while fitting
HORIZON = 8               # forecast 8 weeks ahead
SEASON = 52               # weekly data, yearly cycle
FACILITIES = ["Emergency Department", "Urgent Care"]

# A small, fixed list of candidate models. We pick between them using AIC on the TRAINING weeks only,
# so the test window is never used to choose or tune anything.
CANDIDATES = [
    {"order": (1, 0, 1), "seasonal_order": (0, 1, 1, SEASON)},
    {"order": (2, 0, 0), "seasonal_order": (1, 1, 0, SEASON)},
    {"order": (1, 1, 1), "seasonal_order": (0, 1, 1, SEASON)},
]

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Data checks
# MAGIC Turn one facility's rows into a clean weekly series and *prove* it is what we think it is.

# COMMAND ----------

def to_series(rows: pd.DataFrame) -> pd.Series:
    """One facility -> weekly series indexed by week-ending date. Fails loudly if weeks are missing or duplicated."""
    rows = rows.sort_values("week")
    weeks = pd.to_datetime(rows["week"])
    gaps = weeks.diff().dropna().dt.days
    if not (gaps == 7).all():
        raise ValueError(f"Weeks are not a clean 7-day sequence: gaps={sorted(gaps.unique())}")
    return pd.Series(rows[TARGET].astype(float).to_numpy(), index=weeks.to_numpy(), name=TARGET)


def profile(rows: pd.DataFrame) -> dict:
    """The numbers we report before modelling: size, span and how many nulls each column has."""
    return {
        "rows": len(rows),
        "distinct_weeks": rows["week"].nunique(),
        "first_week": str(rows["week"].min()),
        "last_week": str(rows["week"].max()),
        "nulls_per_column": rows.isna().sum().to_dict(),
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Error metrics and the two naive baselines
# MAGIC Baseline A: this week = last week. Baseline B: this week = the same week one year (52 weeks) earlier.
# MAGIC Every method is scored the same way: from each forecast origin inside the hold-out window,
# MAGIC predict 1..8 weeks ahead using **only data up to that origin**.

# COMMAND ----------

def metrics(actual, predicted) -> dict:
    a, p = np.asarray(actual, float), np.asarray(predicted, float)
    err = a - p
    nonzero = a != 0  # MAPE is undefined where the actual is 0
    return {
        "mae": float(np.mean(np.abs(err))),
        "rmse": float(np.sqrt(np.mean(err ** 2))),
        "mape": float(np.mean(np.abs(err[nonzero] / a[nonzero])) * 100),
    }


def naive_forecast(history: pd.Series, horizon: int) -> np.ndarray:
    """Baseline A: every future week equals the last observed week."""
    return np.repeat(history.iloc[-1], horizon)


def seasonal_naive_forecast(history: pd.Series, horizon: int) -> np.ndarray:
    """Baseline B: every future week equals the same week last year (52 weeks before that target week)."""
    return np.array([history.iloc[len(history) - SEASON + h] for h in range(horizon)])


def rolling_origin_eval(series: pd.Series, res_train, holdout: int = HOLDOUT_WEEKS, horizon: int = HORIZON):
    """Score baselines and the model on the last `holdout` weeks.

    `res_train` is the SARIMA model fitted on the training weeks only. At each origin we hand it the newly
    observed weeks (`append`, no refitting) and ask for the next `horizon` weeks. Baselines get exactly the
    same history. Forecast targets past the end of the data are skipped, so every score compares to a real value.
    """
    n = len(series)
    split = n - holdout
    rows = []  # one record per (method, origin, horizon)
    res = res_train
    for origin in range(split, n):
        if origin > split:  # reveal one more true week to the model, parameters stay frozen
            res = res.append(series.iloc[origin - 1: origin], refit=False)
        history = series.iloc[:origin]
        steps = min(horizon, n - origin)
        fc = res.get_forecast(steps)
        ci = fc.conf_int(alpha=0.05)
        preds = {
            "naive_last_week": naive_forecast(history, steps),
            "seasonal_naive_last_year": seasonal_naive_forecast(history, steps),
            "sarima": np.clip(fc.predicted_mean.to_numpy(), 0, None),  # a percentage cannot be negative
        }
        lower = np.clip(ci.iloc[:, 0].to_numpy(), 0, None)
        upper = ci.iloc[:, 1].to_numpy()
        for h in range(steps):
            actual = series.iloc[origin + h]
            for method, p in preds.items():
                rows.append(dict(method=method, origin=origin, h=h + 1, actual=actual, pred=p[h],
                                 lower=lower[h] if method == "sarima" else np.nan,
                                 upper=upper[h] if method == "sarima" else np.nan))
    return pd.DataFrame(rows)


def summarize(scores: pd.DataFrame) -> pd.DataFrame:
    """Pooled MAE / RMSE / MAPE per method, plus the same for the 1-week-ahead case (the classic 'previous week' test)."""
    out = []
    for method, g in scores.groupby("method"):
        pooled = metrics(g.actual, g.pred)
        one = metrics(g[g.h == 1].actual, g[g.h == 1].pred)
        row = {"method": method, **{f"{k}_1to8wk": v for k, v in pooled.items()},
               **{f"{k}_1wk": v for k, v in one.items()}, "n_forecasts": len(g)}
        if method == "sarima":  # how often the true value landed inside the 95% band
            row["interval_coverage_95"] = float(((g.actual >= g.lower) & (g.actual <= g.upper)).mean())
        out.append(row)
    return pd.DataFrame(out).set_index("method")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. The model: SARIMA
# MAGIC *Seasonal ARIMA* explains each week from the recent weeks (the ARIMA part) and from the same time in
# MAGIC earlier years (the seasonal part, period 52). It gives a forecast **and** an honest uncertainty band.

# COMMAND ----------

def fit_sarima(series: pd.Series):
    """Fit every candidate on the given weeks and keep the lowest AIC. Only training weeks are ever passed in."""
    best = None
    for spec in CANDIDATES:
        try:
            res = SARIMAX(series, order=spec["order"], seasonal_order=spec["seasonal_order"],
                          enforce_stationarity=False, enforce_invertibility=False).fit(disp=False, maxiter=200)
        except Exception:
            continue
        if best is None or res.aic < best[0].aic:
            best = (res, spec)
    if best is None:
        raise RuntimeError("No SARIMA candidate converged")
    return best


def future_forecast(series: pd.Series, spec: dict, horizon: int = HORIZON) -> pd.DataFrame:
    """Refit the chosen spec on ALL weeks and forecast the next `horizon` weeks with 95% bounds."""
    res = SARIMAX(series, order=spec["order"], seasonal_order=spec["seasonal_order"],
                  enforce_stationarity=False, enforce_invertibility=False).fit(disp=False, maxiter=200)
    fc = res.get_forecast(horizon)
    ci = fc.conf_int(alpha=0.05)
    weeks = pd.date_range(series.index[-1] + pd.Timedelta(days=7), periods=horizon, freq="7D")
    return pd.DataFrame({
        "forecast_week": weeks.date,
        "horizon_weeks": np.arange(1, horizon + 1),
        "forecast_pct": np.clip(fc.predicted_mean.to_numpy(), 0, None).round(3),
        "lower_95": np.clip(ci.iloc[:, 0].to_numpy(), 0, None).round(3),
        "upper_95": ci.iloc[:, 1].to_numpy().round(3),
    })


def run_facility(series: pd.Series):
    """Everything for one facility. Returns (evaluation summary, future forecast, chosen spec, split info)."""
    split = len(series) - HOLDOUT_WEEKS
    train = series.iloc[:split]                       # earlier weeks only: no future leakage
    res_train, spec = fit_sarima(train)
    scores = rolling_origin_eval(series, res_train)
    summary = summarize(scores)
    forecast = future_forecast(series, spec)
    info = {"train_weeks": split, "test_weeks": HOLDOUT_WEEKS,
            "train_end": str(train.index[-1].date()), "test_start": str(series.index[split].date()),
            "test_end": str(series.index[-1].date()), "aic": float(res_train.aic)}
    return summary, forecast, spec, info

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. Run on Databricks: read, model, log to MLflow, write Delta
# MAGIC Everything below only executes inside Databricks (where `spark` exists). Locally, the functions above
# MAGIC can be imported and tested without a cluster.

# COMMAND ----------

def main():
    import json
    import mlflow

    df = spark.table(SOURCE_VIEW).toPandas()  # read-only; the source is never modified
    prof = profile(df)
    print("DATA PROFILE:", json.dumps(prof, default=str, indent=2))
    print("SUPPRESSED COUNTS (left as null, never filled):", int(df["combined_count"].isna().sum()))

    mlflow.set_experiment(f"/Users/{spark.sql('select current_user()').first()[0]}/hokiecare_new_river_forecast")
    generated_at = pd.Timestamp.now(tz="UTC").tz_localize(None)
    forecasts, evals = [], []

    for facility in FACILITIES:
        series = to_series(df[df["facility"] == facility])
        summary, forecast, spec, info = run_facility(series)
        print(f"\n=== {facility} ===\n", summary.round(3).to_string())

        with mlflow.start_run(run_name=f"sarima_vs_baselines · {facility}") as run:
            mlflow.log_params({"facility": facility, "target": TARGET, "holdout_weeks": HOLDOUT_WEEKS,
                               "horizon_weeks": HORIZON, "order": str(spec["order"]),
                               "seasonal_order": str(spec["seasonal_order"]), **info,
                               "null_policy": "skip suppressed combined_count; forecast complete combined_pct; no imputation"})
            for method, row in summary.iterrows():          # every method's error metrics live in the same run
                mlflow.log_metrics({f"{method}__{k}": float(v) for k, v in row.items() if k != "n_forecasts" and pd.notna(v)})
            beat = bool(summary.loc["sarima", "mae_1to8wk"] < summary.drop("sarima")["mae_1to8wk"].min())
            mlflow.log_param("sarima_beats_best_baseline_on_mae", beat)
            run_id = run.info.run_id

        forecast.insert(0, "facility", facility)
        forecast["model_name"] = "SARIMA"
        forecast["model_spec"] = f"order={spec['order']} seasonal_order={spec['seasonal_order']}"
        forecast["trained_through"] = series.index[-1].date()
        forecast["target_metric"] = TARGET
        forecast["generated_at"] = generated_at
        forecast["mlflow_run_id"] = run_id
        forecasts.append(forecast)

        ev = summary.reset_index()
        ev.insert(0, "facility", facility)
        ev["mlflow_run_id"], ev["generated_at"] = run_id, generated_at
        ev["train_end"], ev["test_start"], ev["test_end"] = info["train_end"], info["test_start"], info["test_end"]
        evals.append(ev)

    # New tables only. Append (never overwrite existing history) so each run is kept and versioned by generated_at.
    spark.createDataFrame(pd.concat(forecasts)).write.mode("append").option("mergeSchema", "true").saveAsTable(FORECAST_TABLE)
    spark.createDataFrame(pd.concat(evals)).write.mode("append").option("mergeSchema", "true").saveAsTable(EVAL_TABLE)

    # Latest forecast only, for the app to read.
    spark.sql(f"""
        CREATE OR REPLACE VIEW {FORECAST_VIEW} AS
        SELECT * FROM {FORECAST_TABLE}
        WHERE generated_at = (SELECT MAX(generated_at) FROM {FORECAST_TABLE})""")
    # Observed and forecast points side by side, so the trend chart can draw both from one place.
    spark.sql(f"""
        CREATE OR REPLACE VIEW {COMBINED_VIEW} AS
        SELECT facility, CAST(week AS DATE) AS week, 'observed' AS kind, combined_pct AS value,
               CAST(NULL AS DOUBLE) AS lower_95, CAST(NULL AS DOUBLE) AS upper_95
        FROM {SOURCE_VIEW}
        UNION ALL
        SELECT facility, forecast_week, 'forecast', forecast_pct, lower_95, upper_95
        FROM {FORECAST_VIEW}""")
    print("\nWrote", FORECAST_TABLE, EVAL_TABLE, "and views", FORECAST_VIEW, COMBINED_VIEW)


if "spark" in globals():  # true on Databricks, false when this file is imported for local testing
    main()
