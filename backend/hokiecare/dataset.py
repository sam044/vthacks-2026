"""Versioned academic inventory and reproducible sample occupancy, never provider data."""
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import random
from . import scheduling as s

BATCH = 'academic-2026-27-v3'
SEED = 20260919

TABLES = '''
CREATE TABLE IF NOT EXISTS calendar_dates (
 day TEXT PRIMARY KEY, year INTEGER NOT NULL, month INTEGER NOT NULL, day_of_month INTEGER NOT NULL,
 weekday INTEGER NOT NULL, term TEXT NOT NULL, exclusion_reason TEXT);
CREATE TABLE IF NOT EXISTS seed_batches (
 id TEXT PRIMARY KEY, seed INTEGER NOT NULL, version INTEGER NOT NULL, manifest TEXT NOT NULL);
'''
ADDITIONS = {
 'slots': [('local_date', 'TEXT'), ('blocked_until', 'TEXT'), ('active', 'INTEGER NOT NULL DEFAULT 0')],
 'appointments': [('booking_name', "TEXT NOT NULL DEFAULT ''"), ('record_origin', "TEXT NOT NULL DEFAULT 'user_created'"),
                  ('retain_until', 'DOUBLE PRECISION'), ('seed_batch', 'TEXT')],
 'proposals': [('booking_name', "TEXT NOT NULL DEFAULT ''"), ('intake_key', 'TEXT')],
 'sessions': [('kind', "TEXT NOT NULL DEFAULT 'visitor'")],
 'agent_tasks': [('expires', 'DOUBLE PRECISION')],
}


def migrate_sqlite(db):
    if db.execute('PRAGMA user_version').fetchone()[0] >= 5:
        return
    db.execute('BEGIN IMMEDIATE')
    for table, columns in ADDITIONS.items():
        existing = {r['name'] for r in db.execute(f'PRAGMA table_info({table})')}
        for name, ddl in columns:
            if name not in existing:
                db.execute(f'ALTER TABLE {table} ADD COLUMN {name} {ddl}')
    for statement in TABLES.split(';'):
        if statement.strip(): db.execute(statement)
    db.execute('CREATE INDEX IF NOT EXISTS slots_by_day ON slots(service_id,local_date,active)')
    db.execute('CREATE INDEX IF NOT EXISTS appointment_slot_status ON appointments(slot_id,status)')
    db.execute('CREATE INDEX IF NOT EXISTS appointment_owner_status ON appointments(owner,status)')
    db.execute('UPDATE slots SET blocked_until=ends,local_date=substr(starts,1,10) WHERE blocked_until IS NULL')
    db.execute('UPDATE agent_tasks SET expires=? WHERE expires IS NULL', (datetime.now(timezone.utc).timestamp()+86400,))
    db.execute('DROP TRIGGER IF EXISTS availability_event_update')
    db.execute('''CREATE TRIGGER availability_event_update AFTER UPDATE OF slot_id,status ON appointments
        BEGIN INSERT INTO outbox_events(service_id,day,kind)
        SELECT service_id,COALESCE(local_date,substr(starts,1,10)),'availability_changed' FROM slots WHERE id=NEW.slot_id;
        END''')
    for event in ['INSERT', 'UPDATE']:
        db.execute(f'DROP TRIGGER IF EXISTS protect_interval_{event.lower()}')
        db.execute(f'''CREATE TRIGGER protect_interval_{event.lower()} BEFORE {event} ON appointments
          WHEN NEW.status='reserved' BEGIN
          SELECT RAISE(ABORT,'reservation_overlap') WHERE EXISTS (
            SELECT 1 FROM slots t JOIN slots s ON s.resource_id=t.resource_id
              JOIN appointments a ON a.slot_id=s.id AND a.status='reserved'
            WHERE t.id=NEW.slot_id AND a.id<>NEW.id
              AND s.starts<COALESCE(t.blocked_until,t.ends) AND COALESCE(s.blocked_until,s.ends)>t.starts)
          OR EXISTS (
            SELECT 1 FROM appointments a JOIN slots s ON s.id=a.slot_id JOIN slots t ON t.id=NEW.slot_id
            WHERE a.owner=NEW.owner AND a.status='reserved' AND a.id<>NEW.id
              AND s.starts<COALESCE(t.blocked_until,t.ends) AND COALESCE(s.blocked_until,s.ends)>t.starts);
          END''')
    materialize(db)
    db.execute('PRAGMA user_version=5')
    db.commit()


def materialize(db):
    """Run under the migration lock. Never rewrite a saved appointment's slot."""
    db.execute('UPDATE slots SET active=0 WHERE version<>?', (s.CONFIG['version'],))
    db.execute('UPDATE proposals SET expires=0 WHERE result_id IS NULL AND version<>?', (s.CONFIG['version'],))
    first, last = date.fromisoformat(s.CONFIG['effective_from']), date.fromisoformat(s.CONFIG['effective_to'])
    day = first
    generation_now = datetime(2026, 8, 1, tzinfo=timezone.utc)
    dates, slots = [], []
    while day < last:
        reason = s.day_reason(s.service('cook-counseling'), day, generation_now)
        term = 'fall' if day < date(2026,12,17) else 'spring' if day >= date(2027,1,19) else 'winter-break'
        dates.append((str(day),day.year,day.month,day.day,day.weekday(),term,reason))
        for service_id in s.SERVICES:
            for slot in s.candidates(service_id, day, generation_now):
                slots.append(tuple(slot[k] for k in
                  ['id','center_id','starts','ends','service_id','resource_id','version','local_date','blocked_until']))
        day += timedelta(days=1)
    db.executemany('INSERT OR IGNORE INTO calendar_dates VALUES (?,?,?,?,?,?,?)', dates)
    db.executemany('''INSERT OR IGNORE INTO slots
        (id,center_id,starts,ends,service_id,resource_id,version,local_date,blocked_until,active)
        VALUES (?,?,?,?,?,?,?,?,?,1)''', slots)
    # Upgrade retention of existing records without changing their times or ownership.
    for row in db.execute('''SELECT a.id,a.owner,s.ends FROM appointments a JOIN slots s ON s.id=a.slot_id
            WHERE a.retain_until IS NULL AND a.record_origin='user_created' ''').fetchall():
        expiry = (datetime.fromisoformat(row['ends'])+timedelta(days=30)).timestamp()
        db.execute('UPDATE appointments SET retain_until=? WHERE id=?', (expiry,row['id']))
        db.execute('UPDATE sessions SET expires=CASE WHEN expires<? THEN ? ELSE expires END WHERE id=?',
                   (expiry,expiry,row['owner']))
    return len(slots)


def seed(db):
    """Operator-only; bounded local Faker generation writes directly to Lakebase."""
    if db.execute('SELECT id FROM seed_batches WHERE id=?', (BATCH,)).fetchone():
        return json.loads(db.execute('SELECT manifest FROM seed_batches WHERE id=?',(BATCH,)).fetchone()[0])
    from faker import Faker
    fake = Faker('en_US'); fake.seed_instance(SEED)
    rng = random.Random(SEED)
    people = [fake.name() for _ in range(250)]
    owners = [hashlib.sha256(f'{BATCH}:person:{i}'.encode()).hexdigest() for i in range(len(people))]
    db.executemany("INSERT OR IGNORE INTO sessions(id,expires,kind) VALUES (?,?,'seed')", [(owner,4102444800) for owner in owners])
    occupied = [(dict(r)) for r in db.execute('''SELECT a.owner,s.resource_id,s.starts,
        COALESCE(s.blocked_until,s.ends) AS until FROM appointments a JOIN slots s ON s.id=a.slot_id
        WHERE a.status='reserved' ''').fetchall()]
    used = {}
    for r in occupied:
        for key in [r['owner'],r['resource_id']]: used.setdefault(key,[]).append((r['starts'],r['until']))
    def conflict(key, slot):
        return any(a < slot['blocked_until'] and b > slot['starts'] for a,b in used.get(key,[]))
    groups = {}
    for row in db.execute('SELECT * FROM slots WHERE active=1 ORDER BY local_date,service_id,starts').fetchall():
        row = dict(row)
        groups.setdefault((row['local_date'],row['service_id']),[]).append(row)
    appointments = []
    for (day,_), slots in groups.items():
        free = [x for x in slots if not conflict(x['resource_id'],x)]
        # Fixed weighted occupancy is illustrative, not measured demand.
        fraction = 0.42 if date.fromisoformat(day).weekday()<2 else 0.30
        count = min(max(0,len(free)-2), int(len(slots)*fraction + rng.random()))
        ranked = sorted(free, key=lambda x: rng.random() / (1.8 if 11<=datetime.fromisoformat(x['starts']).astimezone(s.TZ).hour<=14 else 1))
        for slot in ranked[:count]:
            indices = list(range(len(people))); rng.shuffle(indices)
            person = next((i for i in indices if not conflict(owners[i],slot)),None)
            if person is None: continue
            ident = hashlib.sha256(f'{BATCH}:{slot["id"]}'.encode()).hexdigest()[:32]
            appointments.append((ident,owners[person],slot['id'],ident,'2026-08-01T00:00:00+00:00',people[person],BATCH))
            for key in [owners[person],slot['resource_id']]:
                used.setdefault(key,[]).append((slot['starts'],slot['blocked_until']))
    db.executemany('''INSERT INTO appointments
        (id,owner,slot_id,status,request_id,created_at,booking_name,record_origin,seed_batch)
        VALUES (?,?,?,'reserved',?,?,?,'seeded',?)''', appointments)
    manifest = dict(batch=BATCH,seed=SEED,version=s.CONFIG['version'],calendar_dates=262,
                    slots=sum(map(len,groups.values())),seeded_reservations=len(appointments),
                    assumptions='Fictional names and weighted occupancy; 30 minute visits + 30 minute buffer. No provider feed.',
                    schedule=s.CONFIG)
    db.execute('INSERT INTO seed_batches VALUES (?,?,?,?)',(BATCH,SEED,s.CONFIG['version'],json.dumps(manifest)))
    return manifest
