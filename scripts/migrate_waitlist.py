"""Add the waitlist to the existing approved Lakebase schema; never seed inventory.

Default is read-only. --apply backs up existing records privately, applies additive
DDL under the booking lock, grants hosted DML, and checks unchanged appointments.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import certifi
import psycopg
from psycopg import sql
from databricks.sdk import WorkspaceClient

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from hokiecare.booking_store import record_factory

ENDPOINT='projects/hokiecare-booking/branches/production/endpoints/primary'


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    w=WorkspaceClient(profile='sam')
    endpoint=w.postgres.get_endpoint(ENDPOINT)
    credentials=json.loads((ROOT/'.secrets/railway-databricks.json').read_text())
    with psycopg.connect(host=endpoint.status.hosts.host,dbname='databricks_postgres',user=w.current_user.me().user_name,
        password=w.postgres.generate_database_credential(endpoint=ENDPOINT).token,
        sslmode='verify-full',sslrootcert=certifi.where(),connect_timeout=15,row_factory=record_factory,
        options='-c search_path=hokiecare,pg_catalog -c statement_timeout=120000 -c lock_timeout=15000') as conn:
        tables={r['tablename'] for r in conn.execute("SELECT tablename FROM pg_tables WHERE schemaname='hokiecare'")}
        assert {'sessions','slots','appointments','proposals','seed_batches'}.issubset(tables)
        assert conn.execute("SELECT has_schema_privilege(current_user,'hokiecare','CREATE')").fetchone()[0]
        print(json.dumps({'target':ENDPOINT,'schema':'hokiecare','waitlist_exists':'waitlist' in tables,
            'appointments':conn.execute('SELECT COUNT(*) FROM appointments').fetchone()[0]}))
        if not args.apply: return
        conn.execute('SELECT pg_advisory_xact_lock(72489103)')
        # Brief table locks also exclude older cancellation paths during the migration.
        conn.execute('LOCK TABLE sessions,slots,appointments,proposals IN SHARE ROW EXCLUSIVE MODE')
        before={table:[dict(r) for r in conn.execute(sql.SQL('SELECT * FROM {} ORDER BY id').format(sql.Identifier(table)))]
                for table in ('sessions','slots','appointments','proposals')}
        backup_path=ROOT/'.secrets'/('waitlist-backup-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json')
        backup_path.write_text(json.dumps(before,default=str),encoding='utf-8')
        conn.execute((ROOT/'backend/hokiecare/lakebase_waitlist_migration.sql').read_text())
        conn.execute(sql.SQL('GRANT SELECT,INSERT,UPDATE,DELETE ON hokiecare.waitlist TO {}').format(sql.Identifier(credentials['DATABRICKS_CLIENT_ID'])))
        for table in ('sessions','slots','appointments'):
            after=[dict(r) for r in conn.execute(sql.SQL('SELECT * FROM {} ORDER BY id').format(sql.Identifier(table)))]
            assert after==before[table],f'Existing {table} changed'
        # Existing proposal values are identical; only the nullable association is new.
        after=[dict(r) for r in conn.execute('SELECT * FROM proposals ORDER BY id')]
        assert [{k:r[k] for k in old} for r,old in zip(after,before['proposals'])]==before['proposals']
        assert len(after)==len(before['proposals'])
        conn.commit()
        print(json.dumps({'committed':True,'preserved':{k:len(v) for k,v in before.items()},'backup':'ignored .secrets directory'}))
    hosted=WorkspaceClient(host=credentials['DATABRICKS_HOST'],client_id=credentials['DATABRICKS_CLIENT_ID'],
        client_secret=credentials['DATABRICKS_CLIENT_SECRET'],auth_type='oauth-m2m')
    with psycopg.connect(host=endpoint.status.hosts.host,dbname='databricks_postgres',user=credentials['DATABRICKS_CLIENT_ID'],
        password=hosted.postgres.generate_database_credential(endpoint=ENDPOINT).token,
        sslmode='verify-full',sslrootcert=certifi.where(),connect_timeout=15) as conn:
        conn.execute('SELECT id,status FROM hokiecare.waitlist LIMIT 1')
        assert conn.execute("SELECT has_table_privilege(current_user,'hokiecare.waitlist','SELECT,INSERT,UPDATE,DELETE')").fetchone()[0]
        # Prove an actual write under the hosted role, then roll the probe back.
        conn.execute("INSERT INTO hokiecare.sessions(id,expires,kind) VALUES ('waitlist-migration-probe',4102444800,'seed')")
        conn.execute("""INSERT INTO hokiecare.waitlist(id,owner,slot_id,created_at,status)
            SELECT 'waitlist-migration-probe','waitlist-migration-probe',id,'2026-09-20T00:00:00+00:00','left'
            FROM hokiecare.slots WHERE active=1 LIMIT 1""")
        assert conn.execute("SELECT COUNT(*) FROM hokiecare.waitlist WHERE id='waitlist-migration-probe'").fetchone()[0]==1
        conn.rollback()
    print('Hosted identity verified actual waitlist read/write over TLS; probe rolled back.')


if __name__=='__main__': main()
