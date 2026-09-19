"""Initialize only the explicitly selected HokieCare Lakebase project. Never print secrets."""
import json
from pathlib import Path
import time
import psycopg
import certifi
from psycopg import sql
from databricks.sdk import WorkspaceClient
from databricks.sdk.service import postgres

ROOT=Path(__file__).resolve().parents[1]
ENDPOINT='projects/hokiecare-booking/branches/production/endpoints/primary'


def main():
    w=WorkspaceClient(profile='sam')
    endpoint=w.postgres.get_endpoint(ENDPOINT)
    credentials=json.loads((ROOT/'.secrets/railway-databricks.json').read_text())
    principal=credentials['DATABRICKS_CLIENT_ID']
    branch='projects/hokiecare-booking/branches/production'
    roles=list(w.postgres.list_roles(parent=branch))
    if not any(r.status and r.status.postgres_role==principal for r in roles):
        w.postgres.create_role(parent=branch,role_id=principal,role=postgres.Role(spec=postgres.RoleRoleSpec(
            postgres_role=principal,identity_type=postgres.RoleIdentityType.SERVICE_PRINCIPAL,
            auth_method=postgres.RoleAuthMethod.LAKEBASE_OAUTH_V1))).wait()
    def connect(client,user):
        return psycopg.connect(host=endpoint.status.hosts.host,dbname='databricks_postgres',user=user,
            password=client.postgres.generate_database_credential(endpoint=ENDPOINT).token,
            sslmode='verify-full',sslrootcert=certifi.where(),connect_timeout=15)
    started=time.monotonic()
    with connect(w,w.current_user.me().user_name) as conn:
        conn.execute((ROOT/'backend/hokiecare/lakebase_schema.sql').read_text())
        conn.execute(sql.SQL('GRANT USAGE ON SCHEMA hokiecare TO {}').format(sql.Identifier(principal)))
        conn.execute(sql.SQL('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA hokiecare TO {}').format(sql.Identifier(principal)))
        conn.execute(sql.SQL('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA hokiecare TO {}').format(sql.Identifier(principal)))
        assert conn.execute('SELECT version FROM hokiecare.schema_version').fetchone()[0]==2
    print('Developer TLS connection and schema migration passed',round(time.monotonic()-started,2),'seconds')
    hosted=WorkspaceClient(host=credentials['DATABRICKS_HOST'],client_id=principal,
        client_secret=credentials['DATABRICKS_CLIENT_SECRET'],auth_type='oauth-m2m')
    with connect(hosted,principal) as conn:
        conn.execute("INSERT INTO hokiecare.sessions VALUES ('lakebase-feasibility-check',0)")
        assert conn.execute("SELECT expires FROM hokiecare.sessions WHERE id='lakebase-feasibility-check'").fetchone()[0]==0
        conn.execute("DELETE FROM hokiecare.sessions WHERE id='lakebase-feasibility-check'")
    print('Hosted identity TLS create/read/delete/commit passed')
    config=dict(HOKIECARE_BOOKING_STORE='lakebase',LAKEBASE_ENDPOINT=ENDPOINT,PGHOST=endpoint.status.hosts.host,
        PGDATABASE='databricks_postgres',PGUSER=principal)
    (ROOT/'.secrets/lakebase-config.json').write_text(json.dumps(config))
    print('Saved server configuration in ignored .secrets/lakebase-config.json')


if __name__=='__main__': main()
