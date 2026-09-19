"""Synthetic bookings only. Provider sessions and health narratives never enter this store."""
from contextlib import contextmanager
from datetime import date, datetime, time as daytime, timedelta, timezone
import hashlib
import os
from pathlib import Path
import secrets
import sqlite3
import time
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix='/api/booking')
TZ = ZoneInfo('America/New_York')
COOKIE = 'hokiecare_demo'
LIFETIME = 86400
CENTERS = [
    dict(id='schiffert', name='Schiffert Health Center', kind='portal', category='physical-health',
         description='Campus medical appointments through Healthy Hokies.',
         source_url='https://healthcenter.vt.edu/appointments.html',
         booking_url='https://hokies.healthcenter.vt.edu/Home',
         note='Requires VT sign-in, Duo, and screening. The companion can read displayed times and select one. Finish and verify booking in the official portal.'),
    dict(id='cook', name='Cook Counseling Center', kind='demo', category='mental-health',
         description='Try our complete appointment workflow with fictional Cook times.',
         source_url='https://ucc.vt.edu/appointment.html', booking_url=None,
         note='Demo only. These reservations are not sent to Cook. Official scheduling is by phone.'),
    dict(id='timelycare', name='TimelyCare', kind='external', category='mental-health',
         description='Human scheduled counseling and separate on-demand TalkNow support.',
         source_url='https://ucc.vt.edu/timelycare.html', booking_url='https://ucc.vt.edu/timelycare.html',
         note='Scheduled TimelyCare therapy cannot run concurrently with individual Cook therapy. TalkNow is separate.'),
    dict(id='carilion', name='Carilion Clinic', kind='external', category='physical-health',
         description='Choose a specific practice and visit type through Carilion.',
         source_url='https://www.carilionclinic.org/mychart', booking_url='https://www.carilionclinic.org/mychart',
         note='MyChart offers direct scheduling and requests needing staff confirmation. Eligibility and location vary.'),
    dict(id='wellness', name='Hokie Wellness', kind='external', category='wellbeing',
         description='BASICS, financial wellness coaching, and recovery consultations.',
         source_url='https://hokiewellness.vt.edu/students/our_services/consultations.html',
         booking_url='https://hokiewellness.vt.edu/students/our_services/consultations.html',
         note='Different programs use different interest forms. These are not general medical appointments.'),
]


class StrictBody(BaseModel):
    model_config = ConfigDict(extra='forbid')


class DayRequest(StrictBody):
    day: date
    center_id: Literal['cook'] = 'cook'


class ReserveRequest(StrictBody):
    slot_id: str = Field(min_length=1, max_length=100)
    request_id: str = Field(min_length=16, max_length=64, pattern=r'^[a-zA-Z0-9-]+$')


def database_path():
    return Path(os.environ.get('HOKIECARE_BOOKING_DB', 'runtime/appointments.sqlite3'))


@contextmanager
def database():
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript('''
        CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS slots (
            id TEXT PRIMARY KEY, center_id TEXT NOT NULL, starts TEXT NOT NULL, ends TEXT NOT NULL,
            UNIQUE(center_id, starts));
        CREATE TABLE IF NOT EXISTS appointments (
            id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            slot_id TEXT NOT NULL REFERENCES slots(id), status TEXT NOT NULL,
            request_id TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(owner, request_id));
        CREATE UNIQUE INDEX IF NOT EXISTS one_reservation ON appointments(slot_id) WHERE status='reserved';
        PRAGMA user_version=1;
    ''')
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def require_write(request: Request):
    # Custom header plus same-origin policy blocks form/CSRF requests. No CORS is enabled.
    if request.headers.get('x-hokiecare-action') != '1':
        raise HTTPException(403, 'Open this action in HokieCare.')
    origin = request.headers.get('origin')
    allowed = {os.environ.get('HOKIECARE_PUBLIC_ORIGIN', 'https://vthacks-2026-production.up.railway.app')}
    if os.environ.get('HOKIECARE_COOKIE_SECURE', 'true').lower() == 'false':
        allowed.update(['http://127.0.0.1:8000', 'http://localhost:8000', 'http://127.0.0.1:5173'])
    if origin and origin not in allowed:
        raise HTTPException(403, 'Request origin is not allowed.')


def session_id(request: Request, db):
    token = request.cookies.get(COOKIE, '')
    if not token or len(token) > 128:
        raise HTTPException(401, 'Start a demo session to manage appointments.')
    hashed = hashlib.sha256(token.encode()).hexdigest()
    if not db.execute('SELECT 1 FROM sessions WHERE id=? AND expires>?', (hashed, time.time())).fetchone():
        raise HTTPException(401, 'Your demo session expired. Start a new session.')
    return hashed


def cleanup(db):
    db.execute('DELETE FROM sessions WHERE expires<=?', (time.time(),))


def appointment(row):
    return {**dict(row), 'origin': 'demo', 'center_name': 'Cook Counseling Center',
            'timezone': 'America/New_York', 'notice': 'Demo appointment. Not booked with Cook.'}


def get_appointment(db, owner, ident):
    row = db.execute('''SELECT a.id, a.status, a.created_at, s.id AS slot_id, s.center_id, s.starts, s.ends
        FROM appointments a JOIN slots s ON a.slot_id=s.id WHERE a.owner=? AND a.id=?''', (owner, ident)).fetchone()
    if not row:
        raise HTTPException(404, 'Appointment not found.')
    return appointment(row)


@router.get('/catalog')
def catalog():
    return {'centers': CENTERS, 'timezone': 'America/New_York',
            'companion': {'provider': 'schiffert', 'automation_verified': False,
                          'availability_verified': True, 'status': 'availability_verified_final_submission_unverified'}}


@router.post('/session')
def start_session(request: Request, response: Response):
    require_write(request)
    with database() as db:
        cleanup(db)
        try:
            session_id(request, db)
            return {'status': 'active', 'origin': 'demo', 'retention_hours': 24}
        except HTTPException:
            pass
        # The global API limiter also bounds anonymous session creation.
        if db.execute('SELECT COUNT(*) FROM sessions').fetchone()[0] >= 2000:
            raise HTTPException(503, 'The demo is full. Please try again later.')
        token = secrets.token_urlsafe(32)
        db.execute('INSERT INTO sessions VALUES (?,?)', (hashlib.sha256(token.encode()).hexdigest(), time.time()+LIFETIME))
    response.set_cookie(COOKIE, token, max_age=LIFETIME, httponly=True, samesite='strict',
                        secure=os.environ.get('HOKIECARE_COOKIE_SECURE', 'true').lower() != 'false', path='/api')
    return {'status': 'active', 'origin': 'demo', 'retention_hours': 24}


@router.get('/appointments')
def appointments(request: Request):
    with database() as db:
        owner = session_id(request, db)
        rows = db.execute('''SELECT a.id, a.status, a.created_at, s.id AS slot_id, s.center_id, s.starts, s.ends
            FROM appointments a JOIN slots s ON a.slot_id=s.id WHERE a.owner=? ORDER BY s.starts''', (owner,)).fetchall()
    return {'appointments': [appointment(r) for r in rows], 'origin': 'demo'}


@router.get('/slots')
def slots(day: date):
    with database() as db:
        cleanup(db)
        rows = db.execute('''SELECT s.* FROM slots s WHERE NOT EXISTS
            (SELECT 1 FROM appointments a WHERE a.slot_id=s.id AND a.status='reserved') ORDER BY s.starts''').fetchall()
    now = datetime.now(timezone.utc)
    return {'slots': [{**dict(r), 'origin': 'demo'} for r in rows
                      if datetime.fromisoformat(r['starts']).astimezone(TZ).date() == day
                      and datetime.fromisoformat(r['starts']) > now], 'origin': 'demo'}


@router.post('/demo-times')
def publish_demo_times(body: DayRequest, request: Request):
    require_write(request)
    today = datetime.now(TZ).date()
    if body.day <= today or body.day > today + timedelta(days=30) or body.day.weekday() > 4:
        raise HTTPException(422, 'Choose a weekday in the next 30 days, starting tomorrow.')
    with database() as db:
        session_id(request, db)
        for hour in (9, 10, 11, 14, 15):
            start = datetime.combine(body.day, daytime(hour), TZ).astimezone(timezone.utc)
            end = start + timedelta(minutes=45)
            db.execute('INSERT OR IGNORE INTO slots VALUES (?,?,?,?)',
                       (f'cook-{body.day.isoformat()}-{hour}', 'cook', start.isoformat(), end.isoformat()))
    return slots(body.day)


@router.post('/appointments', status_code=201)
def reserve(body: ReserveRequest, request: Request):
    require_write(request)
    with database() as db:
        db.execute('BEGIN IMMEDIATE')
        cleanup(db)
        owner = session_id(request, db)
        existing = db.execute('SELECT id,slot_id FROM appointments WHERE owner=? AND request_id=?',
                              (owner, body.request_id)).fetchone()
        if existing:
            if existing['slot_id'] != body.slot_id:
                raise HTTPException(409, 'This request was already used for a different time.')
            return get_appointment(db, owner, existing['id'])
        slot = db.execute('SELECT * FROM slots WHERE id=?', (body.slot_id,)).fetchone()
        if not slot or datetime.fromisoformat(slot['starts']) <= datetime.now(timezone.utc):
            raise HTTPException(409, 'This time is no longer available.')
        if db.execute("SELECT COUNT(*) FROM appointments WHERE owner=?", (owner,)).fetchone()[0] >= 50:
            raise HTTPException(429, 'This session has reached its demo appointment limit.')
        conflict = db.execute('''SELECT 1 FROM appointments a JOIN slots s ON a.slot_id=s.id
            WHERE a.owner=? AND a.status='reserved' AND s.starts<? AND s.ends>?''',
            (owner, slot['ends'], slot['starts'])).fetchone()
        if conflict:
            raise HTTPException(409, 'You already have a demo appointment at this time.')
        ident = secrets.token_urlsafe(16)
        try:
            db.execute('INSERT INTO appointments VALUES (?,?,?,?,?,?)',
                       (ident, owner, body.slot_id, 'reserved', body.request_id, datetime.now(timezone.utc).isoformat()))
        except sqlite3.IntegrityError:
            raise HTTPException(409, 'Another demo user reserved this time. Choose another slot.') from None
        return get_appointment(db, owner, ident)


@router.post('/appointments/{ident}/cancel')
def cancel(ident: str, request: Request):
    require_write(request)
    with database() as db:
        owner = session_id(request, db)
        get_appointment(db, owner, ident)
        db.execute("UPDATE appointments SET status='cancelled' WHERE id=? AND owner=?", (ident, owner))
        return get_appointment(db, owner, ident)


@router.delete('/session')
def delete_session(request: Request, response: Response):
    require_write(request)
    with database() as db:
        owner = session_id(request, db)
        db.execute('DELETE FROM sessions WHERE id=?', (owner,))
    response.delete_cookie(COOKIE, path='/api')
    return {'deleted': True}
