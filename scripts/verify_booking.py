"""Exercise only synthetic app records and a non-identifying AI navigation request."""
import argparse
from datetime import datetime, timedelta
from io import BytesIO
import json
import uuid
from zipfile import ZipFile
from zoneinfo import ZoneInfo
import requests


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--url',default='http://127.0.0.1:8000')
    parser.add_argument('--ai',action='store_true')
    args=parser.parse_args()
    client=requests.Session()
    client.headers.update({'X-HokieCare-Action':'1'})
    base=args.url.rstrip('/')
    def call(method,path,**kwargs):
        response=client.request(method,base+path,timeout=100,**kwargs)
        response.raise_for_status()
        return response.json()
    call('POST','/api/booking/session')
    try:
        assert call('GET','/api/booking/appointments')['appointments']==[]
        assert len(call('GET','/api/booking/catalog')['centers'])==5
        day=datetime.now(ZoneInfo('America/New_York')).date()+timedelta(days=7)
        while day.weekday()>4:
            day+=timedelta(days=1)
        slots=call('POST','/api/booking/demo-times',json={'day':day.isoformat()})['slots']
        assert slots, 'No synthetic slot available for smoke test'
        request={'slot_id':slots[-1]['id'],'request_id':str(uuid.uuid4())}
        saved=call('POST','/api/booking/appointments',json=request)
        assert saved['origin']=='demo' and saved['status']=='reserved'
        assert call('POST','/api/booking/appointments',json=request)['id']==saved['id']
        assert len(call('GET','/api/booking/appointments')['appointments'])==1
        assert call('POST',f"/api/booking/appointments/{saved['id']}/cancel")['status']=='cancelled'
        print('PASS: five centers, empty session, demo publication/reservation, retry, agenda, cancellation')
        if args.ai:
            result=call('POST','/api/assistant',json={'message':'Help me try the Cook appointment demo'})
            assert result['action']['view']=='appointments' and result['action']['center_id']=='cook'
            assert result['tool']=='navigate_care' and result['sources']
            print('PASS: live Databricks tool call + grounded sources + Cook navigation')
        download=client.get(base+'/hokiecare-companion.zip',timeout=30)
        download.raise_for_status()
        with ZipFile(BytesIO(download.content)) as archive:
            manifest=json.loads(archive.read('manifest.json'))
            assert manifest['manifest_version']==3
            assert 'background.js' in archive.namelist()
        print('PASS: downloadable companion archive')
    finally:
        call('DELETE','/api/booking/session')
    assert client.get(base+'/api/booking/appointments',timeout=15).status_code==401
    print('PASS: synthetic smoke session and records deleted')


if __name__=='__main__':
    main()
