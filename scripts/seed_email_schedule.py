"""Load a private JSON mock schedule. Does not subscribe recipients or send email."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from hokiecare import booking
from hokiecare.appointment_emails import normalize_email

CENTERS = {center['name'] for center in booking.CENTERS}


def load_rows(path):
    data = json.loads(Path(path).read_text(encoding='utf-8-sig'))
    if not isinstance(data, list) or not data or len(data) > 1000:
        raise ValueError('Expected 1–1000 mock schedule rows')
    rows, ids = [], set()
    for row in data:
        if set(row) != {'id', 'email', 'health_center', 'starts_at'}:
            raise ValueError('Each row needs id, email, health_center and starts_at')
        if not isinstance(row['id'], str) or not row['id'] or len(row['id']) > 100 or row['id'] in ids:
            raise ValueError('Schedule IDs must be unique and 1–100 characters')
        ids.add(row['id'])
        if row['health_center'] not in CENTERS:
            raise ValueError('Use the corrected full health-center name from the catalog')
        start = datetime.fromisoformat(row['starts_at'])
        if start.tzinfo is None:
            raise ValueError('Appointment time must include its UTC offset')
        rows.append((row['id'], normalize_email(row['email']), row['health_center'], start.astimezone(timezone.utc).isoformat()))
    return rows


def seed(db, rows):
    for row in rows:
        db.execute('''INSERT INTO mock_email_schedule(id,email,health_center,starts_at) VALUES (?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET email=excluded.email,health_center=excluded.health_center,
            starts_at=excluded.starts_at,revision=mock_email_schedule.revision+1
            WHERE mock_email_schedule.email<>excluded.email OR mock_email_schedule.health_center<>excluded.health_center
            OR mock_email_schedule.starts_at<>excluded.starts_at''', row)
    # Read back the exact values, without printing addresses.
    for row in rows:
        actual = db.execute('SELECT id,email,health_center,starts_at FROM mock_email_schedule WHERE id=?', (row[0],)).fetchone()
        assert tuple(actual[key] for key in ('id','email','health_center','starts_at')) == row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--file', required=True, help='Private JSON file; keep real addresses out of Git')
    parser.add_argument('--local', action='store_true', help='Explicitly seed local SQLite instead of Lakebase')
    parser.add_argument('--apply-schema', action='store_true', help='Create additive email tables as the selected Lakebase schema owner')
    args = parser.parse_args()
    if args.local:
        os.environ['HOKIECARE_BOOKING_STORE'] = 'sqlite'
    elif os.environ.get('HOKIECARE_BOOKING_STORE') != 'lakebase':
        parser.error('Set HOKIECARE_BOOKING_STORE=lakebase, or explicitly select --local for SQLite')
    rows = load_rows(args.file)
    with booking.database() as db:
        db.execute('BEGIN IMMEDIATE')
        if args.apply_schema:
            for statement in (Path(booking.__file__).with_name('email_schema.sql')).read_text().split(';'):
                if statement.strip():
                    db.execute(statement)
        seed(db, rows)
    print(f'Inserted/verified {len(rows)} mock schedule rows in {os.environ["HOKIECARE_BOOKING_STORE"]}. No emails sent.')


if __name__ == '__main__':
    main()
