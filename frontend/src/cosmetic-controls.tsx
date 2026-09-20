import { useEffect, useId, useRef, useState } from 'react';
import { Bell, Check, Mail, X } from 'lucide-react';

// Presentation only: these values never enter booking state or a request body.
export function AlertsBell() {
  const [selected,setSelected]=useState(false);
  const [request,setRequest]=useState(0),dialogId=useId();
  return <div className="alerts-control">
    <button type="button" className={'alerts-bell'+(selected?' is-selected':'')}
      aria-label="Sign up for Alerts on incoming outbreaks" aria-pressed={selected}
      aria-expanded={selected} aria-haspopup="dialog" aria-controls={dialogId} onClick={()=>{setSelected(true);setRequest(n=>n+1);}}>
      <Bell size={20}/>
    </button>
    <ConfirmationEmail confirmationId={request?String(request):undefined} visible={true} id={dialogId}
      eyebrow="OUTBREAK ALERTS" onClose={()=>setSelected(false)}/>
  </div>;
}

export function ConfirmationEmail({confirmationId,visible,id,eyebrow='APPOINTMENT SAVED',onClose}:{confirmationId?:string;visible:boolean;id?:string;eyebrow?:string;onClose?:()=>void}) {
  const fieldId=useId();
  const dialog=useRef<HTMLDialogElement>(null),seen=useRef(new Set<string>());
  const [email,setEmail]=useState('');
  useEffect(()=>{
    if(!visible){dialog.current?.close();return;}
    if(confirmationId&&!seen.current.has(confirmationId)) {
      seen.current.add(confirmationId);setEmail('');dialog.current?.showModal();
    }
    if(!confirmationId){dialog.current?.close();setEmail('');}
  },[confirmationId,visible]);
  const close=()=>{dialog.current?.close();setEmail('');onClose?.();};
  return <dialog id={id} ref={dialog} className="confirmation-email" aria-labelledby={fieldId+'-title'} onCancel={close}>
    <button className="email-close" type="button" aria-label="Close email prompt" onClick={close}><X size={20}/></button>
    <span className="email-success"><Check size={24}/></span>
    <p className="email-eyebrow">{eyebrow}</p>
    <h2 id={fieldId+'-title'}>One last thing.</h2>
    <p>What’s your email?</p>
    <form onSubmit={e=>{e.preventDefault();close();}}>
      <label htmlFor={fieldId}>Email address <span>(optional)</span></label>
      <div className="email-input"><Mail size={18}/><input id={fieldId} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="off"/></div>
      <div className="email-actions"><button className="booking-secondary" type="button" onClick={close}>Skip</button><button className="booking-primary" type="submit">Done</button></div>
    </form>
  </dialog>;
}
