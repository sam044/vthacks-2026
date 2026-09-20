"""Build backend/hokiecare/forecast_snapshot.py from the notebook's own functions and a saved /api/trends payload.

Used only as the app's fallback until the Databricks notebook has written workspace.hokiecare.gold_new_river_forecast.
Usage: python scripts/build_forecast_snapshot.py trends_snapshot.json
"""
import json, pprint, sys
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "notebooks"))
import new_river_forecast as nf  # the same functions the Databricks notebook runs

snap = json.load(open(sys.argv[1], encoding="utf-8-sig"))
out = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
       "source": "Local run of notebooks/new_river_forecast.py on the New River trends snapshot", "facilities": {}}
for facility in nf.FACILITIES:
    series = nf.to_series(pd.DataFrame(snap[facility]["points"]))
    summary, forecast, spec, info = nf.run_facility(series)
    forecast["forecast_week"] = forecast["forecast_week"].astype(str)
    out["facilities"][facility] = {
        "forecast": forecast.to_dict("records"),
        "evaluation": summary.round(4).reset_index().astype(object).where(lambda d: d.notna(), None).to_dict("records"),  # NaN -> None (JSON-safe)
        "model": f"SARIMA order={spec['order']} seasonal_order={spec['seasonal_order']}",
        "trained_through": str(series.index[-1].date()), **info}
target = ROOT / "backend/hokiecare/forecast_snapshot.py"
target.write_text('"""Precomputed forecast fallback. Regenerate with scripts/build_forecast_snapshot.py."""\nSNAPSHOT = '
                  + pprint.pformat(out, width=110, sort_dicts=False) + "\n", encoding="utf-8")
print("wrote", target)
