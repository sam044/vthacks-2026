"""Owner-only exact-time waiting; offers never hold appointment capacity."""
from datetime import datetime, timedelta, timezone
import secrets
from fastapi import APIRouter, HTTPException, Request, Response
from . import booking as b, calendar as cal, scheduling as s
from .intake import Intake, submit

router = APIRouter(prefix='/api/booking/waitlist')
ACTIVE = ('waiting', 'available')
SCHEMA = '''
CREATE TABLE IF NOT EXISTS waitlist (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 slot_id TEXT NOT NULL REFERENCES slots(id), created_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('waiting','available','fulfilled','left','expired')),
 result_id TEXT REFERENCES appointments(id) ON DELETE SET NULL);
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_active_owner_slot ON waitlist(owner,slot_id)
 WHERE status IN ('waiting','available');
CREATE INDEX IF NOT EXISTS waitlist_slot_status ON waitlist(slot_id,status);
'''


def migrate_sqlite(db):
    if db.execute('PRAGMA user_version').fetchone()[0] >= 6:
        return
    db.execute('BEGIN IMMEDIATE')
    for statement in SCHEMA.split(';'):
        if statement.strip(): db.execute(statement)
    db.execute('ALTER TABLE proposals ADD COLUMN waitlist_id TEXT REFERENCES waitlist(id) ON DELETE SET NULL')
    db.execute('PRAGMA user_version=6')
    db.commit()


def reconcile(db):
    """Recompute from authoritative capacity, including buffers and owner conflicts.

    Writers call this inside their booking transaction. Private reads reconcile
    under the same lock, recovering missed events and out-of-band inventory edits.
    No identities or waitlist details enter the public outbox.
    """
    now = datetime.now(timezone.utc).isoformat()
    db.execute('''UPDATE waitlist SET status='expired' WHERE status IN ('waiting','available')
        AND EXISTS(SELECT 1 FROM slots s WHERE s.id=waitlist.slot_id
            AND (s.active<>1 OR s.version<>? OR s.starts<=?))''', (s.CONFIG['version'], now))
    # A normal booking of the requested slot also satisfies that student's entry.
    db.execute('''UPDATE waitlist SET status='fulfilled',result_id=(
        SELECT a.id FROM appointments a WHERE a.owner=waitlist.owner
        AND a.slot_id=waitlist.slot_id AND a.status='reserved')
        WHERE status IN ('waiting','available') AND EXISTS (
        SELECT 1 FROM appointments a WHERE a.owner=waitlist.owner
        AND a.slot_id=waitlist.slot_id AND a.status='reserved')''')
    # Select explicit aliases: both tables have an id column.
    for row in db.execute('''SELECT w.id AS entry_id,w.owner,w.status,s.* FROM waitlist w
        JOIN slots s ON s.id=w.slot_id WHERE w.status IN ('waiting','available')''').fetchall():
        occupied=db.execute('''SELECT 1 FROM appointments a JOIN slots t ON t.id=a.slot_id
            WHERE a.status='reserved' AND (t.resource_id=? OR a.owner=?)
            AND t.starts<? AND COALESCE(t.blocked_until,t.ends)>? LIMIT 1''',
            (row['resource_id'],row['owner'],row['blocked_until'] or row['ends'],row['starts'])).fetchone()
        status='waiting' if occupied else 'available'
        if status!=row['status']:
            db.execute('UPDATE waitlist SET status=? WHERE id=?',(status,row['entry_id']))


def get_entry(db, owner, ident):
    row=db.execute('SELECT * FROM waitlist WHERE id=? AND owner=?',(ident,owner)).fetchone()
    if not row: raise HTTPException(404,'Waitlist entry not found.')
    return row


def view(db, row):
    slot=dict(db.execute('SELECT * FROM slots WHERE id=?',(row['slot_id'],)).fetchone())
    return dict(id=row['id'],slot=slot,status=row['status'],created_at=row['created_at'],
                result_id=row['result_id'],service_name=s.service(slot['service_id'])['name'])


def review_target(db, owner, ident):
    row=get_entry(db,owner,ident)
    if row['status'] not in ACTIVE:
        raise HTTPException(409,'This waitlist entry is no longer active.')
    slot=s.resolve_slot(row['slot_id'],db)
    try: cal.check_conflict(db,slot,owner)
    except HTTPException:
        raise HTTPException(409,'This time is no longer available. You are still on the waitlist.') from None
    return slot


@router.post('')
def join(body:b.ReserveRequest, request:Request, response:Response):
    b.require_write(request)
    with b.database() as db:
        db.execute('BEGIN IMMEDIATE'); b.cleanup(db)
        owner=b.session_id(request,db)
        slot=s.resolve_slot(body.slot_id,db)
        old=db.execute("SELECT * FROM waitlist WHERE owner=? AND slot_id=? AND status IN ('waiting','available')",
                       (owner,slot['id'])).fetchone()
        if old:
            b.renew_cookie(db,owner,request,response)
            return view(db,old)
        if db.execute('''SELECT 1 FROM appointments a JOIN slots t ON t.id=a.slot_id
            WHERE a.owner=? AND a.status='reserved' AND t.starts<?
            AND COALESCE(t.blocked_until,t.ends)>?''',(owner,slot['blocked_until'],slot['starts'])).fetchone():
            raise HTTPException(409,'You already have an appointment that conflicts with this time.')
        # Joining after a cancellation raced the click is harmless: offer it now.
        if db.execute("SELECT COUNT(*) FROM waitlist WHERE owner=?",(owner,)).fetchone()[0]>=50:
            raise HTTPException(429,'Waitlist limit reached for this browser session.')
        ident=secrets.token_urlsafe(24)
        db.execute("INSERT INTO waitlist(id,owner,slot_id,created_at,status) VALUES (?,?,?,?,'waiting')",
                   (ident,owner,slot['id'],datetime.now(timezone.utc).isoformat()))
        reconcile(db)
        expiry=(datetime.fromisoformat(slot['ends'])+timedelta(days=1)).timestamp()
        b.renew_cookie(db,owner,request,response,expiry)
        return view(db,get_entry(db,owner,ident))


@router.get('')
def list_mine(request:Request):
    with b.database() as db:
        db.execute('BEGIN IMMEDIATE'); b.cleanup(db)
        owner=b.session_id(request,db)
        reconcile(db)
        return {'revision':db.execute('SELECT COALESCE(MAX(id),0) FROM outbox_events').fetchone()[0],
                'entries':[view(db,r) for r in db.execute(
            "SELECT * FROM waitlist WHERE owner=? AND status<>'left' ORDER BY created_at,id",(owner,)).fetchall()]}


@router.delete('/{ident}')
def leave(ident:str, request:Request):
    b.require_write(request)
    with b.database() as db:
        db.execute('BEGIN IMMEDIATE')
        owner=b.session_id(request,db)
        row=get_entry(db,owner,ident)
        if row['status'] in ACTIVE:
            db.execute("UPDATE waitlist SET status='left' WHERE id=?",(ident,))
            db.execute('UPDATE proposals SET expires=0 WHERE waitlist_id=? AND result_id IS NULL',(ident,))
        return {'left':True}


@router.post('/{ident}/review')
def prepare(ident:str, body:Intake, request:Request):
    # Same required intake, sourced model routing, and owner-bound confirmation.
    if body.waitlist_id and body.waitlist_id!=ident:
        raise HTTPException(422,'Waitlist selection does not match this request.')
    return submit(body.model_copy(update={'waitlist_id':ident}),request)
