import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, Check, Compass, LoaderCircle } from 'lucide-react';
import { Brand } from './brand';
import { BookingReview } from './calendar';
import { useBooking } from './booking-state';
import { api, ApiError, session, easternDate, fullTime, easternTime, type Review, type InventorySlot } from './api';
import { emptyIntake, intakeErrors, intakePayload, needsCounseling, type IntakeForm } from './intake-validation';
import './care-intake.css';
import { ConfirmationEmail } from './cosmetic-controls';
import { WaitlistChoices, type WaitlistChoice } from './waitlist-choices';

type Result = { outcome:'choices'|'proposal'|'no_match'|'urgent_support'; reason?:string; answer:string; sources:{name:string;url:string}[]; review:Review|null; slots?:(InventorySlot & {service_name:string})[]; lookup_token?:string; waitlist_options?:WaitlistChoice[] };


export function CareIntake({visible}:{visible:boolean}) {
  const b=useBooking();
  const [insurance,setInsurance]=useState(''),[shown,setShown]=useState(10);
  const selectionKey=useRef<{slot:string;key:string}|null>(null);
  const [form,setForm]=useState<IntakeForm>(emptyIntake),[touched,setTouched]=useState<Record<string,boolean>>({});
  const [result,setResult]=useState<Result|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [waitlistTarget,setWaitlistTarget]=useState<(InventorySlot & {waitlist_id:string})|null>(null);
  const key=useRef<string|null>(null),sequence=useRef(0),locked=useRef(false),heading=useRef<HTMLHeadingElement>(null);
  const errors=intakeErrors(form), counseling=needsCounseling(form);
  const total=counseling?11:10, completed=total-Object.keys(errors).length;
  const busy=loading||b.busy;
  useEffect(()=>{ if(visible && (result||b.saved)) heading.current?.focus(); },[result,b.saved,visible]);
  useEffect(()=>{
    const reset=()=>{sequence.current++;key.current=null;locked.current=false;setLoading(false);setForm(emptyIntake());setInsurance('');setShown(10);selectionKey.current=null;setResult(null);setError('');setTouched({});setWaitlistTarget(null);};
    const prefill=(event:Event)=>{
      const slot=(event as CustomEvent<InventorySlot & {waitlist_id?:string}>).detail;
      sequence.current++;locked.current=false;setLoading(false);

      setWaitlistTarget(slot.waitlist_id ? {...slot,waitlist_id:slot.waitlist_id} : null);
      const local=(value:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
      key.current=null;setResult(null);setError('');
      setForm(f=>({...f,center:slot.center_id,support:slot.service_id.includes('counseling')?'counseling':slot.center_id==='wellness'||slot.service_id.includes('coaching')?'wellness':'physical',
        modality:slot.center_id==='timelycare'?'virtual':'in-person',first_date:easternDate(slot.starts),last_date:easternDate(slot.starts),
        after:local(slot.starts),before:local(slot.ends)}));
      requestAnimationFrame(()=>document.getElementById('booking_name')?.focus());
    };
    window.addEventListener('hokiecare-session-cleared',reset);
    window.addEventListener('hokiecare-request-reset',reset);
    window.addEventListener('hokiecare-intake-prefill',prefill);
    return()=>{window.removeEventListener('hokiecare-session-cleared',reset);window.removeEventListener('hokiecare-request-reset',reset);window.removeEventListener('hokiecare-intake-prefill',prefill);};
  },[]);
  function update<K extends keyof IntakeForm>(name:K,value:IntakeForm[K]) {key.current=null;if(name==='student'&&value==='yes')setInsurance('');setForm(f=>({...f,[name]:value}));}
  function edit() {
    if(busy)return;
    if(!b.dismissReview())return;
    b.setSaved(null); setResult(null); setError('');key.current=null;

    requestAnimationFrame(()=>document.getElementById('booking_name')?.focus());
  }
  async function submit() {
    if(locked.current||b.busy||b.uncertainSave||Object.keys(errors).length)return;

    locked.current=true;setLoading(true);setError('');b.setSaved(null);b.dismissReview();
    const attempt=++sequence.current;
    key.current ||= crypto.randomUUID();
    try {
      await session();
      if(attempt!==sequence.current)return;
      const next=await api<Result>(waitlistTarget ? `/api/booking/waitlist/${waitlistTarget.waitlist_id}/review` : '/api/assistant/intake','POST',intakePayload(form,key.current));
      if(attempt!==sequence.current){if(next.review)void api(`/api/booking/proposals/${next.review.id}`,'DELETE').catch(()=>{});return;}
      setShown(10);selectionKey.current=null;setResult(next);if(next.review)b.adoptReview(next.review);
    }catch(e){if(attempt===sequence.current)setError((e as Error).message);}
    finally{if(attempt===sequence.current){locked.current=false;setLoading(false);}}
  }
  async function refreshTimes(notice='') {
    if(!result?.lookup_token || busy || b.uncertainSave)return;
    if(!b.dismissReview())return;
    setLoading(true);setError(notice);
    const attempt=++sequence.current;
    try {
      const next=await api<Pick<Result,'slots'|'waitlist_options'>>('/api/assistant/intake/choices','POST',{lookup_token:result.lookup_token});
      if(attempt!==sequence.current)return;
      setResult(r=>r?{...r,...next,review:null,answer:next.slots?.length?'Choose an available time below.':'No openings remain in this search. Edit your answers or choose a waitlist time.'}:r);
      setShown(10);selectionKey.current=null;
    }catch(e){if(attempt===sequence.current)setError((e as Error).message);}
    finally{if(attempt===sequence.current)setLoading(false);}
  }
  useEffect(()=>{
    if(b.canReplaceReview&&b.review?.intake&&result?.lookup_token&&!busy)
      void refreshTimes('Your previous time could not be confirmed. Choose from the refreshed available times.');
  },[b.canReplaceReview,b.review?.id,busy,result?.lookup_token]);
  async function selectTime(slot:InventorySlot) {
    if(locked.current||busy||b.uncertainSave||!result?.lookup_token)return;
    locked.current=true;setLoading(true);setError('');
    const attempt=++sequence.current;
    if(selectionKey.current?.slot!==slot.id)selectionKey.current={slot:slot.id,key:crypto.randomUUID()};
    try {
      const next=await api<{review:Review}>('/api/assistant/intake/select','POST',{
        lookup_token:result.lookup_token,slot_id:slot.id,version:slot.version,
        booking_name:form.booking_name.trim(),request_id:selectionKey.current.key});
      if(attempt!==sequence.current){void api(`/api/booking/proposals/${next.review.id}`,'DELETE').catch(()=>{});return;}
      b.adoptReview(next.review);
    }catch(e){
      if(attempt!==sequence.current)return;
      setError((e as Error).message);
      if(e instanceof ApiError && e.status===409){
        selectionKey.current=null;
        try {
          const next=await api<Pick<Result,'slots'|'waitlist_options'>>('/api/assistant/intake/choices','POST',{lookup_token:result.lookup_token});
          if(attempt===sequence.current){setResult(r=>r?{...r,...next}:r);setShown(10);}
        }catch{if(attempt===sequence.current)setResult(r=>r?{...r,slots:[],lookup_token:undefined}:r);}
      }
    }finally{if(attempt===sequence.current){locked.current=false;setLoading(false);}}
  }
  const field=(name:keyof IntakeForm,label:string,control:React.ReactNode)=> <div className="intake-field">
    <label htmlFor={name}>{label} <span aria-hidden="true">*</span></label>{control}
    {touched[name]&&errors[name]&&<span className="field-error" id={name+'-error'}>{errors[name]}</span>}
  </div>;
  const attributes=(name:keyof IntakeForm)=>({id:name,name,disabled:busy,required:true,'aria-invalid':!!(touched[name]&&errors[name]),'aria-describedby':touched[name]&&errors[name]?name+'-error':undefined,onBlur:()=>setTouched(t=>({...t,[name]:true})),
    onInput:(e:React.FormEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>{
      if(['first_date','last_date','after','before'].includes(name))update(name,e.currentTarget.value as never);
    }});
  const select=(name:keyof IntakeForm,options:[string,string][])=> <select {...attributes(name)} value={String(form[name])} onChange={e=>update(name,e.target.value as never)}><option value="">Choose an answer</option>{options.map(([v,label])=><option key={v} value={v}>{label}</option>)}</select>;
  const hasResult=!!result||!!b.review?.intake||!!b.saved;
  return <section className="care-intake" aria-label="Appointment request">
    <header className="intake-welcome"><Brand large/><p>A few answers. One next step across VT’s five care options.</p></header>
    <nav className="intake-tools" aria-label="Care tools"><button disabled={busy} onClick={()=>{b.setPanel('calendar');}}><CalendarDays size={17}/>My calendar</button><button disabled={busy} onClick={()=>b.setPanel('directory')}><Compass size={17}/>Browse care options</button></nav>
    {b.waitlist.some(w=>w.status==='available')&&<div className="waitlist-offer" role="status"><strong>A waitlisted time is available.</strong><button className="booking-secondary" disabled={busy} onClick={()=>{b.setPanel('calendar');b.setTab('waitlist');}}>View my waitlist</button></div>}
    <div className="intake-process" aria-label="Booking steps"><span className={!hasResult?'current':''}>1 <span>Your request</span></span><ArrowRight size={14}/><span className={hasResult&&!b.saved?'current':''}>2 <span>Choose a time</span></span><ArrowRight size={14}/><span className={b.saved?'current':''}>3 <span>Confirm & save</span></span></div>
    {hasResult ? <div className="intake-result" aria-live="polite">
      <h2 ref={heading} tabIndex={-1}>{b.saved?'Appointment saved':result?.outcome==='urgent_support'?'Find immediate support':!b.review&&!result?.slots?.length&&result?.waitlist_options?.length?'this time is taken, would you like to join the waitlist?':result?.outcome==='no_match'?'Let’s adjust your request':b.review?'Review your appointment':'Choose your appointment time'}</h2>
      {b.saved?<><p><Check size={18}/> {b.saved.booking_name||form.booking_name} · {b.saved.center_name||b.saved.service_name}</p><p>{fullTime(b.saved.slot.starts)} Eastern · 30-minute visit</p><p>Saved in HokieCare.</p><button className="booking-primary" onClick={()=>{b.setPanel('calendar');b.setTab('agenda');}}>View my appointment</button></>:<>
        {result&&(!result.waitlist_options?.length||!!result.slots?.length)&&<p className="intake-answer">{result.review&&!b.review?"Your previous proposal is no longer active. Edit your answers to find another appointment.":result.answer}</p>}
        {!!result?.sources.length&&<details className="intake-sources"><summary>Why this recommendation? Sources</summary>{result.sources.map(x=><a key={x.url} href={x.url} target="_blank" rel="noreferrer">{x.name} ↗</a>)}</details>}
        {!b.review&&!!result?.slots?.length&&<div className="intake-time-choices" aria-label="Available appointment times">
          {result.slots.slice(0,shown).map((slot,i,slots)=><div key={slot.id}>
            {(i===0||easternDate(slots[i-1].starts)!==easternDate(slot.starts))&&<h3>{new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'long',month:'long',day:'numeric'}).format(new Date(slot.starts))}</h3>}
            <button className="intake-time-choice" disabled={busy} onClick={()=>void selectTime(slot)}><span><strong>{easternTime(slot.starts)} – {easternTime(slot.ends)} Eastern</strong><small>{slot.service_name}</small></span><ArrowRight size={18}/></button>
          </div>)}
          {shown<result.slots.length&&<button className="booking-secondary" disabled={busy} onClick={()=>setShown(n=>n+10)}>Show more times</button>}
        </div>}
        {!b.review&&!!result?.waitlist_options?.length&&<WaitlistChoices options={result.waitlist_options} onEdit={edit} showPrompt={!!result.slots?.length}/>}
        {b.review?.intake&&<BookingReview onEdit={edit}/>}
        {result?.lookup_token&&b.review?.intake&&<button className="booking-secondary" disabled={busy||b.uncertainSave} onClick={()=>void refreshTimes()}>Back to available times</button>}
        {b.canReplaceReview&&b.review?.intake&&<button disabled={busy} className="booking-secondary" onClick={()=>{if(result?.lookup_token){void refreshTimes();return;}if(Object.keys(errors).length){edit();return;}key.current=null;void submit();}}>{waitlistTarget?'Check this time again':'Find another appointment'}</button>}
      </>}
      {!b.review?.intake&&(!result?.waitlist_options?.length||!!b.saved)&&<button disabled={busy} className="booking-secondary" onClick={()=>{const fresh=!!b.saved;edit();if(fresh){setForm(emptyIntake());setTouched({});setWaitlistTarget(null);}}}>{b.saved?'Start another request':'Edit answers'}</button>}
    </div>:<form className="intake-form" noValidate onSubmit={e=>{e.preventDefault();void submit();}}>
      {waitlistTarget&&<p className="waitlist-offer">Reviewing your waitlisted time: {fullTime(waitlistTarget.starts)} Eastern. Complete the required answers to check service fit. This time is not held.</p>}
      <div className="intake-form-heading"><div><h2>Let’s find your next step.</h2><p>All fields marked * are required.</p></div><span>{Math.max(0,completed)} / {total} complete</span></div>
      <progress value={Math.max(0,completed)} max={total} aria-label="Required answers completed"/>
      <fieldset disabled={busy}><legend><span>01</span> Tell us what you’re looking for</legend>
        {field('booking_name','What should we call you?',<input {...attributes('booking_name')} value={form.booking_name} maxLength={80} autoComplete="off" placeholder="First name or alias" onChange={e=>update('booking_name',e.target.value)}/>)}
        {field('support','What kind of support?',select('support',[['physical','Physical health'],['counseling','Counseling'],['wellness','Wellness'],['unsure','I’m not sure']]))}
        {field('description','What’s got you off your Hokie game?',<textarea {...attributes('description')} value={form.description} maxLength={600} rows={3} placeholder="Briefly describe the help you’re looking for. No medical records or identifying details needed." onChange={e=>update('description',e.target.value)}/>)}
        <p className="intake-hint">Care navigation, not diagnosis. Your description is sent to our Databricks AI to find a service; it isn’t saved in our booking database.</p>
      </fieldset>
      <fieldset disabled={busy}><legend><span>02</span> Your care preferences</legend>
        <div className="intake-grid">{field('center','Where would you like to go?',select('center',[['auto','Choose for me'],['schiffert','Schiffert Health Center'],['cook','Cook Counseling Center'],['timelycare','TimelyCare'],['carilion','Carilion Clinic'],['wellness','Hokie Wellness']]))}
        {field('modality','How would you like to meet?',select('modality',[['in-person','In person'],['virtual','Virtual'],['either','Either works']]))}</div>
        {field('student','Are you a current VT student?',select('student',[['yes','Yes'],['no','No']]))}
        {form.student==='no'&&<div className="intake-field cosmetic-insurance"><label htmlFor="insurance-provider">What is your insurance provider?</label><input id="insurance-provider" value={insurance} onChange={e=>setInsurance(e.target.value)} maxLength={120} placeholder="Provider name or N/A" autoComplete="off"/><small>If self-pay, put N/A.</small></div>}
        {counseling&&field('counseling','Are you currently receiving individual counseling?',select('counseling',[['none','No current individual counseling'],['cook','At Cook Counseling'],['timelycare','Through TimelyCare'],['elsewhere','Somewhere else'],['unsure','I’m not sure']]))}
        {counseling&&<p className="intake-hint">Cook individual therapy and TimelyCare scheduled therapy cannot run concurrently.</p>}
      </fieldset>
      <fieldset disabled={busy}><legend><span>03</span> Make room in your week</legend><p className="intake-hint">We’ll show matching times so you can choose. Allow 30 minutes for your visit; no extra buffer is required. All times Eastern.</p>
        <div className="intake-grid">{field('first_date','Earliest date',<input {...attributes('first_date')} type="date" min={easternDate()} max="2027-05-12" value={form.first_date} onChange={e=>update('first_date',e.target.value)}/>)}
        {field('last_date','Latest date',<input {...attributes('last_date')} type="date" min={form.first_date||easternDate()} max="2027-05-12" value={form.last_date} onChange={e=>update('last_date',e.target.value)}/>)}</div>
        <div className="intake-grid">{field('after','Available from (Eastern)',<input {...attributes('after')} type="time" value={form.after} onChange={e=>update('after',e.target.value)}/>)}
        {field('before','Available until (Eastern)',<input {...attributes('before')} type="time" value={form.before} onChange={e=>{update('before',e.target.value);setTouched(t=>({...t,hours:true}));}}/>)}</div>
        {touched.hours&&errors.hours&&<span className="field-error">{errors.hours}</span>}
      </fieldset>
      <label className="intake-consent"><input type="checkbox" checked={form.acknowledged} disabled={busy} onChange={e=>update('acknowledged',e.target.checked)}/><span>Confirm appointment lookup</span></label>
      <div className="intake-submit"><p>{Object.keys(errors).length?`${Object.keys(errors).length} required answer${Object.keys(errors).length===1?'':'s'} remaining`:'Ready to find your appointment'}</p><button className="booking-primary" disabled={busy||!!Object.keys(errors).length} type="submit">{loading?<><LoaderCircle size={17} className="intake-spinner"/>Finding your appointment…</>:<>Find my appointment <ArrowRight size={17}/></>}</button></div>
    </form>}
    {loading&&<p role="status" className="intake-status">Checking service fit and available times. Your appointment will only be saved after you confirm.</p>}
    {error&&<div className="booking-error" role="alert">{error}{hasResult&&!result?.slots?.length&&<button disabled={busy} onClick={edit}>Edit answers</button>}</div>}
    <ConfirmationEmail confirmationId={b.saved?.id} visible={visible}/>
    <footer className="intake-footer"><p>Your name is private to this browser. Saved appointments remain until 30 days after the visit; clearing cookies loses access.</p><p>Need immediate support? <a href="https://ucc.vt.edu/emergency.html" target="_blank" rel="noreferrer">Urgent-help options ↗</a> · For an emergency, call 911.</p></footer>
  </section>;
}
