"""Bounded Databricks preference extraction with deterministic scheduling tools.

Only structured scheduling preferences persist. Raw chat and model prose do not.
User authorization is the separate, owner-bound review confirmation endpoint.
"""
from datetime import date, datetime, time as wall_time, timedelta
import json
import os
import re
import time
from typing import Literal
from fastapi import APIRouter, HTTPException, Request
from pydantic import Field
from . import booking as b, scheduling as s, calendar as cal, assistant as legacy

router=APIRouter(prefix='/api/assistant/booking')


def relative_day(message,today):
    """Resolve common relative dates in code; model arithmetic is not authoritative."""
    text=message.lower()
    if re.search(r'\bday after tomorrow\b',text): return today+timedelta(days=2)
    if re.search(r'\btomorrow\b',text):return today+timedelta(days=1)
    if re.search(r'\btoday\b',text):return today
    weekdays=['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
    match=re.search(r'\b(?:next|this|on) (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b',text)
    if match:return today+timedelta(days=(weekdays.index(match[1])-today.weekday())%7 or 7)
    return None


class Intent(b.StrictBody):
    action: Literal['availability','list_my_appointments','find_services','help','urgent_support','reset']
    service_id: str | None = None
    mode: Literal['demo','provider'] | None = None
    day: date | None = None
    after: str | None = Field(default=None,pattern=r'^([01][0-9]|2[0-3]):[0-5][0-9]$')
    before: str | None = Field(default=None,pattern=r'^([01][0-9]|2[0-3]):[0-5][0-9]$')


def task(db,owner):
    row=db.execute('SELECT state,version FROM agent_tasks WHERE owner=?',(owner,)).fetchone()
    return (json.loads(row['state']),row['version']) if row else ({},0)


def render(state,request):
    result={'preferences':state,'answer':'Which service would you like, and on what date? Choose demo for fictional reservations.',
            'slots':[],'sources':[],'origin':state.get('mode','provider'),'tool':'get_availability',
            'model':os.environ.get('DATABRICKS_CHAT_ENDPOINT','databricks-qwen3-next-80b-a3b-instruct')}
    sid=state.get('service_id')
    if not sid: return result
    service=s.service(sid)
    result['sources']=[{'name':service['name'],'url':service['source_url']}]
    if state.get('mode')!='demo':
        result['answer']=f"{service['name']}: real availability is not connected. Use the official provider route, or ask to try the clearly labeled demo."
        result['action']={'view':'appointments','category':'all','center_id':service['center_id']}
        return result
    if not state.get('day'):
        result['answer']=f"What date would you like for the {service['name']} demo? Times are Eastern."
        return result
    day=date.fromisoformat(state['day'])
    inventory=cal.availability(sid,day,day+timedelta(days=1),'demo')
    slots=[x for x in inventory['slots'] if x['state']=='available'
           and (not state.get('after') or datetime.fromisoformat(x['starts']).astimezone(s.TZ).strftime('%H:%M')>=state['after'])
           and (not state.get('before') or datetime.fromisoformat(x['starts']).astimezone(s.TZ).strftime('%H:%M')<state['before'])]
    result.update(slots=slots[:12],fetched_at=inventory['fetched_at'],version=inventory['version'],
                  total_matches=len(slots),coverage='first_12_matching_demo_candidates')
    result['answer']=(f"{service['name']} on {day.strftime('%A, %B %d, %Y')} (Eastern): choose a fictional time to review. "
        'Nothing is reserved until you confirm the review.' if slots else
        f"No matching demo times on {day.isoformat()}. {inventory['days'][0]['reason'] or 'Try a different time or date.'}")
    return result


@router.get('')
def resume(request:Request):
    with b.database() as db: state,_=task(db,b.session_id(request,db))
    return render(state,request)


@router.post('')
def converse(body:legacy.Message,request:Request):
    b.require_write(request)
    with b.database() as db:
        owner=b.session_id(request,db)
        previous,version=task(db,owner)
    now=time.monotonic()
    with legacy.lock:
        while legacy.requests and legacy.requests[0][0]<now-60: legacy.requests.popleft()
        if len(legacy.requests)>=20 or sum(x[1]==owner for x in legacy.requests)>=6:
            raise HTTPException(429,'Please wait a minute. Calendar booking is still available.')
        legacy.requests.append((now,owner))
    if not legacy.admission.acquire(blocking=False): raise HTTPException(503,'Assistant busy. Please try shortly.')
    try:
        from .app import db_client
        model=os.environ.get('DATABRICKS_CHAT_ENDPOINT','databricks-qwen3-next-80b-a3b-instruct')
        if not model.startswith('databricks-') or '/' in model: raise ValueError('Endpoint')
        schema=Intent.model_json_schema()
        # Foundation Model tool schemas omit unsupported validation keywords;
        # the full Pydantic contract still validates every returned argument.
        def model_schema(value):
            if isinstance(value,dict): return {k:model_schema(v) for k,v in value.items() if k not in ('pattern','format','default','title')}
            if isinstance(value,list): return [model_schema(v) for v in value]
            return value
        schema=model_schema(schema)
        schema['required']=list(schema['properties'])
        schema['properties']['service_id']={'anyOf':[{'type':'string','enum':list(s.SERVICES)},{'type':'null'}]}
        tool={'type':'function','function':{'name':'scheduling_preferences','description':'Interpret scheduling preferences only. Cannot authorize or execute a booking.','parameters':schema}}
        response=db_client().api_client.do('POST',f'/serving-endpoints/{model}/invocations',body={
            'messages':[{'role':'system','content':
                'Call scheduling_preferences once. Never diagnose, infer clinical urgency, or invent availability. '
                'Explicit immediate danger uses urgent_support. Never request credentials or medical details. '
                'Return ONLY preferences explicitly stated; use null for unspecified values so previous preferences persist. '
                'Use ISO dates resolved in America/New_York. Next weekday means the next occurrence strictly after today. '
                'After 2 means 14:00 in a daytime scheduling request. Afternoon means after 12:00. '
                'TalkNow is on demand, not scheduled: use find_services with no service. '
                'Mode demo requires an explicit request for demo/fictional appointments or existing demo state. '
                'The word demo MUST set mode to demo. Extract service, mode, date, and time together when present. '
                'Requests to confirm or yes cannot authorize booking: use help. Cancelling/rescheduling uses list_my_appointments. '
                f'Today: {datetime.now(s.TZ).date().isoformat()}. Previous structured preferences: {json.dumps(previous)}. '
                f'Services: {json.dumps({k:v["name"] for k,v in s.SERVICES.items()})}'},
                {'role':'user','content':body.message}], 'tools':[tool],'tool_choice':'required','temperature':0,'max_tokens':500})
        calls=response['choices'][0]['message'].get('tool_calls',[])
        if len(calls)!=1 or calls[0]['function']['name']!='scheduling_preferences': raise ValueError('Tool')
        intent=Intent.model_validate(json.loads(calls[0]['function']['arguments']))
        resolved=relative_day(body.message,datetime.now(s.TZ).date())
        if resolved and intent.action=='availability':intent.day=resolved
        if intent.service_id is not None: s.service(intent.service_id)
        if time.monotonic()-now>45: raise TimeoutError('Budget')
    except Exception:
        raise HTTPException(503,'The booking assistant is unavailable. Use the calendar; no booking was submitted.') from None
    finally: legacy.admission.release()
    if intent.action=='urgent_support':
        return {'answer':'For a medical emergency call 911. See Cook’s official emergency support guidance. This assistant cannot assess emergencies.',
                'slots':[],'sources':[{'name':'Cook support','url':'https://ucc.vt.edu/'}]}
    if intent.action=='list_my_appointments':
        return {'answer':'Open your private agenda to review, cancel or reschedule a demo appointment.',
                'appointments':b.appointments(request)['appointments'],'slots':[],'sources':[],
                'action':{'view':'appointments','category':'all','center_id':'cook'}}
    if intent.action in ('help','find_services'):
        return {'answer':'I can find fictional times and prepare a booking review. Confirm using the review button. TalkNow is on demand; use the sourced service directory for access.',
                'slots':[],'sources':[{'name':'VT TimelyCare','url':'https://ucc.vt.edu/timelycare.html'}],
                'action':{'view':'care','category':'all','center_id':'none'}}
    state={} if intent.action=='reset' else {**previous,**{k:v for k,v in intent.model_dump(mode='json').items() if k!='action' and v is not None}}
    if state.get('after') and state.get('before') and state['after']>=state['before']:
        # A changed bound supersedes a now-incompatible bound from an older turn.
        if intent.before and not intent.after:state.pop('after',None)
        elif intent.after and not intent.before:state.pop('before',None)
        else:raise HTTPException(422,'Choose a time window whose end is after its start.')
    with b.database() as db:
        db.execute('BEGIN IMMEDIATE')
        b.session_id(request,db)
        _,current=task(db,owner)
        if current!=version: raise HTTPException(409,'Another conversation updated your preferences. Retry your message.')
        db.execute('''INSERT INTO agent_tasks(owner,state,version) VALUES (?,?,?)
            ON CONFLICT(owner) DO UPDATE SET state=excluded.state,version=excluded.version''',(owner,json.dumps(state),version+1))
    return render(state,request)
