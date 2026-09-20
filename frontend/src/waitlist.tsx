import { useBooking } from './booking-state';
import { fullTime, serviceLabel } from './api';
import './waitlist.css';

export function MyWaitlist() {
  const b = useBooking();
  return <section className="my-waitlist" aria-label="My waitlist">
    <h3>My waitlist</h3>
    <p className="booking-small">Private to this browser. We’ll show an offer here when your requested time opens. Offers do not hold a time; confirm to book it. Clearing cookies loses access.</p>
    <p className="booking-small">This feature uses HokieCare’s fictional calendar, not a live provider waitlist.</p>
    {!b.waitlist.length && <p>No waiting times yet. Select a taken calendar time to join its waitlist.</p>}
    {b.waitlist.map(entry => <article className={'waitlist-card ' + entry.status} key={entry.id}>
      <h4>{serviceLabel(entry.service_name)}</h4>
      <p>{fullTime(entry.slot.starts)} Eastern</p>
      <p role="status"><strong>{entry.status === 'available' ? 'This time is available' : entry.status === 'fulfilled' ? 'Appointment saved' : entry.status === 'expired' ? 'This time is no longer offered' : 'Waiting for this time'}</strong></p>
      {entry.status === 'available' && <p className="booking-small">Review your answers and confirm before someone else books it.</p>}
      <div className="booking-actions">
        {entry.status === 'available' && <button className="booking-primary" disabled={b.busy || b.waitlistBusy || !!b.waitlistError} onClick={() => b.reviewWaitlist(entry)}>Review appointment</button>}
        {(entry.status === 'available' || entry.status === 'waiting') && <button className="booking-secondary" disabled={b.busy || b.waitlistBusy || b.uncertainSave} onClick={() => void b.leaveWaitlist(entry.id)}>Leave waitlist</button>}
        {entry.status === 'fulfilled' && <button className="booking-secondary" onClick={() => b.setTab('agenda')}>View my appointments</button>}
      </div>
    </article>)}
  </section>;
}
