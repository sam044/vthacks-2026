"""Versioned booking storage; SQLite remains the explicit fallback until Lakebase cutover."""
import sqlite3
import threading
import os
from contextlib import contextmanager
from functools import lru_cache
import time

_migration_lock = threading.Lock()

EXTRA_SCHEMA = '''
CREATE TABLE IF NOT EXISTS proposals (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 slot_id TEXT NOT NULL REFERENCES slots(id), version INTEGER NOT NULL, request_id TEXT NOT NULL,
 expires REAL NOT NULL, operation TEXT NOT NULL, appointment_id TEXT, result_id TEXT,
 UNIQUE(owner, request_id));
CREATE TABLE IF NOT EXISTS agent_tasks (
 owner TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
 state TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS outbox_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, service_id TEXT NOT NULL, day TEXT NOT NULL,
 kind TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS events_scope ON outbox_events(service_id,id);
CREATE INDEX IF NOT EXISTS slot_intervals ON slots(resource_id,starts,ends);
'''


def migrate_sqlite(db):
    with _migration_lock:
        version = db.execute('PRAGMA user_version').fetchone()[0]
        if version >= 4:
            from .dataset import migrate_sqlite as migrate_intake
            migrate_intake(db)
            from .waitlist import migrate_sqlite as migrate_waitlist
            migrate_waitlist(db)
            return
        # DDL is transactional; legacy IDs/times and sessions remain intact.
        db.execute('PRAGMA foreign_keys=OFF')
        db.execute('BEGIN IMMEDIATE')
        columns = {r['name'] for r in db.execute('PRAGMA table_info(slots)')}
        for name, ddl in [('service_id', "TEXT NOT NULL DEFAULT 'cook-counseling'"),
                          ('resource_id', "TEXT NOT NULL DEFAULT 'cook-counseling-demo-resource'"),
                          ('version', 'INTEGER NOT NULL DEFAULT 2')]:
            if name not in columns:
                db.execute(f'ALTER TABLE slots ADD COLUMN {name} {ddl}')
        db.execute('''CREATE TABLE slots_v3 (id TEXT PRIMARY KEY,center_id TEXT NOT NULL,
            starts TEXT NOT NULL,ends TEXT NOT NULL,service_id TEXT NOT NULL DEFAULT 'cook-counseling',
            resource_id TEXT NOT NULL DEFAULT 'cook-counseling-demo-resource',version INTEGER NOT NULL DEFAULT 2)''')
        db.execute('INSERT INTO slots_v3 SELECT id,center_id,starts,ends,service_id,resource_id,version FROM slots')
        # Drop triggers before changing the referenced table; recreate below.
        for name in ['protect_interval_insert','protect_interval_update','availability_event_insert',
                     'availability_event_update','availability_event_delete','availability_event_move']:
            db.execute(f'DROP TRIGGER IF EXISTS {name}')
        db.execute('DROP TABLE slots')
        db.execute('ALTER TABLE slots_v3 RENAME TO slots')
        # executescript commits implicitly, so execute each complete statement separately.
        for statement in EXTRA_SCHEMA.split(';'):
            if statement.strip(): db.execute(statement)
        for event in ['INSERT', 'UPDATE']:
            db.execute(f'''CREATE TRIGGER IF NOT EXISTS protect_interval_{event.lower()}
                BEFORE {event} ON appointments WHEN NEW.status='reserved'
                BEGIN
                SELECT RAISE(ABORT, 'reservation_overlap') WHERE EXISTS (
                    SELECT 1 FROM appointments a JOIN slots s ON a.slot_id=s.id
                    JOIN slots target ON target.id=NEW.slot_id
                    WHERE a.id<>NEW.id AND a.status='reserved'
                    AND (s.resource_id=target.resource_id OR a.owner=NEW.owner)
                    AND s.starts<target.ends AND s.ends>target.starts);
                END''')
        for event in ['INSERT', 'UPDATE', 'DELETE']:
            ref = 'OLD' if event == 'DELETE' else 'NEW'
            db.execute(f'''CREATE TRIGGER IF NOT EXISTS availability_event_{event.lower()}
                AFTER {event} ON appointments BEGIN
                INSERT INTO outbox_events(service_id,day,kind)
                SELECT service_id,substr(starts,1,10),'availability_changed' FROM slots WHERE id={ref}.slot_id;
                END''')
        db.execute('''CREATE TRIGGER IF NOT EXISTS availability_event_move AFTER UPDATE OF slot_id ON appointments
            WHEN OLD.slot_id<>NEW.slot_id BEGIN
            INSERT INTO outbox_events(service_id,day,kind)
            SELECT service_id,substr(starts,1,10),'availability_changed' FROM slots WHERE id=OLD.slot_id;
            END''')
        if 'original_slot_id' not in {r['name'] for r in db.execute('PRAGMA table_info(proposals)')}:
            db.execute('ALTER TABLE proposals ADD COLUMN original_slot_id TEXT')
        db.execute('PRAGMA user_version=4')
        db.commit()
        db.execute('PRAGMA foreign_keys=ON')
        from .dataset import migrate_sqlite as migrate_intake
        migrate_intake(db)
        from .waitlist import migrate_sqlite as migrate_waitlist
        migrate_waitlist(db)


class Record(dict):
    def __getitem__(self,key):
        return list(self.values())[key] if isinstance(key,int) else super().__getitem__(key)


def record_factory(cursor):
    names=[c.name for c in cursor.description or []]
    return lambda values: Record(zip(names,values))


class PostgresConnection:
    """Small DB-API boundary for our parameterized repository queries."""
    def __init__(self,conn): self.conn=conn

    def executemany(self,sql,parameters):
        if 'INSERT OR IGNORE' in sql:
            sql=sql.replace('INSERT OR IGNORE','INSERT')+' ON CONFLICT DO NOTHING'
        with self.conn.cursor() as cursor:
            cursor.executemany(sql.replace('?','%s'),parameters)

    def execute(self,sql,parameters=()):
        import psycopg
        if sql=='BEGIN IMMEDIATE':
            # Single project serialization gate. Never held across model/provider calls.
            return self.conn.execute('SELECT pg_advisory_xact_lock(72489103)')
        if 'INSERT OR IGNORE' in sql:
            sql=sql.replace('INSERT OR IGNORE','INSERT')+' ON CONFLICT DO NOTHING'
        try: return self.conn.execute(sql.replace('?','%s'),parameters)
        except psycopg.IntegrityError:
            raise sqlite3.IntegrityError('Reservation constraint') from None


@lru_cache(maxsize=1)
def connection_pool():
    import certifi
    import psycopg
    from psycopg_pool import ConnectionPool
    from .db import client
    w=client()
    token_lock=threading.Lock()
    credential={'token':None,'refresh_at':0}
    class OAuthConnection(psycopg.Connection):
        @classmethod
        def connect(cls,conninfo='',**kwargs):
            with token_lock:
                if time.monotonic()>=credential['refresh_at']:
                    result=w.postgres.generate_database_credential(endpoint=os.environ['LAKEBASE_ENDPOINT'])
                    credential.update(token=result.token,refresh_at=time.monotonic()+2400)
                kwargs['password']=credential['token']
            return super().connect(conninfo,**kwargs)
    return ConnectionPool(connection_class=OAuthConnection,min_size=0,max_size=5,timeout=12,
        max_lifetime=2700,max_idle=60,reconnect_timeout=15,check=ConnectionPool.check_connection,
        kwargs=dict(host=os.environ['PGHOST'],dbname=os.environ.get('PGDATABASE','databricks_postgres'),
                    user=os.environ['PGUSER'],sslmode='verify-full',sslrootcert=certifi.where(),connect_timeout=10,
                    options='-c search_path=hokiecare,pg_catalog -c statement_timeout=10000 -c lock_timeout=5000',
                    row_factory=record_factory))


@contextmanager
def lakebase_database():
    from fastapi import HTTPException
    import psycopg
    from psycopg_pool import PoolTimeout
    try:
        with connection_pool().connection() as conn:
            yield PostgresConnection(conn)
    except (psycopg.OperationalError,PoolTimeout):
        raise HTTPException(503,'Appointment storage is temporarily unavailable. Retry the same review to check its result.') from None
