import { useCallback, useEffect, useRef, useState } from 'react';
import { api, session, type Navigation } from './appointments';

export type InventorySlot = {id:string; starts:string; ends:string; service_id:string; center_id:string; version:number; state:string};
type Service = {id:string;center_id:string;name:string;hours_note:string;source_url:string;duration_minutes:number;weekly:Record<string,string[][]>};
export type Review = {id:string;slot:InventorySlot;service_name:string;expires_at:number;operation:string;notice:string;result_id:string|null};
type Day = {day:string;state:string;reason:string|null;available:number|null};
type Inventory = {days:Day[];slots:InventorySlot[];revision:number;fetched_at:string;storage:string};
export const easternDate = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const easternTime = (instant:string) => new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}).format(new Date(instant));
const fullTime = (instant:string) => new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'full',timeStyle:'short'}).format(new Date(instant));
const shiftMonth = (month:string,amount:number) => {const d=new Date(`${month}-01T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+amount);return d.toISOString().slice(0,7)};

export function BookingReview({review,onSaved,onDismiss}:{review:Review;onSaved:()=>void;onDismiss:()=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <section className="booking-review" aria-label="Review demo appointment">
    <h3>{review.operation==='reschedule'?'Review demo reschedule':'Review demo appointment'}</h3>
    <strong>{review.service_name}</strong><p>{fullTime(review.slot.starts)} – {easternTime(review.slot.ends)} Eastern</p>
    <p>{review.notice} This review expires after two minutes; capacity is checked again when you confirm.</p>
    <button className="booking-primary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try {
      await api(`/api/booking/proposals/${review.id}/confirm`,'POST');
      sessionStorage.removeItem('hokiecare-pending-review');
      sessionStorage.removeItem('hokiecare-review-id');
      window.dispatchEvent(new Event('hokiecare-booking-changed'));onSaved();
    } catch(e){setError((e as Error).message)} finally{setBusy(false)}}}>{busy?'Saving…':'Confirm demo appointment'}</button>
    <button className="booking-secondary" disabled={busy} onClick={onDismiss}>Back</button>
    {error&&<p role="alert">{error} Retry this same review after a connection failure to check the saved result.</p>}
  </section>
}

export async function prepareReview(slot:InventorySlot,appointmentId?:string) {
  // Keep the same logical key across uncertain network retries and page refreshes.
  const fingerprint=`${slot.id}|${slot.version}|${appointmentId||''}`;
  let pending: {fingerprint:string;key:string}|null=null;
  try{pending=JSON.parse(sessionStorage.getItem('hokiecare-pending-review')||'null')}catch{/* invalid browser value */}
  if(pending?.fingerprint!==fingerprint) pending={fingerprint,key:crypto.randomUUID()};
  sessionStorage.setItem('hokiecare-pending-review',JSON.stringify(pending));
  let review=await api<Review>('/api/booking/proposals','POST',{slot_id:slot.id,version:slot.version,request_id:pending!.key,appointment_id:appointmentId||null});
  if(review.expires_at*1000<Date.now()&&!review.result_id){
    pending={fingerprint,key:crypto.randomUUID()};sessionStorage.setItem('hokiecare-pending-review',JSON.stringify(pending));
    review=await api<Review>('/api/booking/proposals','POST',{slot_id:slot.id,version:slot.version,request_id:pending.key,appointment_id:appointmentId||null});
  }
  sessionStorage.setItem('hokiecare-review-id',review.id);
  return review;
}

export function SharedCalendar({centerId,records,onSaved,reschedule,onStopReschedule,destination}:{destination?:Navigation;centerId:string;records:{slot_id:string;status:string}[];onSaved:()=>void;reschedule?:{id:string;service_id:string}|null;onStopReschedule:()=>void}) {
  const [services,setServices]=useState<Service[]>([]),[serviceId,setServiceId]=useState('');
  const [mode,setMode]=useState(centerId==='cook'?'demo':'provider');
  const [month,setMonth]=useState(easternDate().slice(0,7)),[day,setDay]=useState(easternDate());
  const [data,setData]=useState<Inventory|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [live,setLive]=useState(false),[review,setReview]=useState<Review|null>(null);
  const generation=useRef(0);
  useEffect(()=>{void api<{services:Service[]}>('/api/booking/catalog').then(x=>setServices(x.services)).catch(e=>setError(e.message))},[]);
  useEffect(()=>{setServiceId(reschedule?.service_id||services.find(s=>s.id===destination?.service_id&&s.center_id===centerId)?.id||services.find(s=>s.center_id===centerId)?.id||'');setMode(reschedule?'demo':destination?.mode||(centerId==='cook'?'demo':'provider'));if(destination?.day){setDay(destination.day);setMonth(destination.day.slice(0,7))}setReview(null)},[centerId,services,reschedule,destination]);
  const load=useCallback(async()=>{
    if(!serviceId)return;
    const id=++generation.current;
    try{const result=await api<Inventory>(`/api/booking/availability?service_id=${serviceId}&from=${month}-01&to=${shiftMonth(month,1)}-01&mode=${mode}`);
      if(id===generation.current){setData(result);setError('')}
    }catch(e){if(id===generation.current)setError((e as Error).message)}
  },[serviceId,month,mode]);
  useEffect(()=>{setData(null);void load();return()=>{generation.current++}},[load]);
  useEffect(()=>{
    if(!serviceId||mode!=='demo'){setLive(false);return}
    let stream:EventSource|null=null;
    function connect(){stream=new EventSource(`/api/booking/events?service_id=${serviceId}`);stream.onopen=()=>setLive(true);stream.onerror=()=>setLive(false);stream.addEventListener('availability',()=>void load())}
    function visible(){if(document.hidden){stream?.close();stream=null;setLive(false)}else{connect();void load()}}
    if(!document.hidden)connect();
    const timer=window.setInterval(()=>{if(!document.hidden)void load()},5000);
    document.addEventListener('visibilitychange',visible);window.addEventListener('hokiecare-booking-changed',load);
    return()=>{stream?.close();clearInterval(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('hokiecare-booking-changed',load)}
  },[load,serviceId,mode]);
  const service=services.find(s=>s.id===serviceId),selected=data?.days.find(d=>d.day===day);
  const title=new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US',{timeZone:'UTC',month:'long',year:'numeric'});
  const firstWeekday=new Date(`${month}-01T12:00:00Z`).getUTCDay();
  function move(amount:number){const next=shiftMonth(month,amount);setMonth(next);setDay(`${next}-01`);setReview(null)}
  function selectDay(value:string){setDay(value);setMonth(value.slice(0,7));setReview(null)}
  return <section className="shared-calendar" aria-label="Service calendar">
    <label className="booking-date">Scheduled service<select value={serviceId} onChange={e=>{setServiceId(e.target.value);setReview(null)}}>{services.filter(s=>s.center_id===centerId).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    {centerId==='timelycare'&&<p className="booking-context">TalkNow is on demand and has no reservable calendar. <a href="https://ucc.vt.edu/timelycare.html" target="_blank" rel="noreferrer">Official access</a></p>}
    <div className="booking-actions"><button aria-pressed={mode==='provider'} onClick={()=>{setMode('provider');setReview(null)}}>Provider availability</button><button aria-pressed={mode==='demo'} onClick={()=>{setMode('demo');setReview(null)}}>Try fictional demo</button></div>
    <p className="booking-context">{mode==='demo'?'Fictional shared inventory. Reservations never contact a provider.':'Availability not connected. Use the official provider route; dates below have unknown availability.'}</p>
    {reschedule&&<p className="booking-context">Choose a new demo time. Your original reservation stays saved until the move succeeds. <button onClick={onStopReschedule}>Stop rescheduling</button></p>}
    <div className="calendar-toolbar"><button aria-label="Previous month" disabled={month<=easternDate().slice(0,7)} onClick={()=>move(-1)}>←</button><h3>{title}</h3><button aria-label="Next month" disabled={month>=shiftMonth(easternDate().slice(0,7),11)} onClick={()=>move(1)}>→</button><button onClick={()=>selectDay(easternDate())}>Today</button></div>
    <div className="calendar-grid" aria-label={title}>
      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><span className="calendar-weekday" key={d}>{d}</span>)}
      {Array.from({length:firstWeekday},(_,i)=><span key={`blank-${i}`}/>)}
      {data?.days.map(d=><button key={d.day} className={`calendar-day ${d.state}`} aria-pressed={day===d.day} aria-current={d.day===easternDate()?'date':undefined} aria-label={`${d.day}: ${d.reason||`${d.available} available demo start times`}`} onClick={()=>selectDay(d.day)} onKeyDown={e=>{const delta=({ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7} as Record<string,number>)[e.key];if(delta){e.preventDefault();const next=new Date(`${d.day}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+delta);const value=next.toISOString().slice(0,10);if(value.slice(0,7)>=easternDate().slice(0,7)&&value.slice(0,7)<=shiftMonth(easternDate().slice(0,7),11)){selectDay(value);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>(`[data-day="${value}"]`)?.focus())}}}} data-day={d.day}><strong>{Number(d.day.slice(8))}</strong><small>{d.state==='not_connected'?'Unknown':d.state==='outside_window'?'Outside window':d.reason?'Closed':`${d.available} free`}</small></button>)}
    </div>
    <label className="booking-date">Agenda date (Eastern)<input type="date" value={day} min={`${easternDate().slice(0,7)}-01`} max={`${shiftMonth(easternDate().slice(0,7),11)}-28`} onChange={e=>{if(e.target.value)selectDay(e.target.value)}}/></label>
    {!data&&!error&&<p role="status">Loading calendar…</p>}
    {error&&<p className="booking-error" role="alert">{error} Calendar may be stale. <button onClick={()=>void load()}>Refresh</button></p>}
    <h3>{day} · Eastern time</h3>
    <p>{selected?.reason}</p>
    {mode==='demo'&&<><p className="booking-small">Demo hours: {service?.weekly[String((new Date(`${day}T12:00:00Z`).getUTCDay()+6)%7)]?.map(x=>x.join('–')).join(', ')||'Closed'}. {service?.duration_minutes} minutes on a 15-minute start grid. Overlapping times share one fictional resource. {service?.hours_note}</p><p className="booking-small">{live?'Live updates connected':'Reconnecting; refreshing every 5 seconds'} · {!data?'Checking storage…':data.storage==='lakebase'?'Saved in Databricks Lakebase':'SQLite demo storage'}{data&&` · Refreshed ${easternTime(data.fetched_at)}`}</p></>}
    <div className="time-grid">{data?.slots.filter(x=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x.starts))===day).map(slot=>{
      const yours=records.some(a=>a.slot_id===slot.id&&a.status==='reserved');
      return <button key={slot.id} disabled={busy||slot.state!=='available'} className={slot.state} onClick={async()=>{setBusy(true);setError('');try{await session();setReview(await prepareReview(slot,reschedule?.id))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>{easternTime(slot.starts)}<small>{yours?'Your appointment':slot.state==='busy'?'Busy':'Available'}</small></button>
    })}</div>
    {review&&<BookingReview review={review} onDismiss={()=>{setReview(null);sessionStorage.removeItem('hokiecare-pending-review')}} onSaved={()=>{setReview(null);onStopReschedule();void load();onSaved()}}/>}
    {service&&<a className="booking-source" href={service.source_url} target="_blank" rel="noreferrer">Schedule source and service details ↗</a>}
    {mode==='demo'&&<p className="booking-small">Campus breaks pause campus demos only. Academic breaks are not verified clinic closures. <a href="https://www.registrar.vt.edu/dates-deadlines/academic-calendar.html" target="_blank" rel="noreferrer">VT calendar</a></p>}
  </section>
}
