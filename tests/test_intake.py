from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import time
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from hokiecare import app as api, booking as b, scheduling as s, intake, assistant, dataset

H={'X-HokieCare-Action':'1'}

@pytest.fixture
def client(tmp_path,monkeypatch):
    monkeypatch.setenv('HOKIECARE_BOOKING_DB',str(tmp_path/'intake.sqlite3'))
    monkeypatch.setenv('HOKIECARE_COOKIE_SECURE','false')
    monkeypatch.delenv('HOKIECARE_BOOKING_STORE',raising=False)
    api.requests_window.clear();assistant.requests.clear()
    u=TestClient(api.app)
    assert u.post('/api/booking/session',headers=H).status_code==200
    return u


def form(**overrides):
    day=datetime.now(s.TZ).date()+timedelta(days=1)
    while s.day_reason(s.service('schiffert-medical'),day):day+=timedelta(days=1)
    return dict(request_id='intake-request-123456',booking_name='Private Alias',support='physical',
        description='I want a routine medical visit for my sore throat.',center='auto',modality='in-person',
        first_date=str(day),last_date=str(day+timedelta(days=7)),weekdays=[0,1,2,3,4],
        after='09:00',before='17:00',student='yes',counseling=None,acknowledged=True,**{}) | overrides


def model(monkeypatch,service_ids=None,outcome='match',explanation='Schiffert offers campus medical appointment services.'):
    calls=[]
    def invoke(*args,**kwargs):
        calls.append(kwargs['body'])
        payload=dict(outcome=outcome,service_ids=service_ids if service_ids is not None else ['schiffert-medical'],
                     source_ids=['schiffert'],explanation=explanation)
        return {'choices':[{'message':{'tool_calls':[{'function':{'name':'intake_routing','arguments':json.dumps(payload)}}]}}]}
    monkeypatch.setattr(api,'services',lambda:{'services':json.loads(Path('data/contracts/services.json').read_text())})
    monkeypatch.setattr(api,'db_client',lambda:SimpleNamespace(api_client=SimpleNamespace(do=invoke)))
    return calls


@pytest.mark.parametrize('change',[{'booking_name':'   '},{'description':'  '},{'support':''},{'weekdays':[]},
    {'after':'16:30','before':'17:00'},{'last_date':'2030-01-01'},{'student':''},{'acknowledged':False},
    {'support':'counseling','counseling':None},{'modality':'telepathy'},{'weekdays':[0,0]}])
def test_incomplete_or_invalid_intake_never_infers(client,monkeypatch,change):
    calls=model(monkeypatch)
    response=client.post('/api/assistant/intake',headers=H,json=form(**change))
    assert response.status_code==422
    assert not calls
    with b.database() as db: assert db.execute('SELECT COUNT(*) FROM proposals').fetchone()[0]==0


def test_one_proposal_then_explicit_confirm_and_private_name(client,monkeypatch):
    calls=model(monkeypatch)
    body=form()
    first=client.post('/api/assistant/intake',headers=H,json=body)
    assert first.status_code==200,first.text
    result=first.json();review=result['review']
    assert result['outcome']=='proposal' and review['intake']
    assert review['booking_name']=='Private Alias'
    assert len(calls)==1 and 'Private Alias' not in json.dumps(calls)
    assert not client.get('/api/booking/appointments').json()['appointments']
    retry=client.post('/api/assistant/intake',headers=H,json=body).json()
    assert retry['review']['id']==review['id'] and len(calls)==1
    changed=client.post('/api/assistant/intake',headers=H,json=form(description='Changed request'))
    assert changed.status_code==409
    saved=client.post('/api/booking/proposals/'+review['id']+'/confirm',headers=H)
    assert saved.status_code==200,saved.text
    record=saved.json()
    assert record['booking_name']=='Private Alias'
    assert record['retain_until']==(datetime.fromisoformat(record['ends'])+timedelta(days=30)).timestamp()
    assert 'Max-Age=' in saved.headers['set-cookie']
    other=TestClient(api.app);other.post('/api/booking/session',headers=H)
    assert other.get('/api/booking/appointments').json()['appointments']==[]
    shared=other.get('/api/booking/availability',params={'service_id':'schiffert-medical','from':body['first_date'],
        'to':str(date.fromisoformat(body['first_date'])+timedelta(days=1)),'mode':'demo'})
    assert 'Private Alias' not in shared.text and 'booking_name' not in shared.text
    assert any(x['state']=='busy' for x in shared.json()['slots'])
    with b.database() as db:
        assert body['description'] not in '\n'.join(str(tuple(r)) for r in db.execute('SELECT * FROM proposals'))
        assert db.execute('SELECT COUNT(*) FROM agent_tasks').fetchone()[0]==0


def test_earliest_candidate_tiebreak_and_decline(client,monkeypatch):
    model(monkeypatch,['schiffert-medical','carilion-primary'])
    reply=client.post('/api/assistant/intake',headers=H,json=form()).json()
    assert reply['review']['slot']['service_id']=='carilion-primary'
    ident=reply['review']['id']
    assert client.delete('/api/booking/proposals/'+ident,headers=H).status_code==200
    assert client.post('/api/booking/proposals/'+ident+'/confirm',headers=H).status_code in (404,409)
    assert not client.get('/api/booking/appointments').json()['appointments']


def test_intake_reply_omits_repeated_dataset_qualifiers(client,monkeypatch):
    model(monkeypatch,explanation='Schiffert matches this fictional sample appointment request in the demo.')
    response=client.post('/api/assistant/intake',headers=H,json=form())
    assert response.status_code==200,response.text
    result=response.json()
    assert result['outcome']=='proposal'
    assert all(word not in result['answer'].lower() for word in ('sample','fictional','demo'))
    assert result['review']['origin']=='demo'  # presentation does not relabel underlying records


@pytest.mark.parametrize('changes',[{'student':'no'},{'center':'cook','support':'physical','counseling':'none'},
    {'center':'cook','support':'counseling','counseling':'timelycare'},
    {'support':'counseling','counseling':'unsure'},{'center':'schiffert','modality':'virtual'}])
def test_known_incompatibility_without_inference(client,monkeypatch,changes):
    calls=model(monkeypatch)
    result=client.post('/api/assistant/intake',headers=H,json=form(**changes))
    assert result.status_code==200,result.text
    assert result.json()['outcome']=='no_match' and not calls


def test_no_slots_or_untrusted_service_never_proposes(client,monkeypatch):
    model(monkeypatch)
    body=form(after='18:00',before='20:00')
    assert client.post('/api/assistant/intake',headers=H,json=body).json()['reason']=='availability'
    model(monkeypatch,['made-up-clinic'])
    assert client.post('/api/assistant/intake',headers=H,json=form()).status_code==503
    with b.database() as db: assert db.execute('SELECT COUNT(*) FROM proposals').fetchone()[0]==0


def test_general_wellness_cannot_select_specialized_consultation(client,monkeypatch):
    calls=model(monkeypatch,['wellness-basics'])
    body=form(support='wellness',center='wellness',description='Help with healthy routines and stress management.')
    response=client.post('/api/assistant/intake',headers=H,json=body)
    assert response.json()['outcome']=='no_match' and not calls
    automatic=intake.Intake(**{**body,'center':'auto','modality':'either'})
    assert intake.allowed_services(automatic)==['timelycare-coaching']
    financial=intake.Intake(**{**body,'description':'I want financial coaching to plan my budget.'})
    assert intake.allowed_services(financial)==['wellness-financial']
    assert not client.get('/api/booking/appointments').json()['appointments']


def test_urgent_result_and_inference_failure_do_not_book(client,monkeypatch):
    model(monkeypatch,[],outcome='urgent_support')
    result=client.post('/api/assistant/intake',headers=H,json=form()).json()
    assert result['outcome']=='urgent_support' and result['review'] is None
    monkeypatch.setattr(api,'db_client',lambda:(_ for _ in ()).throw(TimeoutError()))
    assert client.post('/api/assistant/intake',headers=H,json=form()).status_code==503
    assert not client.get('/api/booking/appointments').json()['appointments']


def test_materialized_dataset_constraints_and_seed_replay(client):
    with b.database() as db:
        assert db.execute('SELECT COUNT(*) FROM calendar_dates').fetchone()[0]==262
        assert db.execute('SELECT COUNT(*) FROM slots WHERE active=1').fetchone()[0]==12488
        assert db.execute('''SELECT COUNT(*) FROM slots s JOIN calendar_dates d ON s.local_date=d.day
            WHERE d.exclusion_reason IS NOT NULL AND s.active=1''').fetchone()[0]==0
        for row in db.execute('SELECT starts,ends,blocked_until FROM slots'):
            start,end,until=map(datetime.fromisoformat,tuple(row))
            assert end-start==timedelta(minutes=30) and until-start==timedelta(hours=1)
        manifest=dataset.seed(db)
        count=db.execute('SELECT COUNT(*) FROM appointments').fetchone()[0]
        assert 0.30<count/12488<0.40
        assert dataset.seed(db)==manifest
        assert db.execute('SELECT COUNT(*) FROM appointments').fetchone()[0]==count
        assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
        intervals={}
        for r in db.execute("SELECT a.owner,s.resource_id,s.starts,s.blocked_until FROM appointments a JOIN slots s ON s.id=a.slot_id"):
            for key in (r['owner'],r['resource_id']):intervals.setdefault(key,[]).append((r['starts'],r['blocked_until']))
        for entries in intervals.values():
            entries.sort()
            assert all(previous[1]<=following[0] for previous,following in zip(entries,entries[1:]))
        groups=db.execute('''SELECT s.service_id,s.local_date,COUNT(*)-COUNT(a.id) AS free FROM slots s
           LEFT JOIN appointments a ON a.slot_id=s.id AND a.status='reserved' GROUP BY s.service_id,s.local_date''').fetchall()
        assert min(r['free'] for r in groups)>=2
        assert db.execute("SELECT COUNT(*) FROM sessions WHERE kind='seed'").fetchone()[0]==250


def test_retention_and_seed_survive_short_task_expiry(client,monkeypatch):
    model(monkeypatch)
    review=client.post('/api/assistant/intake',headers=H,json=form()).json()['review']
    client.post('/api/booking/proposals/'+review['id']+'/confirm',headers=H)
    owner=hashlib.sha256(client.cookies.get(b.COOKIE).encode()).hexdigest()
    with b.database() as db:
        db.execute('INSERT INTO agent_tasks(owner,state,version,expires) VALUES (?,?,1,0)',(owner,'{}'))
        b.cleanup(db)
        assert db.execute('SELECT COUNT(*) FROM agent_tasks').fetchone()[0]==0
        assert db.execute('SELECT COUNT(*) FROM appointments').fetchone()[0]==1
        db.execute('UPDATE appointments SET retain_until=?',(time.time()-1,))
        b.cleanup(db)
        assert db.execute('SELECT COUNT(*) FROM appointments').fetchone()[0]==0
