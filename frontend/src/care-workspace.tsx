import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, X, CalendarDays, Compass } from "lucide-react";
import { BookingProvider, useBooking } from "./booking-state";
import { CareAssistant } from "./care-assistant";
import { AppointmentPanel } from "./appointments";

function WorkspaceBody({
  active,
  renderDirectory,
}: {
  active: boolean;
  renderDirectory: (category: string) => ReactNode;
}) {
  const b = useBooking(),
    panelRef = useRef<HTMLElement>(null),
    contentRef = useRef<HTMLDivElement>(null),
    closeRef = useRef<HTMLButtonElement>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 959px)").matches,
  );
  const [calendarVisited, setCalendarVisited] = useState(false),
    [directoryVisited, setDirectoryVisited] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 959px)");
    const changed = () => setCompact(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [b.tab, b.panel]);
  useEffect(() => {
    if (b.panel === "calendar") setCalendarVisited(true);
    if (b.panel === "directory") setDirectoryVisited(true);
    if (b.panel && active) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (compact) closeRef.current?.focus();
    }
  }, [b.panel, active, compact]);
  function close() {
    b.setPanel(null);
    requestAnimationFrame(() => {
      if (
        returnFocus.current?.isConnected &&
        !returnFocus.current.closest("[hidden]")
      )
        returnFocus.current.focus();
      else document.getElementById("care-question")?.focus();
    });
  }
  useEffect(() => {
    if (!b.panel || !active) return;
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (e.key === "Tab" && compact) {
        const nodes = Array.from(
          panelRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]',
          ) || [],
        ).filter((el) => el.getClientRects().length > 0);
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard);
    const previous = document.body.style.overflow;
    if (compact) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", keyboard);
      document.body.style.overflow = previous;
    };
  }, [b.panel, compact, active]);
  return (
    <div className={"care-workspace " + (b.panel ? "panel-open" : "")}>
      <div className="chat-column" inert={compact && !!b.panel && active}>
        <CareAssistant visible={active && (!compact || !b.panel)} />
      </div>
      <aside
        ref={panelRef}
        hidden={!b.panel}
        className="context-panel"
        role={compact ? "dialog" : "complementary"}
        aria-modal={compact && b.panel ? true : undefined}
        aria-label={b.panel === "directory" ? "Care options" : "Your calendar"}
      >
        <div className="context-panel-heading">
          <div>
            {b.panel === "directory" ? (
              <Compass size={20} />
            ) : (
              <CalendarDays size={20} />
            )}
            <h2>
              {b.panel === "directory" ? "Care options" : "Your calendar"}
            </h2>
          </div>
          <button
            ref={closeRef}
            onClick={close}
            aria-label="Back to conversation"
          >
            <ArrowLeft className="mobile-back" size={18} />
            <span className="mobile-back">Back to conversation</span>
            <X className="desktop-close" size={20} />
          </button>
        </div>
        <div ref={contentRef} className="context-panel-content">
          {calendarVisited && (
            <div hidden={b.panel !== "calendar"}>
              <AppointmentPanel active={active && b.panel === "calendar"} />
            </div>
          )}
          {directoryVisited && (
            <div hidden={b.panel !== "directory"} className="directory-panel">
              {renderDirectory(b.selection.category)}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
export function CareWorkspace(props: {
  active: boolean;
  renderDirectory: (category: string) => ReactNode;
}) {
  return (
    <BookingProvider active={props.active}>
      <WorkspaceBody {...props} />
    </BookingProvider>
  );
}
