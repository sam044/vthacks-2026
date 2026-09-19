import {useEffect,useRef,useState} from 'react';
import {Bot,Send} from 'lucide-react';
import {api,session,type Navigation} from './appointments';
import {BookingReview,prepareReview,easternTime,type InventorySlot,type Review} from './calendar';

type Answer={answer:string;slots?:InventorySlot[];selected_slot?:InventorySlot|null;action:Navigation|null;sources:{name:string;url:string;access?:string}[]};
type Turn={role:'user'|'assistant';content:string;sources?:Answer['sources']};
export function CareAssistant({navigate}:{navigate:(action:Navigation)=>void}) {
  const [open,setOpen]=useState(false),[text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [answer,setAnswer]=useState<Answer|null>(null),[review,setReview]=useState<Review|null>(null),[turns,setTurns]=useState<Turn[]>([]);
  const input=useRef<HTMLTextAreaElement>(null),transcript=useRef<HTMLDivElement>(null),initialized=useRef(false);
  useEffect(()=>{
    if(!open)return;input.current?.focus();if(initialized.current)return;initialized.current=true;
    void session().then(async()=>{
      setAnswer(await api<Answer>('/api/assistant/booking'));
      const id=sessionStorage.getItem('hokiecare-review-id');
      if(id){try{const saved=await api<Review>(`/api/booking/proposals/${id}`);if(saved.expires_at*1000>Date.now())setReview(saved)}catch{sessionStorage.removeItem('hokiecare-review-id')}}
    }).catch(e=>{initialized.current=false;setError(e.message)});
  },[open]);
  useEffect(()=>{if(transcript.current)transcript.current.scrollTop=transcript.current.scrollHeight},[turns,busy,answer]);
  async function send(message=text){
    if(busy||!message.trim())return;setBusy(true);setError('');setReview(null);
    const history=turns.slice(-10).map(({role,content})=>({role,content}));
    setTurns(old=>[...old,{role:'user',content:message}]);setText('');setAnswer(null);
    try{
      await session();const result=await api<Answer>('/api/assistant/booking','POST',{message,history});
      setAnswer(result);setTurns(old=>[...old,{role:'assistant',content:result.answer,sources:result.sources}]);
      if(result.action)navigate(result.action);
      if(result.selected_slot){try{setReview(await prepareReview(result.selected_slot))}catch(e){setError((e as Error).message)}}
    }catch(e){setError((e as Error).message);setText(message);setTurns(old=>old.slice(0,-1))}
    finally{setBusy(false);input.current?.focus()}
  }
  async function startOver(){
    setBusy(true);setError('');try{await api('/api/assistant/booking','DELETE');setTurns([]);setAnswer(null);setReview(null);setText('');sessionStorage.removeItem('hokiecare-review-id');sessionStorage.removeItem('hokiecare-pending-review')}
    catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <div className="assistant-wrap">
    <button className="assistant-toggle" aria-expanded={open} onClick={()=>setOpen(!open)}><Bot size={20}/>{open?'Close assistant':'Ask HokieCare'}</button>
    {open&&<section className="assistant-panel" aria-label="HokieCare assistant">
      <div className="chat-heading"><h2>How can I help?</h2><button className="booking-secondary" disabled={busy} onClick={()=>void startOver()}>Start over</button></div>
      <p className="booking-small">Find services, compare options, or plan an appointment. Replies use our sourced directory and calendars.</p>
      <div className="chat-transcript" ref={transcript} role="log" aria-label="Conversation" aria-live="polite">
        {!turns.length&&<div className="chat-welcome"><p>{answer?.answer||"Tell me what you need help with. I'll help you find the next step."}</p>
          <div className="chat-examples">{['I have a sore throat and want an appointment','Compare Cook and TimelyCare','Try a Cook demo next Tuesday after 2'].map(example=><button key={example} disabled={busy} onClick={()=>void send(example)}>{example}</button>)}</div>
        </div>}
        {turns.map((turn,i)=><article className={`chat-turn chat-${turn.role}`} key={i}><span className="chat-speaker">{turn.role==='user'?'You':'HokieCare'}</span><p>{turn.content}</p>
          {!!turn.sources?.length&&<details><summary>Sources and access instructions</summary>{turn.sources.map(source=><div className="chat-source" key={source.name}><a href={source.url} target="_blank" rel="noreferrer">{source.name} ↗</a>{source.access&&<p>{source.access}</p>}</div>)}</details>}
        </article>)}
        {busy&&<p role="status">Checking our directory and calendars…</p>}
      </div>
      {!!answer?.slots?.length&&<div className="chat-slots"><p>Fictional demo times · Eastern</p><div className="time-grid">{answer.slots.map(slot=><button key={slot.id} disabled={busy} onClick={async()=>{setBusy(true);setError('');try{setReview(await prepareReview(slot))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>{easternTime(slot.starts)}<small>Review time</small></button>)}</div></div>}
      {review&&<BookingReview review={review} onDismiss={()=>{setReview(null);sessionStorage.removeItem('hokiecare-pending-review');sessionStorage.removeItem('hokiecare-review-id')}} onSaved={()=>{
        const saved=review;setReview(null);setAnswer(null);sessionStorage.removeItem('hokiecare-review-id');
        setTurns(old=>[...old,{role:'assistant',content:'Your demo appointment is saved in your private agenda. No provider was contacted.'}]);
        navigate({view:'appointments',category:'all',center_id:saved.slot.center_id,mode:'demo',service_id:saved.slot.service_id});
      }}/>}
      {error&&<p className="booking-error" role="alert">{error}</p>}
      <form onSubmit={e=>{e.preventDefault();void send()}}><label htmlFor="care-question">Your message</label>
        <textarea id="care-question" ref={input} value={text} onChange={e=>setText(e.target.value)} maxLength={600} placeholder="What do you need help with?" required onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}}}/>
        <button className="booking-primary" disabled={busy||!text.trim()}><Send size={16}/>{busy?'Thinking…':'Send'}</button>
      </form>
      <p className="booking-small chat-privacy">Powered by Databricks AI. Recent messages are sent as context and stay in page memory, not our database. Scheduling preferences last up to 24 hours. Don’t enter names, credentials, or detailed medical histories.</p>
    </section>}
  </div>;
}
