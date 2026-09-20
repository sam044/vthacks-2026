import { useEffect, useId, useState } from 'react';
import { api } from './appointments';

type Result = { state: string; notice: string };

export function AppointmentEmails() {
  const id = useId();
  const [settings, setSettings] = useState<{ enabled: boolean; storage: string } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api<{ enabled: boolean; storage: string }>('/api/booking/email/settings')
      .then(value => { if (active) setSettings(value); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);

  async function requestEmails() {
    setBusy(true); setError('');
    try {
      setResult(await api<Result>('/api/booking/email/request', 'POST', { email, consent }));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="appointment-emails" aria-labelledby={`${id}-title`}>
    <span className="booking-badge">MOCK SCHEDULE · REAL EMAILS</span>
    <h3 id={`${id}-title`}>Get your appointment emails</h3>
    <p>Enter the email used in the mock appointment schedule. We’ll look up its health center and time, send a confirmation, and remind you 24 hours before.</p>
    <p className="booking-small">The appointment data is fictional. Emails go to your real inbox. Opening a provider link does not create or change these records.</p>
    {settings && <p className="booking-small">Schedule source: {settings.storage}.</p>}
    {settings && !settings.enabled && <p role="status">Email delivery is not configured yet. Connect the Outlook sender to enable real emails.</p>}
    {error && <p role="alert">{error}</p>}
    {result ? <>
      <p role="status">{result.notice}</p>
      <p className="booking-small">Each email includes a link to stop future emails. For appointments within 24 hours, the confirmation serves as the reminder.</p>
      <button className="booking-secondary" onClick={() => { setResult(null); setEmail(''); setConsent(false); }}>Use another email</button>
    </> : <>
      <form onSubmit={e => { e.preventDefault(); void requestEmails(); }}>
        <label htmlFor={`${id}-email`}>Appointment email</label>
        <input id={`${id}-email`} type="email" autoComplete="email" placeholder="Your email from the mock schedule" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} />
        <p className="booking-small">VT and other email addresses are supported when they match a schedule record.</p>
        <label className="email-consent"><input type="checkbox" checked={consent} required onChange={e => setConsent(e.target.checked)} />
          <span>I own this inbox and want real confirmation and reminder emails for my matching mock appointments.</span>
        </label>
        <button className="booking-primary" disabled={busy || !settings?.enabled || !consent}>{busy ? 'Working…' : 'Send my appointment emails'}</button>
      </form>
    </>}
  </section>;
}

export function StopAppointmentEmails() {
  const [link] = useState(() => new URLSearchParams(window.location.hash.slice(1)));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const ident = link.get('stop-email'), token = link.get('token');
  if (!ident || !token) return null;
  return <section className="booking-panel email-stop" aria-label="Stop mock appointment emails">
    <h2>Stop mock appointment emails</h2>
    <p>This stops future emails for this mock appointment. It does not cancel an appointment with a health center.</p>
    {done ? <p role="status">Emails stopped. You can close this page.</p> : <button className="booking-primary" disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try {
        await api(`/api/booking/email/${encodeURIComponent(ident)}/stop`, 'POST', { token });
        setDone(true); window.history.replaceState(null, '', window.location.pathname);
      } catch (e) { setError((e as Error).message); }
      finally { setBusy(false); }
    }}>{busy ? 'Stopping…' : 'Stop these emails'}</button>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
