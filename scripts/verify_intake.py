"""Live model + transactional sample booking check; deletes only its own test session."""
import argparse
from datetime import datetime,timedelta
import uuid
from zoneinfo import ZoneInfo
import httpx


def verify(url):
    h={'X-HokieCare-Action':'1'}
    users=[httpx.Client(base_url=url,headers=h,timeout=90) for _ in range(2)]
    try:
        for u in users:u.post('/api/booking/session').raise_for_status()
        a,b=users
        today=datetime.now(ZoneInfo('America/New_York')).date()
        body=dict(request_id=str(uuid.uuid4()),booking_name='Intake Verification Alias',support='physical',
          description='I would like a routine medical appointment for a sore throat.',center='schiffert',modality='in-person',
          first_date=str(today+timedelta(days=1)),last_date=str(today+timedelta(days=14)),
          after='09:00',before='17:00',student='yes',counseling=None,acknowledged=True)
        assert a.post('/api/assistant/intake',json={**body,'booking_name':' '}).status_code==422
        r=a.post('/api/assistant/intake',json=body);r.raise_for_status();result=r.json()
        assert result['outcome']=='choices' and result['review'] is None,result
        assert len(result['slots'])>1
        choice=result['slots'][1]
        selection=dict(lookup_token=result['lookup_token'],slot_id=choice['id'],version=choice['version'],request_id=str(uuid.uuid4()),booking_name=body['booking_name'])
        r=a.post('/api/assistant/intake/select',json=selection);r.raise_for_status()
        review=r.json()['review'];slot=review['slot']
        assert slot['id']==choice['id']
        assert review['intake'] and review['booking_name']==body['booking_name']
        assert a.get('/api/booking/appointments').json()['appointments']==[]
        repeat=a.post('/api/assistant/intake/select',json=selection);repeat.raise_for_status()
        assert repeat.json()['review']['id']==review['id']
        assert b.post('/api/booking/proposals/'+review['id']+'/confirm').status_code==404
        saved=a.post('/api/booking/proposals/'+review['id']+'/confirm');saved.raise_for_status()
        appointment=saved.json()
        assert appointment['booking_name']==body['booking_name']
        assert datetime.fromisoformat(appointment['ends'])-datetime.fromisoformat(appointment['starts'])==timedelta(minutes=30)
        assert appointment['retain_until']==(datetime.fromisoformat(appointment['ends'])+timedelta(days=30)).timestamp()
        assert a.post('/api/booking/proposals/'+review['id']+'/confirm').json()['id']==appointment['id']
        day=datetime.fromisoformat(slot['starts']).astimezone(ZoneInfo('America/New_York')).date()
        params={'service_id':slot['service_id'],'from':str(day),'to':str(day+timedelta(days=1)),'mode':'demo'}
        shared=b.get('/api/booking/availability',params=params);shared.raise_for_status()
        assert body['booking_name'] not in shared.text and 'booking_name' not in shared.text
        assert next(x for x in shared.json()['slots'] if x['id']==slot['id'])['state']=='busy'
        assert b.get('/api/booking/appointments').json()['appointments']==[]
        copy=httpx.Client(base_url=url,headers=h,cookies=a.cookies,timeout=30)
        assert copy.get('/api/booking/appointments').json()['appointments'][0]['id']==appointment['id'];copy.close()
        a.post('/api/booking/appointments/'+appointment['id']+'/cancel').raise_for_status()
        refreshed=b.get('/api/booking/availability',params=params).json()
        assert next(x for x in refreshed['slots'] if x['id']==slot['id'])['state']=='available'
        print('PASS: required validation, live Databricks model, available choices, explicit time selection, private name, explicit confirmation, idempotency, retention, same-browser restoration, shared calendar, cancellation.')
        print('Model:',result.get('model'),'Storage:',shared.json()['storage'])
    finally:
        for u in users:
            u.delete('/api/booking/session');u.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('url');verify(parser.parse_args().url)
