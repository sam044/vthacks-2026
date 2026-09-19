"""Explicit operator migration/seed for the approved HokieCare Lakebase project.

Default is read-only inspection. --apply backs up existing sample records, migrates,
materializes, and seeds in one transaction. Credentials and names are never printed.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import time
import certifi
import psycopg
from psycopg import sql
from databricks.sdk import WorkspaceClient

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from hokiecare.booking_store import PostgresConnection, record_factory
from hokiecare.dataset import materialize, seed, BATCH

ENDPOINT='projects/hokiecare-booking/branches/production/endpoints/primary'


def validate(db):
    counts={t:db.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
            for t in ('calendar_dates','slots','appointments','seed_batches')}
    assert counts['calendar_dates']==262
    assert db.execute('SELECT COUNT(*) FROM slots WHERE active=1 AND version=3').fetchone()[0]==12488
    assert db.execute('''SELECT COUNT(*) FROM slots s JOIN calendar_dates d ON d.day=s.local_date
        WHERE s.active=1 AND d.exclusion_reason IS NOT NULL''').fetchone()[0]==0
    assert db.execute('''SELECT COUNT(*) FROM slots WHERE active=1 AND
        (EXTRACT(EPOCH FROM (ends::timestamptz-starts::timestamptz))<>1800 OR
         EXTRACT(EPOCH FROM (blocked_until::timestamptz-starts::timestamptz))<>3600)''').fetchone()[0]==0
    intervals={}
    for row in db.execute('''SELECT a.owner,s.resource_id,s.starts,COALESCE(s.blocked_until,s.ends) AS until
        FROM appointments a JOIN slots s ON s.id=a.slot_id WHERE a.status='reserved' '''):
        for key in (row['owner'],row['resource_id']):intervals.setdefault(key,[]).append((row['starts'],row['until']))
    for entries in intervals.values():
        entries.sort()
        assert all(a[1]<=b[0] for a,b in zip(entries,entries[1:])),'Overlapping reservation'
    counts['seeded']=db.execute("SELECT COUNT(*) FROM appointments WHERE record_origin='seeded'").fetchone()[0]
    counts['visitor']=db.execute("SELECT COUNT(*) FROM appointments WHERE record_origin='user_created'").fetchone()[0]
    return counts


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
        tables=[r['tablename'] for r in conn.execute("SELECT tablename FROM pg_tables WHERE schemaname='hokiecare'")]
        assert {'slots','appointments','sessions','proposals'}.issubset(tables)
        print(json.dumps({'target':ENDPOINT,'schema':'hokiecare','existing_tables':sorted(tables),
            'existing_appointments':conn.execute('SELECT COUNT(*) FROM appointments').fetchone()[0]}))
        if not args.apply: return
        started=time.monotonic()
        conn.execute('SELECT pg_advisory_xact_lock(72489103)')
        existing=[dict(r) for r in conn.execute('SELECT id,slot_id,status FROM appointments')]
        backup={table:[dict(r) for r in conn.execute(sql.SQL('SELECT * FROM {}').format(sql.Identifier(table)))]
                for table in ('sessions','slots','appointments','proposals','agent_tasks')}
        backup_path=ROOT/'.secrets'/('calendar-backup-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json')
        backup_path.parent.mkdir(exist_ok=True)
        backup_path.write_text(json.dumps(backup,default=str),encoding='utf-8')
        conn.execute((ROOT/'backend/hokiecare/lakebase_intake_migration.sql').read_text(encoding='utf-8'))
        db=PostgresConnection(conn)
        materialize(db)
        manifest=seed(db)
        principal=json.loads((ROOT/'.secrets/railway-databricks.json').read_text())['DATABRICKS_CLIENT_ID']
        conn.execute(sql.SQL('GRANT SELECT ON hokiecare.calendar_dates,hokiecare.seed_batches TO {}').format(sql.Identifier(principal)))
        after={r['id']:dict(r) for r in conn.execute('SELECT id,slot_id,status FROM appointments')}
        assert all(after[r['id']]==r for r in existing),'Existing appointments changed'
        counts=validate(conn)
        assert seed(db)==manifest,'Seed replay changed the manifest'
        conn.commit()
        print(json.dumps({'committed':True,'counts':counts,'batch':BATCH,'seconds':round(time.monotonic()-started,1),
                          'existing_records_preserved':len(existing),'backup':'ignored .secrets directory'}))
        # Prove the application principal can read the new inventory with its own credentials.
    credentials=json.loads((ROOT/'.secrets/railway-databricks.json').read_text())
    hosted=WorkspaceClient(host=credentials['DATABRICKS_HOST'],client_id=credentials['DATABRICKS_CLIENT_ID'],
        client_secret=credentials['DATABRICKS_CLIENT_SECRET'],auth_type='oauth-m2m')
    with psycopg.connect(host=endpoint.status.hosts.host,dbname='databricks_postgres',user=credentials['DATABRICKS_CLIENT_ID'],
        password=hosted.postgres.generate_database_credential(endpoint=ENDPOINT).token,
        sslmode='verify-full',sslrootcert=certifi.where(),connect_timeout=15) as conn:
        assert conn.execute('SELECT COUNT(*) FROM hokiecare.calendar_dates').fetchone()[0]==262
        assert conn.execute('SELECT COUNT(*) FROM hokiecare.slots WHERE active=1').fetchone()[0]==12488
    print('Hosted identity verified calendar dates and materialized inventory over TLS.')


if __name__=='__main__': main()
