"""Operator-only SQLite -> Lakebase cutover. Run on the host with the mounted volume.

Sets a durable SQLite write-pause marker before snapshotting. Never removes it:
the next deployment uses Lakebase; old SQLite processes remain paused. A failed
migration leaves the source intact and paused for deliberate operator recovery.
"""
from datetime import datetime,timezone
import json
import os
import sqlite3
from psycopg import sql
from .booking import database,database_path
from .booking_store import connection_pool


def main():
    if os.environ.get('HOKIECARE_BOOKING_STORE','sqlite')!='sqlite':
        raise RuntimeError('Run once before switching the source from SQLite')
    path=database_path()
    path.with_suffix('.paused').touch()
    with database() as db: db.execute('SELECT 1')
    snapshot=path.with_name(f'appointments-backup-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.sqlite3')
    counts={}
    with sqlite3.connect(path) as source,sqlite3.connect(snapshot) as backup:
        source.backup(backup)
    with sqlite3.connect(snapshot) as source,connection_pool().connection() as target:
        source.row_factory=sqlite3.Row
        target.execute('SELECT pg_advisory_xact_lock(72489103)')
        for table in ['sessions','slots','appointments','proposals','agent_tasks']:
            rows=source.execute(f'SELECT * FROM {table}').fetchall()
            counts[table]=len(rows)
            for row in rows:
                columns=list(row.keys())
                statement=sql.SQL('INSERT INTO {} ({}) VALUES ({}) ON CONFLICT DO NOTHING').format(
                    sql.Identifier(table),sql.SQL(',').join(map(sql.Identifier,columns)),
                    sql.SQL(',').join(sql.Placeholder() for _ in columns))
                target.execute(statement,tuple(row))
                key='owner' if table=='agent_tasks' else 'id'
                saved=target.execute(sql.SQL('SELECT {} FROM {} WHERE {}=%s').format(
                    sql.SQL(',').join(map(sql.Identifier,columns)),sql.Identifier(table),sql.Identifier(key)),(row[key],)).fetchone()
                if tuple(saved.values())!=tuple(row): raise RuntimeError(f'Migration mismatch in {table}; transaction rolled back')
        overlap=target.execute('''SELECT COUNT(*) FROM appointments a JOIN slots s ON s.id=a.slot_id
            JOIN appointments b ON a.id<b.id AND a.status='reserved' AND b.status='reserved'
            JOIN slots t ON t.id=b.slot_id WHERE (s.resource_id=t.resource_id OR a.owner=b.owner)
            AND s.starts<t.ends AND s.ends>t.starts''').fetchone()[0]
        if overlap:raise RuntimeError('Reservation invariant failed; transaction rolled back')
    print(json.dumps({'status':'copied_and_verified','source_counts':counts,'backup':str(snapshot),
        'sqlite_writes':'paused','next':'Set HOKIECARE_BOOKING_STORE=lakebase and deploy. Do not remove the SQLite pause marker.'}))


if __name__=='__main__':main()
