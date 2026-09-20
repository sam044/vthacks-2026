from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import hashlib
import time
from fastapi.testclient import TestClient
import pytest
from hokiecare import app as api, booking as b, scheduling as s
from test_intake import client, form, model, H


def users(client):
    other=TestClient(api.app)
    assert other.post('/api/booking/session',headers=H).status_code==200
    return client,other


def slot(client, service='schiffert-medical'):
    day=form()['first_date']
    slots=client.get('/api/booking/availability',params={'service_id':service,'from':day,
        'to':str(datetime.fromisoformat(day).date()+timedelta(days=1)),'mode':'demo'}).json()['slots']
    return next(x for x in slots if datetime.fromisoformat(x['starts']).astimezone(s.TZ).hour==9)


def book(user, target, key='waitlist-book-123456'):
    p=user.post('/api/booking/proposals',headers=H,json=dict(slot_id=target['id'],version=target['version'],request_id=key))
    assert p.status_code==200,p.text
    r=user.post('/api/booking/proposals/'+p.json()['id']+'/confirm',headers=H)
    assert r.status_code==200,r.text
    return r.json()


def join(user,target):
    return user.post('/api/booking/waitlist',headers=H,json={'slot_id':target['id'],'request_id':'waitlist-join-123456'})


def listing(user):
    r=user.get('/api/booking/waitlist');assert r.status_code==200,r.text
    return r.json()['entries']


def cancel(user, appointment):
    assert user.post('/api/booking/appointments/'+appointment['id']+'/cancel',headers=H).status_code==200


def review(user, entry, **overrides):
    return user.post('/api/booking/waitlist/'+entry['id']+'/review',headers=H,json=form(**overrides))


def test_complete_private_cancel_refill_and_retry(client,monkeypatch):
    a,c=users(client);target=slot(a);saved=book(a,target)
    joined=join(c,target);assert joined.status_code==200,joined.text
    entry=joined.json();assert entry['status']=='waiting'
    assert join(c,target).json()['id']==entry['id']
    assert listing(a)==[]
    assert a.delete('/api/booking/waitlist/'+entry['id'],headers=H).status_code==404
    assert review(a,entry).status_code==404
    calls=model(monkeypatch)
    assert review(c,entry).status_code==409 and not calls
    cancel(a,saved)
    # Cancellation updates the persisted offer before any waitlist GET.
    with b.database() as db:
        assert db.execute('SELECT status FROM waitlist WHERE id=?',(entry['id'],)).fetchone()[0]=='available'
    assert listing(c)[0]['status']=='available'
    p=review(c,entry,before='09:30');assert p.status_code==200,p.text
    p=p.json()['review'];assert p['slot']['id']==target['id'] and p['waitlist_id']==entry['id'] and p['intake']
    assert review(c,entry,before='09:30').json()['review']['id']==p['id']
    assert c.get('/api/booking/appointments').json()['appointments']==[]
    confirmed=c.post('/api/booking/proposals/'+p['id']+'/confirm',headers=H)
    assert confirmed.status_code==200,confirmed.text
    assert c.post('/api/booking/proposals/'+p['id']+'/confirm',headers=H).json()['id']==confirmed.json()['id']
    assert listing(c)[0]['status']=='fulfilled'
    assert len(c.get('/api/booking/appointments').json()['appointments'])==1
    assert 'Private Alias' not in str(calls) and entry['id'] not in str(calls)
    with b.database() as db:
        assert 'Private Alias' not in str([dict(r) for r in db.execute('SELECT * FROM outbox_events')])
        assert 'description' not in db.execute("SELECT sql FROM sqlite_master WHERE name='waitlist'").fetchone()[0]


def test_taken_time_from_intake_offers_join_instead_of_edit_only(client,monkeypatch):
    a,c=users(client);target=slot(a);saved=book(a,target);model(monkeypatch)
    body=form(before='09:30',last_date=form()['first_date'])
    result=c.post('/api/assistant/intake',headers=H,json=body)
    assert result.status_code==200,result.text
    data=result.json()
    assert data['outcome']=='no_match' and data['review'] is None
    assert [x['id'] for x in data['waitlist_options']]==[target['id']]
    option=data['waitlist_options'][0]
    assert set(option)=={'id','starts','ends','service_id','center_id','version','state','service_name'}
    assert option['state']=='busy' and 'Join the waitlist' in data['answer']
    mixed=c.post('/api/assistant/intake',headers=H,json={**body,'before':'17:00'}).json()
    assert mixed['outcome']=='choices' and mixed['slots']
    assert target['id'] in [x['id'] for x in mixed['waitlist_options']]
    assert listing(c)==[]  # Suggestions never enroll the student automatically.
    own=a.post('/api/assistant/intake',headers=H,json=body).json()
    assert not own.get('waitlist_options')  # An existing own visit still conflicts.
    assert own['reason']=='appointment_conflict' and 'already have an appointment' in own['answer']
    entry=join(c,option).json();cancel(a,saved)
    assert listing(c)[0]['status']=='available'
    response=review(c,entry,before='09:30')
    assert response.json()['review']['slot']['id']==target['id']


def test_interval_migration_preserves_bookings_and_memberships(client):
    a,c=users(client);target=slot(a);saved=book(a,target);entry=join(c,target).json()
    with b.database() as db:
        db.execute('UPDATE slots SET blocked_until=? WHERE id=?',
            ((datetime.fromisoformat(target['ends'])+timedelta(minutes=30)).isoformat(),target['id']))
        db.execute('PRAGMA user_version=6')
    # Reopening replays only the new migration, preserving visits and membership.
    with b.database() as db:
        row=db.execute('SELECT * FROM slots WHERE id=?',(target['id'],)).fetchone()
        assert row['starts']==target['starts'] and row['ends']==target['ends']==row['blocked_until']
        assert db.execute('SELECT status FROM appointments WHERE id=?',(saved['id'],)).fetchone()[0]=='reserved'
        assert db.execute('SELECT status FROM waitlist WHERE id=?',(entry['id'],)).fetchone()[0]=='waiting'


def test_leave_invalidates_reviews_and_does_not_book(client,monkeypatch):
    a,c=users(client);target=slot(a);saved=book(a,target);entry=join(c,target).json()
    cancel(a,saved);model(monkeypatch)
    p=review(c,entry).json()['review']
    assert c.delete('/api/booking/waitlist/'+entry['id'],headers=H).status_code==200
    assert listing(c)==[]
    assert c.post('/api/booking/proposals/'+p['id']+'/confirm',headers=H).status_code in (404,409)
    assert c.get('/api/booking/appointments').json()['appointments']==[]
    again=join(c,target).json();assert again['id']!=entry['id'] and again['status']=='available'


def test_offer_conflicts_expiry_and_later_cancellation(client,monkeypatch):
    a,c=users(client);target=slot(a);saved=book(a,target);entry=join(c,target).json()
    cancel(a,saved);model(monkeypatch)
    p=review(c,entry).json()['review']
    taken=book(a,target,'waitlist-book-again-1234')
    assert listing(c)[0]['status']=='waiting'
    failed=c.post('/api/booking/proposals/'+p['id']+'/confirm',headers=H)
    assert failed.status_code==409 and 'no longer available' in failed.json()['detail']
    cancel(a,taken)
    with b.database() as db:db.execute('UPDATE proposals SET expires=? WHERE id=?',(time.time()-1,p['id']))
    assert c.post('/api/booking/proposals/'+p['id']+'/confirm',headers=H).status_code==409
    assert listing(c)[0]['status']=='available'
    with b.database() as db:db.execute('UPDATE slots SET active=0 WHERE id=?',(target['id'],))
    assert listing(c)[0]['status']=='expired'
    assert join(c,target).status_code==409


def test_no_bypass_of_intake_or_exact_service(client,monkeypatch):
    a,c=users(client);target=slot(a);saved=book(a,target);entry=join(c,target).json();cancel(a,saved)
    calls=model(monkeypatch)
    assert review(c,entry,booking_name='').status_code==422
    assert review(c,entry,student='no').json()['outcome']=='no_match'
    assert review(c,entry,support='wellness').json()['outcome']=='no_match'
    assert not calls
    response=review(c,entry,after='10:00',before='17:00')
    assert response.json()['outcome']=='no_match'  # no substitution with a later slot
    assert c.get('/api/booking/appointments').json()['appointments']==[]


def test_owner_conflict_and_atomic_reschedule_offer(client):
    a,c=users(client);target=slot(a);saved=book(a,target);entry=join(c,target).json()
    conflicting=slot(c,'carilion-primary');book(c,conflicting)
    cancel(a,saved)
    assert listing(c)[0]['status']=='waiting'
    assert join(a,conflicting).json()['status']=='waiting'
    assert join(c,target).status_code==200  # idempotent existing membership
    own_other=slot(c,'wellness-financial')
    assert join(c,own_other).status_code==409
    with b.database() as db:
        later=dict(db.execute('SELECT * FROM slots WHERE service_id=? AND local_date=? AND starts>? ORDER BY starts LIMIT 1',
                             (target['service_id'],target['starts'][:10],target['starts'])).fetchone())
    moved=c.post('/api/booking/proposals',headers=H,json={'slot_id':later['id'],'version':later['version'],
        'appointment_id':c.get('/api/booking/appointments').json()['appointments'][0]['id'],'request_id':'move-conflict-123456'}).json()
    assert c.post('/api/booking/proposals/'+moved['id']+'/confirm',headers=H).status_code==200
    assert listing(c)[0]['status']=='available'


def test_two_waiters_concurrent_confirmation(client,monkeypatch):
    a,c=users(client);d=TestClient(api.app);d.post('/api/booking/session',headers=H)
    target=slot(a);saved=book(a,target)
    entries=[join(u,target).json() for u in (c,d)];cancel(a,saved);model(monkeypatch)
    reviews=[review(u,e).json()['review'] for u,e in zip((c,d),entries)]
    with ThreadPoolExecutor(2) as pool:
        results=list(pool.map(lambda pair:pair[0].post('/api/booking/proposals/'+pair[1]['id']+'/confirm',headers=H),zip((c,d),reviews)))
    assert sorted(r.status_code for r in results)==[200,409]
    assert sorted(listing(u)[0]['status'] for u in (c,d))==['fulfilled','waiting']


def test_restoration_cleanup_missed_events_and_migration_replay(client):
    a,c=users(client);target=slot(a);saved=book(a,target);joined=join(c,target);entry=joined.json()
    owner=hashlib.sha256(c.cookies.get(b.COOKIE).encode()).hexdigest()
    with b.database() as db:
        assert db.execute('SELECT expires FROM sessions WHERE id=?',(owner,)).fetchone()[0]>datetime.fromisoformat(target['ends']).timestamp()
        db.execute("UPDATE appointments SET status='cancelled' WHERE id=?",(saved['id'],))
    restored=TestClient(api.app);restored.cookies.update(c.cookies)
    assert listing(restored)[0]['status']=='available'  # missed event recovered from storage
    with b.database() as db:assert db.execute('PRAGMA user_version').fetchone()[0]==7
    assert restored.delete('/api/booking/session',headers=H).status_code==200
    with b.database() as db:
        assert not db.execute('SELECT 1 FROM waitlist WHERE id=?',(entry['id'],)).fetchone()
        assert db.execute('PRAGMA foreign_key_check').fetchall()==[]


def test_waitlist_ignores_old_buffer_but_respects_passed_time(client,monkeypatch):
    a,c=users(client);target=slot(a);saved=book(a,target)
    # A different service at 09:30 fits after the 09:00 visit ends.
    # Legacy buffer metadata must not prevent the exact-time offer.
    book(c,slot(c,'carilion-primary'))
    with b.database() as db:
        starts=datetime.fromisoformat(target['starts'])+timedelta(minutes=30)
        db.execute('UPDATE slots SET starts=?,ends=?,blocked_until=? WHERE id=?',
                   (starts.isoformat(),(starts+timedelta(minutes=30)).isoformat(),
                    (starts+timedelta(hours=1)).isoformat(),target['id']))
    joined=join(c,target);assert joined.status_code==200,joined.text
    assert joined.json()['status']=='waiting'
    cancel(a,saved)
    assert listing(c)[0]['status']=='available'
    model(monkeypatch)
    result=review(c,joined.json(),after='09:30',before='10:00')
    assert result.status_code==200,result.text
    proposal=result.json()['review'];assert proposal is not None,result.text
    assert c.post('/api/booking/proposals/'+proposal['id']+'/confirm',headers=H).status_code==200
    other=TestClient(api.app);other.post('/api/booking/session',headers=H)
    entry=join(other,target).json()
    with b.database() as db:
        db.execute('UPDATE slots SET starts=? WHERE id=?',((datetime.now(timezone.utc)-timedelta(days=1)).isoformat(),target['id']))
    assert listing(other)[0]['status']=='expired'
    assert review(other,entry).status_code==409
