"""Validate pinned public inputs and prepare immutable, hash-addressed NDJSON imports."""
import hashlib
import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VDH_URL = "https://www.vdh.virginia.gov/epidemiology/respiratory-diseases-in-virginia/data/emergency-visits-for-respiratory-illness/"


def number(value):
    if value in (None, "", "*"):
        return None
    return float(value)


def normalize(records, snapshot):
    output, keys = [], set()
    for r in records:
        week = datetime.strptime(r["Week Ending Date"], "%Y-%m-%d").date().isoformat()
        key = (week, r["Health District"], r["Facility Type"])
        if key in keys:
            raise ValueError(f"Duplicate grain: {key}")
        keys.add(key)
        row = dict(week=week, district=r["Health District"], region=r["Health Region"],
                   facility=r["Facility Type"], report_date=r["Report Date"],
                   source_url=VDH_URL, snapshot_id=snapshot, retrieved_at="2026-09-19")
        for name, suffix in [("covid", "Covid"), ("influenza", "Influenza"), ("rsv", "RSV"), ("combined", "Combined")]:
            value = number(r[f"Percent of ED Visits {suffix}"])
            if value is not None and not 0 <= value <= 100:
                raise ValueError("Percentage outside [0,100]")
            row[f"{name}_pct"] = value
        raw_count = r["Combined Respiratory Viruses Count"]
        row["combined_count"] = None if number(raw_count) is None else int(raw_count)
        row["count_suppressed"] = raw_count == "*"
        output.append(row)
    return output


def prepare():
    raw = (ROOT / "data/raw/healthcare/vdh_records.json").read_bytes()
    source = json.loads(raw)["result"]
    records = source["records"]
    if len(records) != source["total"] or len(records) != 28700:
        raise ValueError("Pinned VDH snapshot must have exactly 28,700 rows")
    snapshot = hashlib.sha256(raw).hexdigest()
    rows = normalize(records, snapshot)
    district = [r for r in rows if r["district"] == "New River"]
    assert len(district) == 700 and len({r['week'] for r in district}) == 350
    services = json.loads((ROOT / "data/contracts/services.json").read_text())
    assert len({s['id'] for s in services}) == len(services)
    service_hash = hashlib.sha256(json.dumps(services, sort_keys=True).encode()).hexdigest()
    for service in services:
        service["snapshot_id"] = service_hash
    out = ROOT / "runtime/import"
    out.mkdir(parents=True, exist_ok=True)
    datasets = {"bronze_vdh": records, "respiratory": rows, "services": services}
    manifest = []
    for name, values in datasets.items():
        content = "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in values).encode()
        digest = hashlib.sha256(content).hexdigest()
        path = out / f"{name}_{digest[:16]}.jsonl"
        path.write_bytes(content)
        manifest.append({"name": name, "filename": path.name, "sha256": digest, "rows": len(values)})
    result = {"datasets": manifest, "vdh_source_sha256": snapshot, "new_river_rows": len(district),
              "first_week": min(r['week'] for r in district), "last_week": max(r['week'] for r in district),
              "new_river_suppressed_combined_counts": sum(r['count_suppressed'] for r in district)}
    (out / "manifest.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


if __name__ == "__main__":
    print(json.dumps(prepare(), indent=2))
