"""Real two-session API checks against local or deployed app; synthetic data only."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timedelta
import json
import time
import uuid
from zoneinfo import ZoneInfo
import httpx


def verify(url,ai=False):
    users=[httpx.Client(base_url=url,headers={'X-HokieCare-Action':'1'},timeout=60) for _ in range(2)]
    try:
        for u in users:u.post('/api/booking/session').raise_for_status()
        a,b=users
        day=datetime.now(ZoneInfo('America/New_York')).date()+timedelta(days=2)
        slots=[]
        for _ in range(20):
            params={'service_id':'wellness-financial','from':str(day),'to':str(day+timedelta(days=1)),'mode':'demo'}
            r=a.get('/api/booking/availability',params=params);r.raise_for_status()
            slots=[s for s in r.json()['slots'] if s['state']=='available']
            if len(slots)>4:break
            day+=timedelta(days=1)
        assert len(slots)>4
        print('Storage:',r.json()['storage'])
        def prepare(u,slot,appointment=None):
            r=u.post('/api/booking/proposals',json={'slot_id':slot['id'],'version':slot['version'],'request_id':str(uuid.uuid4()),'appointment_id':appointment})
            r.raise_for_status();return r.json()
        reviews=[prepare(u,slots[0]) for u in users]
        def confirm(pair):return pair[0].post('/api/booking/proposals/'+pair[1]['id']+'/confirm')
        start=time.monotonic()
        with ThreadPoolExecutor(2) as pool:results=list(pool.map(confirm,zip(users,reviews)))
        assert sorted(r.status_code for r in results)==[200,409],[(r.status_code,r.text) for r in results]
        winner=next(i for i,r in enumerate(results) if r.status_code==200)
        user,other=users[winner],users[1-winner]
        saved=results[winner].json()
        assert confirm((user,reviews[winner])).json()['id']==saved['id']
        shared=other.get('/api/booking/availability',params=params).json()
        assert any(s['state']=='busy' for s in shared['slots'])
        assert other.get('/api/booking/appointments').json()['appointments']==[]
        assert other.post('/api/booking/appointments/'+saved['id']+'/cancel').status_code==404
        with other.stream('GET','/api/booking/events',params={'service_id':'wellness-financial','cursor':shared['revision']-1}) as stream:
            assert stream.status_code==200
            for line in stream.iter_lines():
                if line.startswith('data: '):
                    payload=json.loads(line[6:]);assert set(payload)=={'service_id','revision'};break
        print('Two-session interval conflict, idempotency, owner isolation, durable SSE replay passed;',round(time.monotonic()-start,2),'seconds')
        move=prepare(user,slots[-1],saved['id'])
        moved=confirm((user,move));moved.raise_for_status()
        assert moved.json()['id']==saved['id'] and moved.json()['slot_id']==slots[-1]['id']
        user.post('/api/booking/appointments/'+saved['id']+'/cancel').raise_for_status()
        print('Atomic reschedule and cancellation passed')
        if ai:
            r=a.post('/api/assistant/booking',json={'message':'Book a Cook demo next Tuesday after 2'})
            r.raise_for_status();data=r.json()
            assert data['preferences']['service_id']=='cook-counseling' and data['preferences']['mode']=='demo'
            assert data['preferences']['after']=='14:00' and data['slots']
            today=datetime.now(ZoneInfo('America/New_York')).date()
            expected=today+timedelta(days=(1-today.weekday())%7 or 7)
            assert data['preferences']['day']==str(expected)
            booked=confirm((a,prepare(a,data['slots'][0])));booked.raise_for_status()
            print('Live Databricks model date/tool preferences and reviewed booking passed')
    finally:
        for u in users:
            u.delete('/api/booking/session');u.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('url');parser.add_argument('--ai',action='store_true')
    args=parser.parse_args();verify(args.url,args.ai)
