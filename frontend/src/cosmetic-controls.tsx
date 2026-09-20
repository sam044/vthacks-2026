import { useEffect, useRef, useState } from 'react';
import { Bell, Check, Mail, X } from 'lucide-react';

// Presentation only: these values never enter booking state or a request body.
export function AlertsBell() {
  const [selected,setSelected]=useState(false);
  return <div className="alerts-control">
    <button type="button" className={'alerts-bell'+(selected?' is-selected':'')}
      aria-label="Sign up for Alerts on incoming outbreaks" aria-pressed={selected}
      aria-expanded={selected} aria-controls="alerts-popover" onClick={()=>setSelected(v=>!v)}>
      <Bell size={20}/>
    </button>
    {selected&&<div id="alerts-popover" className="alerts-popover" role="status">Sign up for Alerts on incoming outbreaks</div>}
  </div>;
}

export function ConfirmationEmail({confirmationId,visible}:{confirmationId?:string;visible:boolean}) {
  const dialog=useRef<HTMLDialogElement>(null),seen=useRef(new Set<string>());
  const [email,setEmail]=useState('');
  useEffect(()=>{
    if(!visible){dialog.current?.close();return;}
    if(confirmationId&&!seen.current.has(confirmationId)) {
      seen.current.add(confirmationId);setEmail('');dialog.current?.showModal();
    }
    if(!confirmationId){dialog.current?.close();setEmail('');}
  },[confirmationId,visible]);
  const close=()=>{dialog.current?.close();setEmail('');};
  return <dialog ref={dialog} className="confirmation-email" aria-labelledby="confirmation-email-title" onCancel={close}>
    <button className="email-close" type="button" aria-label="Close email prompt" onClick={close}><X size={20}/></button>
    <span className="email-success"><Check size={24}/></span>
    <p className="email-eyebrow">APPOINTMENT SAVED</p>
    <h2 id="confirmation-email-title">One last thing.</h2>
    <p>What’s your email?</p>
    <form onSubmit={e=>{e.preventDefault();close();}}>
      <label htmlFor="confirmation-email">Email address <span>(optional)</span></label>
      <div className="email-input"><Mail size={18}/><input id="confirmation-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="off"/></div>
      <div className="email-actions"><button className="booking-secondary" type="button" onClick={close}>Skip</button><button className="booking-primary" type="submit">Done</button></div>
    </form>
  </dialog>;
}
