import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Heart,
  CalendarDays,
  Compass,
  Plus,
  Check,
  ArrowUpRight,
} from "lucide-react";
import {
  api,
  session,
  easternTime,
  fullTime,
  serviceLabel,
  type Navigation,
  type InventorySlot,
} from "./api";
import { useBooking } from "./booking-state";

type Answer = {
  answer: string;
  slots?: InventorySlot[];
  selected_slot?: InventorySlot | null;
  action: Navigation | null;
  sources: { name: string; url: string; access?: string }[];
};
type Turn = {
  role: "user" | "assistant";
  content: string;
  sources?: Answer["sources"];
};
export function Brand({ large = false }: { large?: boolean }) {
  return (
    <span className={"care-brand " + (large ? "care-brand-large" : "")}>
      <span className="care-mark">
        <Heart strokeWidth={1.6} />
      </span>
      <span>
        hokie<span className="brand-light">care</span>
      </span>
    </span>
  );
}
export function CareAssistant({ visible }: { visible: boolean }) {
  const b = useBooking();
  const [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null),
    [turns, setTurns] = useState<Turn[]>([]);
  const input = useRef<HTMLTextAreaElement>(null),
    end = useRef<HTMLDivElement>(null),
    sequence = useRef(0),
    sending = useRef(false);
  const active = turns.length > 0 || busy || !!b.saved;
  useEffect(() => {
    const cleared = () => {
      sequence.current++;
      sending.current = false;
      setTurns([]);
      setAnswer(null);
      setText("");
      setError("");
      setBusy(false);
    };
    window.addEventListener("hokiecare-session-cleared", cleared);
    return () =>
      window.removeEventListener("hokiecare-session-cleared", cleared);
  }, []);
  useEffect(() => {
    if (active && visible)
      end.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [turns, busy, b.saved, visible, active]);
  useEffect(() => {
    if (input.current) {
      input.current.style.height = "auto";
      input.current.style.height =
        Math.min(input.current.scrollHeight, 160) + "px";
    }
  }, [text]);
  async function send(message = text) {
    if (sending.current || b.busy || !message.trim()) return;
    sending.current = true;
    const request = ++sequence.current;
    setBusy(true);
    setError("");
    b.dismissReview();
    const history = turns
      .slice(-10)
      .map(({ role, content }) => ({ role, content }));
    setTurns((old) => [...old, { role: "user", content: message }]);
    setText("");
    setAnswer(null);
    try {
      await session();
      const result = await api<Answer>("/api/assistant/booking", "POST", {
        message,
        history,
      });
      if (request !== sequence.current) return;
      setAnswer(result);
      setTurns((old) => [
        ...old,
        { role: "assistant", content: result.answer, sources: result.sources },
      ]);
      if (result.action) b.navigate(result.action);
      if (result.selected_slot) await b.selectSlot(result.selected_slot);
    } catch (e) {
      if (request === sequence.current) {
        setError((e as Error).message);
        setText(message);
        setTurns((old) => old.slice(0, -1));
      }
    } finally {
      if (request === sequence.current) {
        sending.current = false;
        setBusy(false);
      }
    }
  }
  async function startOver() {
    if (busy || b.busy) return;
    sending.current = true;
    ++sequence.current;
    setBusy(true);
    setError("");
    try {
      await api("/api/assistant/booking", "DELETE");
      setTurns([]);
      setAnswer(null);
      setText("");
      b.dismissReview();
      b.setSaved(null);
      b.setRescheduling(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      sending.current = false;
      setBusy(false);
      input.current?.focus();
    }
  }
  const starters = [
    {
      label: "Find care",
      message: "I’m not sure which care option is right for me.",
      icon: Compass,
    },
    {
      label: "Compare options",
      message: "How do Cook Counseling and TimelyCare compare?",
      icon: Heart,
    },
    {
      label: "Plan a visit",
      message: "Help me plan an appointment around my classes.",
      icon: CalendarDays,
    },
  ];
  return (
    <section
      className={"care-chat " + (active ? "has-conversation" : "is-welcome")}
      aria-label="Care assistant"
    >
      {active ? (
        <div className="conversation-heading">
          <span>
            <Heart size={18} /> Your care, one step at a time
          </span>
          <button disabled={busy || b.busy} onClick={() => void startOver()}>
            <Plus size={16} />
            New conversation
          </button>
        </div>
      ) : (
        <div className="care-welcome">
          <Brand large />
          <p className="care-eyebrow">A LITTLE LESS COMPLICATED.</p>
          <h1>
            Less runaround.
            <br />
            <span>More care.</span>
          </h1>
          <p className="welcome-description">
            Find your next step across VT’s five care options.
          </p>
        </div>
      )}
      {active && (
        <div
          className="conversation-log"
          role="log"
          aria-label="Conversation"
          aria-live="polite"
        >
          {turns.map((turn, i) => (
            <article className={"conversation-turn " + turn.role} key={i}>
              <span className="conversation-speaker">
                {turn.role === "user" ? (
                  "You"
                ) : (
                  <>
                    <Heart size={16} />
                    HokieCare
                  </>
                )}
              </span>
              <p>{turn.content}</p>
              {!!turn.sources?.length && (
                <details className="response-sources">
                  <summary>Sources & care options</summary>
                  <div className="source-cards">
                    {turn.sources.map((source) => (
                      <div className="source-card" key={source.name}>
                        <a href={source.url} target="_blank" rel="noreferrer">
                          {source.name}
                          <ArrowUpRight size={16} />
                        </a>
                        {source.access && <p>{source.access}</p>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </article>
          ))}
          {busy && (
            <p className="thinking" role="status">
              <span />
              Checking our directory and calendars…
            </p>
          )}
          {!!answer?.slots?.length && (
            <section
              className="response-card"
              aria-label="Suggested appointment times"
            >
              <span className="booking-badge">Sample times · Eastern</span>
              <h3>Find a time that fits.</h3>
              <div className="suggested-times">
                {answer.slots.slice(0, 3).map((slot) => (
                  <button
                    key={slot.id}
                    disabled={busy || b.busy}
                    onClick={() => void b.selectSlot(slot)}
                  >
                    <strong>
                      {serviceLabel(
                        b.services.find((s) => s.id === slot.service_id)
                          ?.name || "Appointment",
                      )}
                    </strong>
                    <span>
                      {fullTime(slot.starts)} – {easternTime(slot.ends)} Eastern
                    </span>
                    <small>
                      Review this time <ArrowUpRight size={14} />
                    </small>
                  </button>
                ))}
              </div>
              {answer.slots.length > 3 && (
                <button
                  className="all-times"
                  onClick={() => {
                    b.setPanel("calendar");
                    b.setTab("calendar");
                  }}
                >
                  See all times in the calendar <ArrowUpRight size={15} />
                </button>
              )}
            </section>
          )}
          {b.saved && (
            <section className="response-card saved-card" role="status">
              <span className="saved-icon">
                <Check size={20} />
              </span>
              <div>
                <h3>Saved to your calendar.</h3>
                <strong>{serviceLabel(b.saved.service_name)}</strong>
                <p>{fullTime(b.saved.slot.starts)} Eastern</p>
                <p className="booking-small">
                  Sample reservation only. No provider was contacted.
                </p>
                <button
                  onClick={() => {
                    b.setPanel("calendar");
                    b.setTab("agenda");
                  }}
                >
                  View my appointments <ArrowUpRight size={15} />
                </button>
              </div>
            </section>
          )}
          <div ref={end} />
        </div>
      )}
      <div className="composer-area">
        {!active && (
          <p className="composer-helper">
            Tell us what’s going on. We’ll help you find the right service.
          </p>
        )}
        {error && (
          <p className="booking-error" role="alert">
            {error} Your message is ready to retry below.
          </p>
        )}
        <form
          className="care-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className="sr-only" htmlFor="care-question">
            Your message
          </label>
          <textarea
            id="care-question"
            ref={input}
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={600}
            placeholder={
              active
                ? "Keep the conversation going…"
                : "What’s got you off your Hokie game?"
            }
            required
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="composer-controls">
            <span>
              {text.length > 500
                ? text.length + "/600"
                : "Care navigation, not diagnosis"}
            </span>
            <button
              aria-label={busy ? "Waiting for response" : "Send message"}
              disabled={busy || b.busy || !text.trim()}
            >
              <ArrowUp size={21} />
            </button>
          </div>
        </form>
        {!active && (
          <div className="starter-chips">
            {starters.map(({ label, message, icon: Icon }) => (
              <button
                key={label}
                disabled={busy}
                onClick={() => {
                  setText(message);
                  input.current?.focus();
                }}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="care-shortcuts">
          <button
            aria-expanded={b.panel === "calendar"}
            onClick={() => b.setPanel("calendar")}
          >
            <CalendarDays size={16} />
            My calendar
          </button>
          <span>·</span>
          <button
            aria-expanded={b.panel === "directory"}
            onClick={() => b.setPanel("directory")}
          >
            <Compass size={16} />
            Browse care options
          </button>
        </div>
        <div className="care-fineprint">
          <details>
            <summary>Privacy & how it works</summary>
            <p>
              Databricks AI uses our sourced directory and calendars. Recent
              messages are sent as context and stay in page memory, not our
              database. Scheduling preferences last up to 24 hours. Avoid names,
              credentials, and detailed medical histories. Verify AI-generated
              information using its sources.
            </p>
          </details>
          <a href="https://ucc.vt.edu/" target="_blank" rel="noreferrer">
            Need urgent help? ↗
          </a>
        </div>
      </div>
    </section>
  );
}
