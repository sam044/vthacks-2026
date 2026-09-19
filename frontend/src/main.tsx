import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  Heart,
  Activity,
  Compass,
  ShieldCheck,
  ExternalLink,
  RefreshCw,
  Database,
  CalendarDays,
  Phone,
  Video,
  MapPin,
  SlidersHorizontal,
  Info,
  Download,
  Check,
  HeartHandshake,
  Accessibility,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./styles.css";
import { useApi } from "./use-public-data";
import { CareWorkspace } from "./care-workspace";
import { Brand } from "./care-assistant";
import "./care-workspace.css";

type Meta = {
  mode: "live" | "cached";
  queried_at: string;
  statement_id: string;
  cache_age_seconds: number;
  provider: string;
};
type Service = {
  id: string;
  name: string;
  category: string;
  modality: string;
  tagline: string;
  description: string;
  access: string;
  constraints: string;
  source_url: string;
  verified_at: string;
  audience: string;
  snapshot_id: string;
};
type Services = { services: Service[]; data: Meta; availability: string };
type Point = {
  week: string;
  combined_pct: number | null;
  covid_pct: number | null;
  influenza_pct: number | null;
  rsv_pct: number | null;
  combined_count: number | null;
  count_suppressed: boolean;
  report_date: string;
  source_url: string;
  snapshot_id: string;
};
type Trends = {
  points: Point[];
  latest: Point | null;
  data: Meta;
  geography: string;
  facility: string;
  metric: string;
  change_percentage_points: number | null;
  stale: boolean;
  limitations: string;
};
const categories = [
  { id: "all", label: "All support", icon: Compass },
  { id: "mental-health", label: "Mental health", icon: HeartHandshake },
  { id: "physical-health", label: "Physical health", icon: Activity },
  { id: "wellbeing", label: "Everyday well-being", icon: Heart },
  { id: "accessibility", label: "Accessibility", icon: Accessibility },
];
const formatDate = (v: string) =>
  new Date(v + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function Evidence({ data, snapshot }: { data: Meta; snapshot?: string }) {
  return (
    <details className="evidence">
      <summary>
        <Database size={14} />
        {data.mode === "live"
          ? "Queried from Databricks"
          : "Databricks result · cached up to 5 min"}
        <span>View provenance</span>
      </summary>
      <div>
        <p>Query completed: {new Date(data.queried_at).toLocaleString()}</p>
        <p>
          Statement: <code>{data.statement_id}</code>
        </p>
        {snapshot && (
          <p>
            Source snapshot: <code>{snapshot}</code>
          </p>
        )}
        <p>
          Public source records → Unity Catalog → Delta tables → SQL views →
          this page.
        </p>
      </div>
    </details>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="loading" role="status">
      <RefreshCw className="spin" size={21} />
      <strong>{label}</strong>
      <span>
        Connecting to the data warehouse. A cold start can take a little longer.
      </span>
    </div>
  );
}
function Failure({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="failure" role="alert">
      <Info />
      <h3>We couldn’t load this view</h3>
      <p>{message}</p>
      <button className="button" onClick={retry}>
        <RefreshCw size={16} />
        Try again
      </button>
    </div>
  );
}

function ServiceCard({ service }: { service: Service }) {
  const [expanded, setExpanded] = useState(false);
  const icon = categories.find((c) => c.id === service.category)?.icon || Heart;
  const Icon = icon;
  return (
    <article className="service-card">
      <div className="card-top">
        <div className={"icon-box " + service.category}>
          <Icon size={23} />
        </div>
        <span className="modality">
          {service.modality === "virtual" ? (
            <Video size={13} />
          ) : (
            <MapPin size={13} />
          )}{" "}
          {service.modality === "in-person"
            ? "On campus"
            : service.modality === "virtual"
              ? "Virtual"
              : "Format varies"}
        </span>
      </div>
      <p className="eyebrow small">{service.tagline}</p>
      <h3>{service.name}</h3>
      <p className="description">{service.description}</p>
      <button
        className="details-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "Hide access details" : "How to get started"}
        <ArrowRight size={15} />
      </button>
      {expanded && (
        <div className="access-details">
          <h4>Your next step</h4>
          <p>{service.access}</p>
          <h4>Before you connect</h4>
          <p>{service.constraints}</p>
          <p className="subtle">{service.audience}</p>
        </div>
      )}
      <div className="card-footer">
        <span>
          <ShieldCheck size={13} />
          Checked {formatDate(service.verified_at)}
        </span>
        <a href={service.source_url} target="_blank" rel="noreferrer">
          Official page <ArrowUpRight size={16} />
        </a>
      </div>
    </article>
  );
}

function FindCare({ initialCategory = "all" }: { initialCategory?: string }) {
  const [category, setCategory] = useState(initialCategory);
  useEffect(() => setCategory(initialCategory), [initialCategory]);
  const [modality, setModality] = useState("all");
  const query = useApi<Services>(
    `/api/services?category=${category}&modality=${modality}`,
  );
  return (
    <>
      <section className="resource-section" id="resources">
        <div className="section-heading">
          <div>
            <p className="eyebrow">START WITH WHAT YOU NEED</p>
            <h2>There’s a place to turn.</h2>
          </div>
          <p>Explore the options. You decide what fits.</p>
        </div>
        <div className="filters">
          <div className="filter-tabs" aria-label="Support categories">
            {categories.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={category === id ? "active" : ""}
                aria-pressed={category === id}
                onClick={() => setCategory(id)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
          <label className="select-label">
            <SlidersHorizontal size={15} />
            <select
              aria-label="Care format"
              value={modality}
              onChange={(e) => setModality(e.target.value)}
            >
              <option value="all">Any format</option>
              <option value="in-person">On campus</option>
              <option value="virtual">Virtual</option>
            </select>
          </label>
        </div>
        {query.loading ? (
          <Loading label="Finding your campus resources…" />
        ) : query.error ? (
          <Failure message={query.error} retry={query.retry} />
        ) : (
          query.data && (
            <>
              <div className="result-count">
                {query.data.services.length} resources{" "}
                <span>
                  · Published information, not live appointment availability
                </span>
              </div>
              {query.data.services.length ? (
                <div className="card-grid">
                  {query.data.services.map((s) => (
                    <ServiceCard key={s.id} service={s} />
                  ))}
                </div>
              ) : (
                <div className="empty">
                  <Compass />
                  <h3>No resources match these filters</h3>
                  <p>Try a different format or explore all support.</p>
                  <button
                    className="button"
                    onClick={() => {
                      setCategory("all");
                      setModality("all");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
              <Evidence
                data={query.data.data}
                snapshot={query.data.services[0]?.snapshot_id}
              />
            </>
          )
        )}
      </section>
      <section className="help-strip">
        <div className="icon-box">
          <Phone size={21} />
        </div>
        <div>
          <h3>Need immediate help?</h3>
          <p>
            For a medical emergency, call 911. For campus emergency support, use
            Cook’s official guidance.
          </p>
        </div>
        <a href="https://ucc.vt.edu/" target="_blank" rel="noreferrer">
          Cook Counseling <ArrowUpRight size={17} />
        </a>
      </section>
    </>
  );
}

function Briefing({ data }: { data: Trends }) {
  const initial = `New River health briefing\n\nWeek ending ${data.latest?.week}: ${data.latest?.combined_pct ?? "Unavailable"}% of ${data.facility.toLowerCase()} visits were diagnosed with COVID-19, influenza, or RSV.${data.change_percentage_points === null ? "" : ` Change from the previous week: ${data.change_percentage_points > 0 ? "+" : ""}${data.change_percentage_points} percentage points.`}\n\nThis is New River Health District surveillance, not a measure of illness among VT students or a forecast.\n\nFor campus medical appointment instructions: https://healthcenter.vt.edu/appointments.html\n\nSource: ${data.latest?.source_url}\nReport date: ${data.latest?.report_date}\n\nDraft for professional review. Add context appropriate to your conversation.`;
  const [draft, setDraft] = useState(initial);
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([draft], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "hokiecare-resource-card.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  return (
    <section className="briefing">
      <div>
        <p className="eyebrow">FROM INSIGHT TO CONVERSATION</p>
        <h2>
          A resource card,
          <br />
          ready for your perspective.
        </h2>
        <p>
          Use the observed trend as context for a student-facing conversation.
          Review and edit the draft before exporting.
        </p>
        <span className="draft-badge">
          Editable draft · stays in this browser
        </span>
      </div>
      <div>
        <label htmlFor="briefing-draft">Your briefing draft</label>
        <textarea
          id="briefing-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={11}
        />
        <button className="button primary" onClick={download}>
          <Download size={16} />
          Export resource card
        </button>
        <span className="export-note">
          Downloads a text file. Nothing is sent.
        </span>
      </div>
    </section>
  );
}

function HealthIntelligence() {
  const [facility, setFacility] = useState("Emergency Department");
  const [weeks, setWeeks] = useState(52);
  const query = useApi<Trends>(
    `/api/trends?facility=${encodeURIComponent(facility)}&weeks=${weeks}`,
  );
  const d = query.data;
  return (
    <section className="trends-view">
      <div className="trends-heading">
        <div>
          <p className="eyebrow">
            <span className="dot" />
            FOR HEALTHCARE PROFESSIONALS
          </p>
          <h1>
            Local context.
            <br />
            <em>Better conversations.</em>
          </h1>
          <p className="hero-description">
            Explore New River respiratory trends and bring a sourced resource
            card to your next student conversation.
          </p>
        </div>
        <div className="location-note">
          <MapPin size={22} />
          <strong>New River Health District</strong>
          <span>Virginia · Weekly public surveillance</span>
          <small>
            District data does not describe VT students specifically.
          </small>
        </div>
      </div>
      <div className="trends-controls">
        <h2>Respiratory activity</h2>
        <div>
          <label>
            Care setting
            <select
              value={facility}
              onChange={(e) => setFacility(e.target.value)}
            >
              <option>Emergency Department</option>
              <option>Urgent Care</option>
            </select>
          </label>
          <label>
            Time range
            <select
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
            >
              <option value={13}>Last 13 weeks</option>
              <option value={52}>Last 52 weeks</option>
              <option value={350}>Full history</option>
            </select>
          </label>
        </div>
      </div>
      {query.loading ? (
        <Loading label="Reading New River surveillance data…" />
      ) : query.error ? (
        <Failure message={query.error} retry={query.retry} />
      ) : d && d.latest ? (
        <>
          {d.stale && (
            <p className="stale" role="status">
              This snapshot is more than 21 days old. Check the official source
              for newer reporting.
            </p>
          )}
          <div className="stats-grid">
            <div>
              <span>Latest combined visit percentage</span>
              <strong>
                {d.latest.combined_pct === null
                  ? "Unavailable"
                  : `${d.latest.combined_pct.toFixed(1)}%`}
              </strong>
              <small>COVID-19, influenza, or RSV</small>
            </div>
            <div>
              <span>Change from previous week</span>
              <strong>
                {d.change_percentage_points === null
                  ? "Unavailable"
                  : `${d.change_percentage_points > 0 ? "+" : ""}${d.change_percentage_points.toFixed(1)}`}{" "}
                {d.change_percentage_points !== null && <i>pp</i>}
              </strong>
              <small>Percentage points · observed change</small>
            </div>
            <div>
              <span>Week ending</span>
              <strong className="date-stat">{formatDate(d.latest.week)}</strong>
              <small>
                <CalendarDays size={13} /> Reported {d.latest.report_date}
              </small>
            </div>
          </div>
          <div className="chart-card">
            <div className="chart-heading">
              <h3>Weekly share of {facility.toLowerCase()} visits</h3>
              <span>Percent of visits (%)</span>
            </div>
            <div
              className="chart"
              role="img"
              aria-label="Weekly respiratory visit percentages. Exact values are available in the data table below."
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={d.points}
                  margin={{ top: 12, right: 16, left: -16, bottom: 10 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="#e8e4df"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="week"
                    tickFormatter={(v) =>
                      new Date(v + "T12:00:00").toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    }
                    minTickGap={50}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#77756e", fontSize: 11 }}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v}%`}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#77756e", fontSize: 11 }}
                  />
                  <Tooltip
                    labelFormatter={(v) => formatDate(String(v))}
                    formatter={(v) => `${v}%`}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e4dfd9",
                    }}
                  />
                  <Line
                    type="linear"
                    dataKey="combined_pct"
                    name="Combined"
                    stroke="#64253c"
                    strokeWidth={3}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="covid_pct"
                    name="COVID-19"
                    stroke="#d47b3f"
                    strokeWidth={1.6}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="influenza_pct"
                    name="Influenza"
                    stroke="#54897c"
                    strokeWidth={1.6}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="rsv_pct"
                    name="RSV"
                    stroke="#aaa28f"
                    strokeWidth={1.6}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-legend">
              {[
                ["Combined", "#64253c"],
                ["COVID-19", "#d47b3f"],
                ["Influenza", "#54897c"],
                ["RSV", "#aaa28f"],
              ].map(([label, color]) => (
                <span key={label}>
                  <i style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>
            <p className="chart-note">
              <Info size={15} />
              {d.limitations}
            </p>
            <a
              className="source-link"
              href={d.latest.source_url}
              target="_blank"
              rel="noreferrer"
            >
              Virginia Department of Health source <ExternalLink size={13} />
            </a>
            <details className="table-details">
              <summary>
                View accessible data table · {d.points.length} weeks
              </summary>
              <div className="table-scroll">
                <table>
                  <caption>
                    {d.geography} · {facility} · percentage of visits
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Week ending</th>
                      <th scope="col">Combined %</th>
                      <th scope="col">COVID-19 %</th>
                      <th scope="col">Influenza %</th>
                      <th scope="col">RSV %</th>
                      <th scope="col">Combined count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...d.points].reverse().map((p) => (
                      <tr key={p.week}>
                        <th scope="row">{p.week}</th>
                        <td>{p.combined_pct ?? "Unavailable"}</td>
                        <td>{p.covid_pct ?? "Unavailable"}</td>
                        <td>{p.influenza_pct ?? "Unavailable"}</td>
                        <td>{p.rsv_pct ?? "Unavailable"}</td>
                        <td>
                          {p.count_suppressed
                            ? "Suppressed"
                            : (p.combined_count ?? "Unavailable")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
          <Evidence data={d.data} snapshot={d.latest.snapshot_id} />
          <Briefing key={`${facility}-${d.latest.week}`} data={d} />
        </>
      ) : (
        <div className="empty">No data is available for this selection.</div>
      )}
    </section>
  );
}

function AppShell() {
  const [view, setView] = useState<"care" | "intelligence">("care");
  const [intelligenceVisited, setIntelligenceVisited] = useState(false);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="app-header">
        <div className="app-header-inner">
          <a
            href="#"
            className="home-link"
            aria-label="HokieCare home"
            onClick={(e) => {
              e.preventDefault();
              setView("care");
            }}
          >
            <Brand />
          </a>
          <nav aria-label="Main navigation">
            <button
              className={view === "care" ? "selected" : ""}
              aria-current={view === "care" ? "page" : undefined}
              onClick={() => setView("care")}
            >
              <Heart size={17} />
              Care Assistant
            </button>
            <button
              className={view === "intelligence" ? "selected" : ""}
              aria-current={view === "intelligence" ? "page" : undefined}
              onClick={() => {
                setIntelligenceVisited(true);
                setView("intelligence");
              }}
            >
              <Activity size={17} />
              Health Intelligence
            </button>
          </nav>
        </div>
      </header>
      <main id="main" className="app-main">
        <div hidden={view !== "care"}>
          <CareWorkspace
            active={view === "care"}
            renderDirectory={(category) => (
              <FindCare initialCategory={category} />
            )}
          />
        </div>
        {intelligenceVisited && (
          <div
            hidden={view !== "intelligence"}
            className="intelligence-container"
          >
            <HealthIntelligence />
          </div>
        )}
      </main>
      <footer className="app-footer">
        <span>Built for Hokies.</span>
        <span>Independent student project · Not an official VT service</span>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
);
