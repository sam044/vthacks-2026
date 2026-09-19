"""Provision the project's SQL reader and send its secret to Railway over stdin.

Run after import. Credentials are stored only in ignored .secrets for recovery;
neither subprocess arguments nor console output contain the OAuth secret.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.iam import ComplexValue
from databricks.sdk.service.sql import WarehouseAccessControlRequest, WarehousePermissionLevel

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from hokiecare.db import execute


def main():
    w = WorkspaceClient(profile='sam')
    matches = list(w.service_principals.list(filter='displayName eq "hokiecare-railway"'))
    sp = matches[0] if matches else w.service_principals.create(
        display_name='hokiecare-railway', active=True,
        entitlements=[ComplexValue(value='databricks-sql-access')])
    warehouse = os.environ['DATABRICKS_WAREHOUSE_ID']
    w.warehouses.update_permissions(warehouse, access_control_list=[WarehouseAccessControlRequest(
        service_principal_name=sp.application_id, permission_level=WarehousePermissionLevel.CAN_USE)])
    for sql in [f"GRANT USE CATALOG ON CATALOG workspace TO `{sp.application_id}`",
                f"GRANT USE SCHEMA ON SCHEMA workspace.hokiecare TO `{sp.application_id}`",
                *[f"GRANT SELECT ON VIEW workspace.hokiecare.{view} TO `{sp.application_id}`"
                  for view in ['gold_service_directory', 'gold_new_river_trends']]]:
        execute(w, sql, timeout=120)
    path = ROOT / '.secrets/railway-databricks.json'
    path.parent.mkdir(exist_ok=True)
    if path.exists():
        credentials = json.loads(path.read_text())
        if credentials['DATABRICKS_CLIENT_ID'] != sp.application_id:
            raise RuntimeError('Stored credentials belong to a different principal')
    else:
        secret = w.service_principal_secrets_proxy.create(sp.id, lifetime='2592000s')
        credentials = dict(DATABRICKS_HOST=w.config.host, DATABRICKS_CLIENT_ID=sp.application_id,
                           DATABRICKS_CLIENT_SECRET=secret.secret, DATABRICKS_AUTH_TYPE='oauth-m2m')
        path.write_text(json.dumps(credentials))
    hosted = WorkspaceClient(host=credentials['DATABRICKS_HOST'], client_id=credentials['DATABRICKS_CLIENT_ID'],
                             client_secret=credentials['DATABRICKS_CLIENT_SECRET'], auth_type='oauth-m2m')
    for view in ['gold_service_directory', 'gold_new_river_trends']:
        rows, _ = execute(hosted, f'SELECT COUNT(*) AS rows FROM workspace.hokiecare.{view}', timeout=120)
        print(f'Hosted identity read verified: {view} = {rows[0]["rows"]}', flush=True)
    credentials['DATABRICKS_WAREHOUSE_ID'] = warehouse
    railway = Path(os.environ['APPDATA']) / 'npm/node_modules/@railway/cli/bin/railway.exe'
    if not railway.exists():
        raise RuntimeError('Railway binary not at expected npm location; inspect installed CLI')
    for key, value in credentials.items():
        result = subprocess.run([str(railway), 'variable', 'set', key, '--stdin', '--skip-deploys',
            '--project', '96a90558-cc3e-448f-930a-d79b00d63285',
            '--service', 'd5abcbc7-f3d9-45c0-9d31-a3fb75b887a3',
            '--environment', '390e03b5-a1db-4908-b5f2-4a3d19b5a2c7'],
            input=value, text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError(f'Railway variable update failed for {key}; output withheld to protect credentials')
        print(f'Configured Railway variable: {key}', flush=True)
    print('OAuth M2M verified; secret expires in 30 days. No developer OAuth cache deployed.')


if __name__ == '__main__':
    main()
