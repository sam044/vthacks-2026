import { fullTime, serviceLabel, type InventorySlot } from './api';
import { useBooking } from './booking-state';

export type WaitlistChoice = InventorySlot & {service_name:string};

export function WaitlistChoices({options}:{options:WaitlistChoice[]}) {
  const b=useBooking();
  return <section aria-label="Matching waitlist times">
    {options.map(slot=>{
      const joined=b.waitlist.some(w=>w.slot.id===slot.id && ['waiting','available'].includes(w.status));
      return <article className="waitlist-card" key={slot.id}>
        <h3>{serviceLabel(slot.service_name)}</h3>
        <p>{fullTime(slot.starts)} Eastern · 30-minute visit</p>
        <button className="booking-primary" disabled={b.busy||b.waitlistBusy||b.uncertainSave}
          onClick={()=>{if(joined){b.setPanel('calendar');b.setTab('waitlist');}
            else void b.joinWaitlist(slot);}}>{joined?'View my waitlist':'Join waitlist'}</button>
      </article>;
    })}
    {b.waitlistError&&<p role="alert">{b.waitlistError}</p>}
    <p className="booking-small">Joining does not book an appointment. We’ll show an offer when someone cancels this exact time.</p>
  </section>;
}
