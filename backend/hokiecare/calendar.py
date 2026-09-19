"""Shared anonymous demo inventory and owner-bound reviewed booking operations."""
import asyncio
from datetime import date, datetime, timedelta, timezone
import json
import secrets
import sqlite3
import time
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import Field
from . import booking as b
from . import scheduling as s

router = APIRouter(prefix='/api/booking')


def validate_stored_slot(slot):
    # Legacy slots retain their IDs but must still satisfy the current policy.
    day = datetime.fromisoformat(slot['starts']).astimezone(s.TZ).date()
    if not any(c['starts'] == slot['starts'] and c['ends'] == slot['ends']
               for c in s.candidates(slot['service_id'], day)):
        raise HTTPException(409, 'Schedule changed or this time expired. Refresh availability.')


@router.get('/rules')
def rules(service_id: str):
    return {'service': s.service(service_id), 'timezone': s.CONFIG['timezone'],
            'version': s.CONFIG['version'], 'horizon_days': s.CONFIG['horizon_days'],
            'exceptions': s.CONFIG['exceptions'] if s.service(service_id)['campus'] else []}


@router.get('/availability')
def availability(service_id: str, start: date = Query(alias='from'), end: date = Query(alias='to'), mode: str = 'provider'):
    service = s.service(service_id)
    if not 0 < (end-start).days <= 32 or mode not in ('demo', 'provider'):
        raise HTTPException(422, 'Use an exclusive date range of 1–32 days and demo or provider mode.')
    now = datetime.now(timezone.utc)
    days, slots, revision = [], [], 0
    occupied = []
    if mode == 'demo':
        with b.database() as db:
            b.cleanup(db)
            occupied = db.execute('''SELECT s.starts,s.ends FROM appointments a JOIN slots s ON s.id=a.slot_id
                JOIN sessions u ON u.id=a.owner WHERE s.resource_id=? AND a.status='reserved' AND u.expires>?
                AND s.starts<? AND s.ends>?''', (service['resource_id'],time.time(),
                    datetime.combine(end,datetime.min.time(),s.TZ).astimezone(timezone.utc).isoformat(),
                    datetime.combine(start,datetime.min.time(),s.TZ).astimezone(timezone.utc).isoformat())).fetchall()
            revision = db.execute('SELECT COALESCE(MAX(id),0) FROM outbox_events').fetchone()[0]
    day = start
    while day < end:
        reason = s.day_reason(service,day,now) if mode == 'demo' else 'Availability not connected'
        daily = s.candidates(service_id,day,now) if mode == 'demo' else []
        for item in daily:
            if any(o['starts'] < item['ends'] and o['ends'] > item['starts'] for o in occupied):
                item['state'] = 'busy'
        days.append({'day':day.isoformat(), 'state':('not_connected' if mode=='provider' else
                    'outside_window' if reason and 'window' in reason else 'closed' if reason else 'open'),
                    'reason':reason,'available':sum(x['state']=='available' for x in daily) if mode=='demo' else None})
        slots.extend(daily)
        day += timedelta(days=1)
    return {'days':days,'slots':slots,'service_id':service_id,'timezone':s.CONFIG['timezone'],
            'source':mode,'coverage':'complete_demo' if mode=='demo' else 'none',
            'fetched_at':now.isoformat(),'expires_at':(now+timedelta(seconds=15)).isoformat(),
            'revision':revision,'version':s.CONFIG['version'],
            'storage': __import__('os').environ.get('HOKIECARE_BOOKING_STORE','sqlite')}


class ProposalRequest(b.ReserveRequest):
    version: int
    appointment_id: str | None = Field(default=None,max_length=100)


def proposal_view(db, owner, ident):
    row = db.execute('SELECT * FROM proposals WHERE id=? AND owner=?',(ident,owner)).fetchone()
    if not row: raise HTTPException(404,'Booking review not found.')
    slot = dict(db.execute('SELECT * FROM slots WHERE id=?',(row['slot_id'],)).fetchone())
    return {'id':row['id'],'slot':slot,'expires_at':row['expires'],'operation':row['operation'],
            'appointment_id':row['appointment_id'],'result_id':row['result_id'],
            'service_name':s.service(slot['service_id'])['name'],'origin':'demo',
            'notice':'Fictional reservation only. No provider is contacted.'}


def check_conflict(db,slot,owner,exclude=''):
    if db.execute('''SELECT 1 FROM appointments a JOIN slots t ON t.id=a.slot_id
        WHERE a.status='reserved' AND a.id<>? AND (t.resource_id=? OR a.owner=?)
        AND t.starts<? AND t.ends>?''',(exclude,slot['resource_id'],owner,slot['ends'],slot['starts'])).fetchone():
        raise HTTPException(409,'This time conflicts with a reservation. Refresh and choose another time.')


@router.post('/proposals')
def prepare(body: ProposalRequest,request: Request):
    b.require_write(request)
    with b.database() as db:
        db.execute('BEGIN IMMEDIATE'); b.cleanup(db)
        owner=b.session_id(request,db)
        old=db.execute('SELECT * FROM proposals WHERE owner=? AND request_id=?',(owner,body.request_id)).fetchone()
        if old:
            if old['slot_id']!=body.slot_id or old['version']!=body.version or old['appointment_id']!=body.appointment_id:
                raise HTTPException(409,'Request key already belongs to another review.')
            return proposal_view(db,owner,old['id'])
        if body.version!=s.CONFIG['version']: raise HTTPException(409,'Schedule changed. Refresh availability.')
        slot=s.resolve_slot(body.slot_id)
        if body.appointment_id:
            previous=b.get_appointment(db,owner,body.appointment_id)
            if previous['status']!='reserved': raise HTTPException(409,'Only active demo appointments can be moved.')
        check_conflict(db,slot,owner,body.appointment_id or '')
        if db.execute('SELECT COUNT(*) FROM proposals WHERE owner=?',(owner,)).fetchone()[0]>=150:
            raise HTTPException(429,'Demo review limit reached.')
        db.execute('''INSERT OR IGNORE INTO slots(id,center_id,starts,ends,service_id,resource_id,version)
            VALUES (?,?,?,?,?,?,?)''',tuple(slot[k] for k in ['id','center_id','starts','ends','service_id','resource_id','version']))
        ident=secrets.token_urlsafe(24)
        db.execute('INSERT INTO proposals(id,owner,slot_id,version,request_id,expires,operation,appointment_id,result_id,original_slot_id) VALUES (?,?,?,?,?,?,?,?,NULL,?)',
            (ident,owner,slot['id'],body.version,body.request_id,time.time()+120,
             'reschedule' if body.appointment_id else 'book',body.appointment_id,
             previous['slot_id'] if body.appointment_id else None))
        return proposal_view(db,owner,ident)


@router.get('/proposals/{ident}')
def get_proposal(ident:str,request:Request):
    with b.database() as db: return proposal_view(db,b.session_id(request,db),ident)


@router.post('/proposals/{ident}/confirm')
def confirm(ident:str,request:Request):
    b.require_write(request)
    with b.database() as db:
        db.execute('BEGIN IMMEDIATE'); b.cleanup(db)
        owner=b.session_id(request,db)
        p=db.execute('SELECT * FROM proposals WHERE id=? AND owner=?',(ident,owner)).fetchone()
        if not p: raise HTTPException(404,'Booking review not found.')
        if p['result_id']: return b.get_appointment(db,owner,p['result_id'])
        if p['expires']<time.time() or p['version']!=s.CONFIG['version']:
            raise HTTPException(409,'Review expired. Select a time and review again.')
        slot=s.resolve_slot(p['slot_id'])
        check_conflict(db,slot,owner,p['appointment_id'] or '')
        result=p['appointment_id'] or secrets.token_urlsafe(16)
        try:
            if p['operation']=='reschedule':
                old=b.get_appointment(db,owner,result)
                if old['status']!='reserved': raise HTTPException(409,'Appointment was cancelled.')
                if old['slot_id']!=p['original_slot_id']: raise HTTPException(409,'Appointment changed since this review. Review the move again.')
                db.execute('UPDATE appointments SET slot_id=? WHERE id=? AND owner=?',(slot['id'],result,owner))
            else:
                if db.execute('SELECT COUNT(*) FROM appointments WHERE owner=?',(owner,)).fetchone()[0]>=50:
                    raise HTTPException(429,'Demo appointment limit reached.')
                db.execute('INSERT INTO appointments VALUES (?,?,?,?,?,?)',
                    (result,owner,slot['id'],'reserved',f'proposal-{ident}',datetime.now(timezone.utc).isoformat()))
        except sqlite3.IntegrityError:
            raise HTTPException(409,'Another reservation conflicts. Choose another time.') from None
        db.execute('UPDATE proposals SET result_id=? WHERE id=?',(result,ident))
        return b.get_appointment(db,owner,result)


@router.get('/events')
async def events(request:Request, service_id:str, cursor:int=0):
    s.service(service_id)
    try: cursor=max(cursor,int(request.headers.get('last-event-id','0')))
    except ValueError: raise HTTPException(422,'Invalid event cursor') from None
    async def stream():
        nonlocal cursor
        # Short streams release server resources; EventSource reconnects with its cursor.
        for _ in range(25):
            if await request.is_disconnected(): break
            def read():
                with b.database() as db:
                    return [dict(r) for r in db.execute('SELECT id,service_id,day,kind FROM outbox_events WHERE service_id=? AND id>? ORDER BY id LIMIT 100',(service_id,cursor)).fetchall()]
            rows=await asyncio.to_thread(read)
            if rows:
                cursor=rows[-1]['id']
                yield f'id: {cursor}\nevent: availability\ndata: {json.dumps({"service_id":service_id,"revision":cursor})}\n\n'
            else: yield ': heartbeat\n\n'
            await asyncio.sleep(1)
    return StreamingResponse(stream(),media_type='text/event-stream',headers={'X-Accel-Buffering':'no','Cache-Control':'no-store'})
