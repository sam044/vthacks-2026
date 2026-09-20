"""Remove optional buffers in the approved Lakebase schema; never reseed inventory.

Default is read-only. --apply backs up existing records privately, applies additive
interval policy under the booking lock and checks unchanged appointments.
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
    with psycopg.connect(host=endpoint.status.hosts.host,dbname='databricks_postgres',user=w.current_user.me().user_name,
        password=w.postgres.generate_database_credential(endpoint=ENDPOINT).token,
        sslmode='verify-full',sslrootcert=certifi.where(),connect_timeout=15,row_factory=record_factory,
        options='-c search_path=hokiecare,pg_catalog -c statement_timeout=120000 -c lock_timeout=15000') as conn:
        tables={r['tablename'] for r in conn.execute("SELECT tablename FROM pg_tables WHERE schemaname='hokiecare'")}
        assert {'sessions','slots','appointments','proposals','seed_batches','waitlist'}.issubset(tables)
        assert conn.execute("SELECT has_schema_privilege(current_user,'hokiecare','CREATE')").fetchone()[0]
        print(json.dumps({'target':ENDPOINT,'schema':'hokiecare','migration':'visit_intervals',
            'appointments':conn.execute('SELECT COUNT(*) FROM appointments').fetchone()[0]}))
        if not args.apply: return
        conn.execute('SELECT pg_advisory_xact_lock(72489103)')
        # Brief table locks also exclude older cancellation paths during the migration.
        conn.execute('LOCK TABLE sessions,slots,appointments,proposals,waitlist IN SHARE ROW EXCLUSIVE MODE')
        before={table:[dict(r) for r in conn.execute(sql.SQL('SELECT * FROM {} ORDER BY id').format(sql.Identifier(table)))]
                for table in ('sessions','slots','appointments','proposals','waitlist')}
        backup_path=ROOT/'.secrets'/('visit-intervals-backup-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json')
        backup_path.write_text(json.dumps(before,default=str),encoding='utf-8')
        conn.execute((ROOT/'backend/hokiecare/lakebase_visit_intervals_migration.sql').read_text())
        for table in ('sessions','appointments','proposals','waitlist'):
            after=[dict(r) for r in conn.execute(sql.SQL('SELECT * FROM {} ORDER BY id').format(sql.Identifier(table)))]
            assert after==before[table],f'Existing {table} changed'
        after=[dict(r) for r in conn.execute('SELECT * FROM slots ORDER BY id')]
        assert after==[{**r,'blocked_until':r['ends']} for r in before['slots']]
        conn.commit()
        print(json.dumps({'committed':True,'preserved':{k:len(v) for k,v in before.items()},'backup':'ignored .secrets directory'}))


if __name__=='__main__': main()
