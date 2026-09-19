from concurrent.futures import ThreadPoolExecutor
from datetime import date,datetime,timedelta,timezone
import hashlib
import json
import sqlite3
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from hokiecare import app as api,booking,assistant,scheduling

H={'X-HokieCare-Action':'1'}


@pytest.fixture
def clients(tmp_path,monkeypatch):
    monkeypatch.setenv('HOKIECARE_BOOKING_DB',str(tmp_path/'calendar.sqlite3'))
    monkeypatch.setenv('HOKIECARE_COOKIE_SECURE','false')
    monkeypatch.delenv('HOKIECARE_BOOKING_STORE',raising=False)
    api.requests_window.clear();assistant.requests.clear()
    users=[TestClient(api.app),TestClient(api.app)]
    for u in users: assert u.post('/api/booking/session',headers=H).status_code==200
    return users


def next_day():
    day=datetime.now(scheduling.TZ).date()+timedelta(days=1)
    while scheduling.day_reason(scheduling.service('cook-counseling'),day):day+=timedelta(days=1)
    return day


def inventory(u,sid='cook-counseling',day=None,mode='demo'):
    day=day or next_day()
    return u.get('/api/booking/availability',params={'service_id':sid,'from':day.isoformat(),'to':(day+timedelta(days=1)).isoformat(),'mode':mode}).json()


def prepare(u,slot,key='calendar-review-123456',appointment=None):
    return u.post('/api/booking/proposals',headers=H,json={'slot_id':slot['id'],'version':slot['version'],'request_id':key,'appointment_id':appointment})


def confirm(u,p):return u.post('/api/booking/proposals/'+p['id']+'/confirm',headers=H)


def test_overlapping_candidates_two_users_and_private_projection(clients):
    a,b=clients
    slots=inventory(a)['slots']
    reviews=[prepare(a,slots[0]).json(),prepare(b,slots[0]).json()]
    with ThreadPoolExecutor(2) as pool:
        results=list(pool.map(lambda item:confirm(*item),zip(clients,reviews)))
    assert sorted(r.status_code for r in results)==[200,409]
    shared=inventory(b)
    assert sum(s['state']=='busy' for s in shared['slots'])==1
    assert all(not any(k in s for k in ['owner','booking_id','confirmation','appointment_id']) for s in shared['slots'])
    with booking.database() as db:
        assert db.execute('SELECT COUNT(*) FROM outbox_events').fetchone()[0]==1


def test_idempotent_proposals_confirmation_expiry_and_owner(clients):
    a,b=clients;s=inventory(a)['slots']
    p=prepare(a,s[0]).json()
    assert prepare(a,s[0]).json()['id']==p['id']
    assert prepare(a,s[1]).status_code==409
    assert confirm(b,p).status_code==404
    booked=confirm(a,p).json()
    assert confirm(a,p).json()['id']==booked['id']
    assert len(a.get('/api/booking/appointments').json()['appointments'])==1
    p2=prepare(b,s[-1],key='different-review-1234').json()
    with booking.database() as db:db.execute('UPDATE proposals SET expires=? WHERE id=?',(__import__('time').time()-1,p2['id']))
    assert confirm(b,p2).status_code==409


def test_atomic_reschedule_preserves_original_when_taken(clients):
    a,b=clients;s=inventory(a)['slots']
    original=confirm(a,prepare(a,s[0]).json()).json()
    move=prepare(a,s[-1],key='move-request-123456',appointment=original['id']).json()
    assert confirm(b,prepare(b,s[-1]).json()).status_code==200
    assert confirm(a,move).status_code==409
    assert a.get('/api/booking/appointments').json()['appointments'][0]['slot_id']==original['slot_id']
    successful=prepare(a,s[2],key='move-request-234567',appointment=original['id']).json()
    result=confirm(a,successful)
    assert result.status_code==200 and result.json()['id']==original['id']
    assert confirm(a,successful).json()['slot_id']==s[2]['id']
    assert inventory(b)['slots'][0]['state']=='available'


def test_same_time_different_resources_and_owner_overlap(clients):
    a,b=clients
    s1=inventory(a,'wellness-financial')['slots'][0]
    s2=inventory(a,'wellness-basics')['slots'][0]
    assert confirm(a,prepare(a,s1).json()).status_code==200
    assert prepare(a,s2,key='another-request-1234').status_code==409
    assert confirm(b,prepare(b,s2).json()).status_code==200


def test_legacy_slot_coexists_and_database_guards_intervals(clients):
    a,b=clients
    day=next_day()
    legacy=a.post('/api/booking/demo-times',headers=H,json={'day':str(day)}).json()['slots']
    new=next(x for x in inventory(a)['slots'] if x['starts']==legacy[0]['starts'])
    assert confirm(a,prepare(a,new).json()).status_code==200
    assert b.post('/api/booking/appointments',headers=H,json={'slot_id':legacy[0]['id'],'request_id':'legacy-reserve-1234'}).status_code==409


def test_provider_unknown_talknow_not_scheduled_and_range_bounds(clients):
    a=clients[0]
    assert inventory(a,mode='provider')['slots']==[]
    assert inventory(a,mode='provider')['days'][0]['available'] is None
    assert a.get('/api/booking/availability',params={'service_id':'talknow','from':'2026-10-01','to':'2026-10-02'}).status_code==422
    assert a.get('/api/booking/availability',params={'service_id':'cook-counseling','from':'2026-10-01','to':'2027-10-02'}).status_code==422


def test_breaks_horizon_hours_and_dst():
    now=datetime(2026,9,19,tzinfo=timezone.utc)
    assert not scheduling.candidates('cook-counseling',date(2026,11,23),now)
    assert not scheduling.candidates('timelycare-counseling',date(2026,11,23),now)
    assert not scheduling.candidates('cook-counseling',date(2026,12,18),now)
    assert not scheduling.candidates('carilion-primary',date(2026,12,18),now)
    summer=scheduling.candidates('cook-counseling',date(2026,10,5),now)[0]
    winter=scheduling.candidates('cook-counseling',date(2026,11,2),now)[0]
    assert summer['starts'].endswith('12:00:00+00:00')
    assert winter['starts'].endswith('13:00:00+00:00')
    assert scheduling.candidates('cook-counseling',date(2026,10,2),now)[0]['starts'].endswith('13:00:00+00:00')
    with pytest.raises(ValueError):scheduling.local_instant(date(2026,11,1),'01:30')
    with pytest.raises(ValueError):scheduling.local_instant(date(2027,3,14),'02:30')
    assert not scheduling.candidates('cook-counseling',date(2027,5,1),now)


def test_persisted_outbox_cleanup_and_session_restart(clients):
    a,b=clients;slot=inventory(a)['slots'][0]
    record=confirm(a,prepare(a,slot).json()).json()
    copy=TestClient(api.app);copy.cookies.update(a.cookies)
    assert copy.get('/api/booking/appointments').json()['appointments'][0]['id']==record['id']
    before=inventory(b)['revision']
    assert a.delete('/api/booking/session',headers=H).status_code==200
    after=inventory(b)
    assert after['revision']>before and after['slots'][0]['state']=='available'
    with booking.database() as db:
        events=[dict(r) for r in db.execute('SELECT * FROM outbox_events')]
        assert all('owner' not in r and 'appointment_id' not in r for r in events)


def test_conversation_persists_only_preferences_and_requires_review(clients,monkeypatch):
    intents=iter([{'action':'availability','service_id':'cook-counseling','mode':'demo'},
                  {'action':'availability','day':str(next_day()),'after':'14:00'}])
    def invoke(*args,**kwargs):
        name=kwargs['body']['tools'][0]['function']['name']
        payload=next(intents) if name=='scheduling_preferences' else {'answer':'What date would you like? Review an available fictional time below.', 'source_ids':['cook']}
        return {'choices':[{'message':{'tool_calls':[{'function':{'name':name,'arguments':json.dumps(payload)}}]}}]}
    from pathlib import Path
    monkeypatch.setattr(api,'services',lambda:{'services':json.loads(Path('data/contracts/services.json').read_text()),'data':{'provider':'test'}})
    monkeypatch.setattr(api,'db_client',lambda:SimpleNamespace(api_client=SimpleNamespace(do=invoke)))
    a=clients[0]
    r=a.post('/api/assistant/booking',headers=H,json={'message':'Cook demo'})
    assert 'What date' in r.json()['answer']
    r=a.post('/api/assistant/booking',headers=H,json={'message':f'{next_day()} after 2'})
    assert r.status_code==200 and r.json()['slots']
    assert a.get('/api/assistant/booking').json()['preferences']['after']=='14:00'
    assert a.get('/api/booking/appointments').json()['appointments']==[]
    assert confirm(a,prepare(a,r.json()['slots'][0]).json()).status_code==200
    with booking.database() as db:
        state=db.execute('SELECT state FROM agent_tasks').fetchone()[0]
        assert 'Tomorrow' not in state and 'Cook demo' not in state


def test_relative_date_resolution_does_not_trust_model_arithmetic():
    from hokiecare.conversation import relative_day
    assert relative_day('Book a Cook demo next Tuesday after 2',date(2026,9,19))==date(2026,9,22)
    assert relative_day('next Tuesday',date(2026,9,22))==date(2026,9,29)
    assert relative_day('tomorrow',date(2026,12,31))==date(2027,1,1)


def test_v1_migration_preserves_ids_and_bookings(tmp_path,monkeypatch):
    path=tmp_path/'old.sqlite3'
    monkeypatch.setenv('HOKIECARE_BOOKING_DB',str(path));monkeypatch.delenv('HOKIECARE_BOOKING_STORE',raising=False)
    with sqlite3.connect(path) as db:
        db.executescript('''CREATE TABLE sessions(id TEXT PRIMARY KEY,expires REAL NOT NULL);
        CREATE TABLE slots(id TEXT PRIMARY KEY,center_id TEXT NOT NULL,starts TEXT NOT NULL,ends TEXT NOT NULL,UNIQUE(center_id,starts));
        CREATE TABLE appointments(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,slot_id TEXT NOT NULL REFERENCES slots(id),status TEXT NOT NULL,request_id TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(owner,request_id));
        INSERT INTO sessions VALUES('old-owner',9999999999);
        INSERT INTO slots VALUES('old-slot','cook','2026-10-01T13:00:00+00:00','2026-10-01T13:45:00+00:00');
        INSERT INTO appointments VALUES('old-booking','old-owner','old-slot','reserved','old-request','2026-09-19');
        PRAGMA user_version=1;''')
    with booking.database() as db:
        assert booking.get_appointment(db,'old-owner','old-booking')['slot_id']=='old-slot'
        assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
        assert db.execute('PRAGMA foreign_keys').fetchone()[0]==1
