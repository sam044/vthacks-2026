"""Real emails for a mock schedule: schedule and delivery jobs are the only tables."""
from datetime import datetime
import hmac
import os
import re
import secrets
import time

from fastapi import APIRouter, HTTPException, Request
from pydantic import Field, field_validator

from . import booking as b, mailer

router = APIRouter(prefix='/api/booking/email')


def normalize_email(value):
    value = value.strip().lower()
    if not re.fullmatch(r'[a-z0-9]+(?:[._+\-][a-z0-9]+)*@[a-z0-9]+(?:[.\-][a-z0-9]+)*\.[a-z]{2,63}', value) or len(value) > 254:
        raise ValueError('Enter a valid email address.')
    return value


class EmailRequest(b.StrictBody):
    email: str = Field(min_length=6, max_length=254)
    consent: bool

    @field_validator('email')
    @classmethod
    def valid_email(cls, value):
        return normalize_email(value)


class Stop(b.StrictBody):
    token: str = Field(min_length=32, max_length=128)


def require_email():
    if not mailer.ready():
        raise HTTPException(503, 'Email delivery is not configured yet. Connect SMTP before requesting emails.')


@router.get('/settings')
def email_settings():
    return {'enabled': mailer.ready(), 'reminder_hours': 24, 'schedule': 'mock',
            'storage': 'Databricks Lakebase' if os.environ.get('HOKIECARE_BOOKING_STORE') == 'lakebase' else 'Local SQLite preview'}


def queue_appointment(db, row):
    """Idempotent per appointment, recipient, revision and message kind."""
    now = time.time()
    if row['status'] != 'scheduled' or datetime.fromisoformat(row['starts_at']).timestamp() <= now:
        return
    prior = db.execute('''SELECT cancel_token,stopped FROM appointment_email_jobs
        WHERE schedule_id=? AND recipient_email=? ORDER BY stopped DESC LIMIT 1''', (row['id'], row['email'])).fetchone()
    if prior and prior['stopped']:
        return
    token = prior['cancel_token'] if prior else secrets.token_urlsafe(32)
    starts = datetime.fromisoformat(row['starts_at']).timestamp()
    for kind, due in [('confirmation', now), ('reminder', starts - 86400)]:
        state = 'skipped' if kind == 'reminder' and due <= now else 'pending'
        db.execute('''INSERT OR IGNORE INTO appointment_email_jobs
            (id,schedule_id,recipient_email,cancel_token,schedule_revision,kind,due,state) VALUES (?,?,?,?,?,?,?,?)''',
            (secrets.token_hex(16), row['id'], row['email'], token, row['revision'], kind, due, state))


@router.post('/request', status_code=202)
def request_emails(body: EmailRequest, request: Request):
    b.require_write(request)
    require_email()
    if not body.consent:
        raise HTTPException(422, 'Consent is required to send appointment emails.')
    with b.database() as db:
        db.execute('BEGIN IMMEDIATE')
        # Exact matching: never accept a time, center or recipient override from the form.
        rows = db.execute("SELECT * FROM mock_email_schedule WHERE email=? AND status='scheduled'", (body.email,)).fetchall()
        for row in rows:
            queue_appointment(db, row)
    # Appointment data goes only to the stored email, never to this unauthenticated browser.
    return {'state': 'queued', 'notice': 'If your email matches an upcoming mock appointment, '
            'its confirmation is queued and a reminder is scheduled 24 hours before. Previously requested emails are not duplicated.'}


@router.post('/{ident}/stop')
def stop_emails(ident: str, body: Stop, request: Request):
    b.require_write(request)
    with b.database() as db:
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT schedule_id,recipient_email,cancel_token FROM appointment_email_jobs WHERE id=?', (ident,)).fetchone()
        if row:
            if not hmac.compare_digest(row['cancel_token'], body.token):
                raise HTTPException(404, 'Email request not found.')
            db.execute('''UPDATE appointment_email_jobs SET stopped=1,
                state=CASE WHEN state IN ('pending','sending') THEN 'skipped' ELSE state END
                WHERE schedule_id=? AND recipient_email=?''', (row['schedule_id'], row['recipient_email']))
    return {'state': 'off'}


def message(row):
    starts = datetime.fromisoformat(row['starts_at']).astimezone(b.TZ)
    label = 'Confirmation' if row['kind'] == 'confirmation' else 'Reminder'
    link = f"{mailer.settings()['origin']}/#stop-email={row['id']}&token={row['cancel_token']}"
    body = (f'DEMO ONLY — {label} for your mock appointment\n\n'
            f"Health center: {row['health_center']}\nTime: {starts.strftime('%A, %B %d, %Y at %I:%M %p %Z')} (America/New_York)\n\n"
            'This is a real email about MOCK appointment data from HokieCare. No appointment has been booked with the health center.\n'
            'The time and health center above were read from the scheduling database.\n\n'
            f'Stop future emails for this mock appointment: {link}\n')
    return f'HokieCare DEMO appointment {label.lower()}', body


def deliver_due(limit=100):
    """Re-read the stored email/time/center combo immediately before SMTP."""
    require_email()
    with b.database() as db:
        db.execute('BEGIN IMMEDIATE')
        # Refresh revisions only for appointments whose recipient requested emails.
        rows = db.execute('''SELECT DISTINCT m.* FROM mock_email_schedule m
            JOIN appointment_email_jobs j ON j.schedule_id=m.id AND j.recipient_email=m.email
            WHERE j.stopped=0 AND m.status='scheduled' ''').fetchall()
        for row in rows:
            queue_appointment(db, row)
    delivered = 0
    for _ in range(limit):
        now = time.time()
        claim = secrets.token_hex(16)
        with b.database() as db:
            db.execute('BEGIN IMMEDIATE')
            job = db.execute('''SELECT * FROM appointment_email_jobs WHERE stopped=0 AND
                ((state='pending' AND due<=?) OR (state='sending' AND lease_until<=?))
                ORDER BY due,id LIMIT 1''', (now, now)).fetchone()
            if not job:
                break
            if job['attempts'] >= 5:
                db.execute("UPDATE appointment_email_jobs SET state='failed' WHERE id=?", (job['id'],))
                continue
            db.execute("UPDATE appointment_email_jobs SET state='sending',lease_until=?,claim_token=?,attempts=attempts+1 WHERE id=?",
                       (now + 300, claim, job['id']))
        # Do not hold the booking transaction lock over SMTP.
        with b.database() as db:
            row = db.execute('''SELECT j.*,m.email,m.health_center,m.starts_at FROM appointment_email_jobs j
                JOIN mock_email_schedule m ON m.id=j.schedule_id AND m.email=j.recipient_email
                WHERE j.id=? AND j.claim_token=? AND j.state='sending' AND j.stopped=0
                AND m.status='scheduled' AND m.revision=j.schedule_revision''', (job['id'], claim)).fetchone()
        state, error = 'skipped', None
        if row and datetime.fromisoformat(row['starts_at']).timestamp() > time.time():
            try:
                subject, body = message(row)
                mailer.send(row['email'], subject, body, row['id'])
                state = 'sent'
                delivered += 1
            except Exception as exc:
                error = type(exc).__name__
                state = 'failed' if job['attempts'] + 1 >= 5 else 'pending'
        with b.database() as db:
            db.execute('''UPDATE appointment_email_jobs SET state=?,sent_at=?,error_class=?,due=?
                WHERE id=? AND claim_token=? AND state='sending' ''',
                (state, time.time() if state == 'sent' else None, error,
                 time.time() + min(3600, 60 * 2 ** job['attempts']) if state == 'pending' else job['due'], job['id'], claim))
    return delivered


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Send real emails for the stored mock appointment schedule.')
    parser.add_argument('--once', action='store_true', help='Run one bounded delivery pass.')
    args = parser.parse_args()
    while True:
        try:
            print(f'Delivered {deliver_due()} mock appointment emails.', flush=True)
        except Exception as exc:
            print(f'Email worker unavailable: {type(exc).__name__}', flush=True)
            if args.once:
                raise SystemExit(1) from None
        if args.once:
            break
        time.sleep(15)
