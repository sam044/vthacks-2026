"""Exercise real cancellation -> private offer -> intake -> confirmation. Own probes only."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timedelta
import json
import time
import uuid
from zoneinfo import ZoneInfo
import httpx


def verify(url):
    users=[httpx.Client(base_url=url,headers={'X-HokieCare-Action':'1'},timeout=90) for _ in range(3)]
    def data(response):
        response.raise_for_status()
        return response.json()
    def prepare(user,slot):
        return data(user.post('/api/booking/proposals',json={'slot_id':slot['id'],'version':slot['version'],'request_id':str(uuid.uuid4())}))
    def confirm(user,review):
        return user.post('/api/booking/proposals/'+review['id']+'/confirm')
    try:
        for user in users:data(user.post('/api/booking/session'))
        a,b,c=users
        day=datetime.now(ZoneInfo('America/New_York')).date()+timedelta(days=2)
        for _ in range(20):
            params={'service_id':'schiffert-medical','from':str(day),'to':str(day+timedelta(days=1)),'mode':'demo'}
            inventory=data(a.get('/api/booking/availability',params=params))
            available=[x for x in inventory['slots'] if x['state']=='available']
            if available:break
            day+=timedelta(days=1)
        assert available
        target=available[0]
        saved=data(confirm(a,prepare(a,target)))
        def join(user):return data(user.post('/api/booking/waitlist',json={'slot_id':target['id'],'request_id':str(uuid.uuid4())}))
        entries=[join(u) for u in (b,c)]
        assert all(e['status']=='waiting' for e in entries)
        assert join(b)['id']==entries[0]['id']
        assert data(a.get('/api/booking/waitlist'))['entries']==[]
        assert a.delete('/api/booking/waitlist/'+entries[0]['id']).status_code==404
        started=time.monotonic()
        data(a.post('/api/booking/appointments/'+saved['id']+'/cancel'))
        for user in (b,c):assert data(user.get('/api/booking/waitlist'))['entries'][0]['status']=='available'
        seconds=round(time.monotonic()-started,3)
        local=datetime.fromisoformat(target['starts']).astimezone(ZoneInfo('America/New_York'))
        until=datetime.fromisoformat(target['blocked_until']).astimezone(ZoneInfo('America/New_York'))
        body=dict(request_id=str(uuid.uuid4()),booking_name='Waitlist Verification Alias',support='physical',
            description='I would like a routine medical appointment.',center='schiffert',modality='in-person',
            first_date=str(local.date()),last_date=str(local.date()),weekdays=[local.weekday()],
            after=local.strftime('%H:%M'),before=until.strftime('%H:%M'),student='yes',counseling=None,acknowledged=True)
        reviews=[]
        for user,entry in zip((b,c),entries):
            path='/api/booking/waitlist/'+entry['id']+'/review'
            assert user.post(path,json={**body,'acknowledged':False}).status_code==422
            result=data(user.post(path,json=body))
            assert result['outcome']=='proposal',result.get('answer')
            review=result['review'];assert review['slot']['id']==target['id'] and review['waitlist_id']==entry['id']
            assert data(user.post(path,json=body))['review']['id']==review['id']
            assert data(user.get('/api/booking/appointments'))['appointments']==[]
            reviews.append(review)
        with ThreadPoolExecutor(2) as pool:
            results=list(pool.map(lambda pair:confirm(*pair),zip((b,c),reviews)))
        assert sorted(r.status_code for r in results)==[200,409]
        winner=next(i for i,r in enumerate(results) if r.status_code==200)
        assert data(confirm((b,c)[winner],reviews[winner]))['id']==results[winner].json()['id']
        assert sorted(data(u.get('/api/booking/waitlist'))['entries'][0]['status'] for u in (b,c))==['fulfilled','waiting']
        shared=a.get('/api/booking/availability',params=params)
        assert 'Waitlist Verification Alias' not in shared.text and 'booking_name' not in shared.text
        assert all(e['id'] not in shared.text for e in entries)
        cursor=inventory['revision']
        with a.stream('GET','/api/booking/events',params={'cursor':cursor}) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                if line.startswith('data: '):
                    assert set(json.loads(line[6:]))=={'service_id','revision'};break
        losing=(b,c)[1-winner]
        data(losing.delete('/api/booking/waitlist/'+entries[1-winner]['id']))
        assert data(losing.get('/api/booking/waitlist'))['entries']==[]
        print(json.dumps({'passed':True,'storage':inventory['storage'],'cancellation_to_offer_api_seconds':seconds,
            'checks':['two waiters','private offers','exact-slot live inference','required intake','confirmation race',
                      'retry idempotency','agenda','anonymous events','leave waitlist']}))
    finally:
        for user in users:
            response=user.delete('/api/booking/session')
            response.raise_for_status()
            user.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('url');verify(parser.parse_args().url)
