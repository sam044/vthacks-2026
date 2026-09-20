import { fullTime, serviceLabel, type InventorySlot } from './api';
import { useBooking } from './booking-state';

export type WaitlistChoice = InventorySlot & {service_name:string};

export function WaitlistChoices({options,onEdit,showPrompt=true}:{options:WaitlistChoice[];onEdit?:()=>void;showPrompt?:boolean}) {
  const b=useBooking();
  return <section aria-label="Matching waitlist times">
    {options.map(slot=>{
      const joined=b.waitlist.some(w=>w.slot.id===slot.id && ['waiting','available'].includes(w.status));
      return <article className="waitlist-card" key={slot.id}>
        {showPrompt&&<h3>this time is taken, would you like to join the waitlist?</h3>}
        <strong>{serviceLabel(slot.service_name)}</strong>
        <p>{fullTime(slot.starts)} Eastern · 30-minute visit</p>
        <button className="booking-primary" disabled={b.busy||b.waitlistBusy||b.uncertainSave}
          onClick={()=>{if(joined){b.setPanel('calendar');b.setTab('waitlist');}
            else void b.joinWaitlist(slot);}}>{joined?'View my waitlist':b.waitlistBusy?'Saving…':'Yes, join waitlist'}</button>
      </article>;
    })}
    {onEdit&&<button className="booking-secondary" disabled={b.busy||b.waitlistBusy} onClick={onEdit}>No, edit request</button>}
    {b.waitlistError&&<p role="alert">{b.waitlistError}</p>}
  </section>;
}
