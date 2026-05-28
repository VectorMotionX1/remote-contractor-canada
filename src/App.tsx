import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  EyeOff,
  Filter,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import type { EligibilityStatus, Job, JobSearchResponse } from "./types";

const eligibilityLabels: Record<EligibilityStatus, string> = {
  confirmed: "Confirmed",
  likely: "Likely",
  unclear: "Unclear",
  excluded: "Excluded"
};

const storageKeys = {
  saved: "rcc:saved",
  dismissed: "rcc:dismissed"
};

function readSet(key: string) {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(key) ?? "[]"));
  } catch {
    return new Set<string>();
  }
}

function writeSet(key: string, value: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...value]));
}

function formatDate(value: string | null) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function confidenceLabel(job: Job) {
  return `${eligibilityLabels[job.canadaEligible]} ${(job.canadaEligibilityConfidence * 100).toFixed(0)}%`;
}

export function App() {
  const [query, setQuery] = useState("contract Canada remote");
  const [submittedQuery, setSubmittedQuery] = useState(query);
  const [eligibility, setEligibility] = useState<EligibilityStatus | "all">("all");
  const [source, setSource] = useState("all");
  const [contractOnly, setContractOnly] = useState(true);
  const [showDismissed, setShowDismissed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<JobSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(() => readSet(storageKeys.saved));
  const [dismissed, setDismissed] = useState(() => readSet(storageKeys.dismissed));

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      q: submittedQuery,
      eligibility,
      source,
      contractOnly: String(contractOnly)
    });

    setLoading(true);
    setError(null);
    fetch(`/api/jobs?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Search failed with ${response.status}`);
        return response.json() as Promise<JobSearchResponse>;
      })
      .then((payload) => {
        setData(payload);
        setSelectedId((current) => current ?? payload.jobs[0]?.id ?? null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Search failed");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [submittedQuery, eligibility, source, contractOnly]);

  const visibleJobs = useMemo(() => {
    return (data?.jobs ?? []).filter((job) => showDismissed || !dismissed.has(job.id));
  }, [data, dismissed, showDismissed]);

  const selectedJob = visibleJobs.find((job) => job.id === selectedId) ?? visibleJobs[0] ?? null;

  function toggleSet(key: string, setter: (value: Set<string>) => void, current: Set<string>, id: string) {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    writeSet(key, next);
    setter(next);
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <div className="eyebrow">
            <BriefcaseBusiness size={16} />
            Remote Contractor Canada
          </div>
          <h1>Find remote contract roles that can work for Canada-based candidates.</h1>
        </div>
        <button className="iconText" type="button" onClick={() => setSubmittedQuery(query)} disabled={loading}>
          <RefreshCw size={18} />
          Refresh
        </button>
      </section>

      <section className="controls" aria-label="Search controls">
        <form
          className="searchBox"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmittedQuery(query);
          }}
        >
          <Search size={19} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Role, skill, company, or keyword" />
          <button type="submit">Search</button>
        </form>

        <div className="filterRow">
          <label>
            <Filter size={16} />
            <select value={eligibility} onChange={(event) => setEligibility(event.target.value as EligibilityStatus | "all")}>
              <option value="all">All Canada eligibility</option>
              <option value="confirmed">Confirmed Canada</option>
              <option value="likely">Likely Canada</option>
              <option value="unclear">Unclear</option>
            </select>
          </label>
          <label>
            Source
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="all">All sources</option>
              {(data?.sources ?? []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={contractOnly} onChange={(event) => setContractOnly(event.target.checked)} />
            Contract signals only
          </label>
          <label className="check">
            <input type="checkbox" checked={showDismissed} onChange={(event) => setShowDismissed(event.target.checked)} />
            Show dismissed
          </label>
        </div>
      </section>

      {error ? <div className="notice error">{error}</div> : null}
      {data?.warnings.map((warning) => (
        <div className="notice" key={warning}>
          {warning}
        </div>
      ))}

      <section className="workspace">
        <aside className="results">
          <div className="resultMeta">
            <strong>{loading ? "Searching..." : `${visibleJobs.length} roles`}</strong>
            <span>{data ? `Updated ${formatDate(data.fetchedAt)}` : "Live source search"}</span>
          </div>
          {visibleJobs.length === 0 && !loading ? (
            <div className="empty">No roles match these filters.</div>
          ) : (
            visibleJobs.map((job) => (
              <div
                className={`jobRow ${selectedJob?.id === job.id ? "active" : ""} ${dismissed.has(job.id) ? "muted" : ""}`}
                key={job.id}
                onClick={() => setSelectedId(job.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") setSelectedId(job.id);
                }}
              >
                <span className={`status ${job.canadaEligible}`}>{confidenceLabel(job)}</span>
                <a
                  className="jobTitleLink"
                  href={job.applicationUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                >
                  {job.title}
                  <ExternalLink size={14} />
                </a>
                <span>{job.company}</span>
                <span className="rowFoot">
                  {job.contractType} · {job.source}
                </span>
                <a
                  className="miniApply"
                  href={job.applicationUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                >
                  Apply
                  <ExternalLink size={14} />
                </a>
              </div>
            ))
          )}
        </aside>

        <section className="detail">
          {selectedJob ? (
            <>
              <div className="detailHead">
                <div>
                  <span className={`status ${selectedJob.canadaEligible}`}>{confidenceLabel(selectedJob)}</span>
                  <h2>
                    <a href={selectedJob.applicationUrl} target="_blank" rel="noreferrer">
                      {selectedJob.title}
                    </a>
                  </h2>
                  <p>{selectedJob.company}</p>
                </div>
                <div className="actions">
                  <a className="applyButton" href={selectedJob.applicationUrl} target="_blank" rel="noreferrer">
                    <CheckCircle2 size={19} />
                    Apply on {selectedJob.source}
                  </a>
                  <button
                    className={saved.has(selectedJob.id) ? "iconButton active" : "iconButton"}
                    type="button"
                    title="Save job"
                    onClick={() => toggleSet(storageKeys.saved, setSaved, saved, selectedJob.id)}
                  >
                    <Bookmark size={19} />
                  </button>
                  <button
                    className={dismissed.has(selectedJob.id) ? "iconButton active" : "iconButton"}
                    type="button"
                    title="Dismiss job"
                    onClick={() => toggleSet(storageKeys.dismissed, setDismissed, dismissed, selectedJob.id)}
                  >
                    <EyeOff size={19} />
                  </button>
                  <a className="iconButton" href={selectedJob.applicationUrl} target="_blank" rel="noreferrer" title="Open source">
                    <ExternalLink size={19} />
                  </a>
                </div>
              </div>

              <div className="sourceUrl">
                <span>Source URL</span>
                <a href={selectedJob.applicationUrl} target="_blank" rel="noreferrer">
                  {selectedJob.applicationUrl}
                </a>
              </div>

              <div className="facts">
                <div>
                  <ShieldCheck size={17} />
                  <span>{selectedJob.candidateLocationRequirement}</span>
                </div>
                <div>
                  <MapPin size={17} />
                  <span>{selectedJob.remoteType} · {selectedJob.timezoneRequirement}</span>
                </div>
                <div>
                  <CalendarDays size={17} />
                  <span>Posted {formatDate(selectedJob.postedDate)}</span>
                </div>
                <div>
                  <Sparkles size={17} />
                  <span>Match score {selectedJob.score}</span>
                </div>
              </div>

              <div className="tags">
                <span>{selectedJob.roleCategory}</span>
                <span>{selectedJob.contractType}</span>
                <span>{selectedJob.compensation}</span>
                {selectedJob.skills.map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>

              <article>
                <h3>Listing Notes</h3>
                <p>{selectedJob.excerpt}</p>
              </article>
            </>
          ) : (
            <div className="empty detailEmpty">Select a role to inspect its eligibility and source details.</div>
          )}
        </section>
      </section>
    </main>
  );
}
