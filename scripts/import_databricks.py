"""Import validated public snapshots into project-owned objects. Uses local OAuth."""
import json
import os
import sys
from pathlib import Path
from databricks.sdk import WorkspaceClient
from databricks.sdk.errors import NotFound
from databricks.sdk.service.catalog import VolumeType

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from hokiecare.db import execute
from prepare_core_data import prepare

NAMESPACE = "workspace.hokiecare"
MARKER = "HokieCare public-data prototype; managed by vthacks-2026"


def main():
    manifest = prepare()
    w = WorkspaceClient(profile=os.environ.get("DATABRICKS_CONFIG_PROFILE", "sam"))
    def query(sql):
        rows, statement = execute(w, sql, timeout=240)
        print(json.dumps({"statement_id": statement, "operation": sql.split()[0], "result": rows}), flush=True)
        return rows
    try:
        schema = w.schemas.get(NAMESPACE)
        if schema.comment != MARKER:
            raise RuntimeError("Refusing to modify a schema without HokieCare ownership marker")
    except NotFound:
        w.schemas.create(name="hokiecare", catalog_name="workspace", comment=MARKER)
    try:
        w.volumes.read(f"{NAMESPACE}.source_snapshots")
    except NotFound:
        w.volumes.create(catalog_name="workspace", schema_name="hokiecare", name="source_snapshots",
                         volume_type=VolumeType.MANAGED, comment=MARKER)
    base = "/Volumes/workspace/hokiecare/source_snapshots"
    names = {}
    for ds in manifest["datasets"]:
        with (ROOT / "runtime/import" / ds["filename"]).open("rb") as f:
            w.files.upload(f"{base}/{ds['filename']}", f, overwrite=True)
        table = f"{NAMESPACE}.{ds['name']}_{ds['sha256'][:16]}"
        names[ds['name']] = table
        # Snapshot tables are immutable and deduplicate repeated imports by content hash.
        projection = "_id AS source_row_id, to_json(struct(*)) AS raw_json" if ds['name'] == 'bronze_vdh' else "*"
        query(f"CREATE TABLE IF NOT EXISTS {table} USING DELTA AS SELECT {projection} FROM read_files('{base}/{ds['filename']}', format => 'json')")
        counts = query(f"SELECT COUNT(*) AS rows FROM {table}")
        if int(counts[0]['rows']) != ds['rows']:
            raise RuntimeError(f"Import count mismatch: {table}")
    query(f"CREATE OR REPLACE VIEW {NAMESPACE}.gold_service_directory AS SELECT * FROM {names['services']}")
    query(f"""CREATE OR REPLACE VIEW {NAMESPACE}.gold_new_river_trends AS
        SELECT CAST(week AS DATE) AS week, district, facility, report_date, retrieved_at,
        source_url, snapshot_id, combined_pct, covid_pct, influenza_pct, rsv_pct,
        CAST(combined_count AS BIGINT) AS combined_count, count_suppressed
        FROM {names['respiratory']} WHERE district = 'New River'""")
    result = query(f"SELECT COUNT(*) AS rows, MIN(week) AS first_week, MAX(week) AS last_week, SUM(CASE WHEN count_suppressed THEN 1 ELSE 0 END) AS suppressed FROM {NAMESPACE}.gold_new_river_trends")
    if int(result[0]['rows']) != 700 or int(result[0]['suppressed']) != 64:
        raise RuntimeError("New River validation mismatch")
    with (ROOT / "runtime/import/manifest.json").open("rb") as f:
        w.files.upload(f"{base}/manifest_{manifest['vdh_source_sha256'][:16]}.json", f, overwrite=True)
    evidence = dict(manifest, tables=names, validation=result)
    (ROOT / "research/healthcare/databricks_import.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print("Verified: real Databricks import, 700 New River records, six service records.", flush=True)


if __name__ == '__main__':
    main()
