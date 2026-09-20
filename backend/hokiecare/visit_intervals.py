"""Remove the optional demo buffer without changing saved visits or inventory."""


def migrate_sqlite(db):
    if db.execute('PRAGMA user_version').fetchone()[0] >= 7:
        return
    db.execute('BEGIN IMMEDIATE')
    db.execute('UPDATE slots SET blocked_until=ends')
    for event in ('INSERT', 'UPDATE'):
        db.execute(f'DROP TRIGGER IF EXISTS protect_interval_{event.lower()}')
        db.execute(f'''CREATE TRIGGER protect_interval_{event.lower()} BEFORE {event} ON appointments
            WHEN NEW.status='reserved' BEGIN
            SELECT RAISE(ABORT,'reservation_overlap') WHERE EXISTS (
                SELECT 1 FROM appointments a JOIN slots s ON s.id=a.slot_id
                JOIN slots t ON t.id=NEW.slot_id
                WHERE a.id<>NEW.id AND a.status='reserved'
                AND (s.resource_id=t.resource_id OR a.owner=NEW.owner)
                AND s.starts<t.ends AND s.ends>t.starts);
            END''')
    db.execute('PRAGMA user_version=7')
    db.commit()
