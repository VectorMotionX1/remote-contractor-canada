import type { Job } from "./jobTypes.ts";
import { XMLParser } from "fast-xml-parser";
import {
  inferContractType,
  inferEligibility,
  inferRemoteType,
  inferRoleCategory,
  inferSkills,
  inferTimezone,
  scoreJob,
  stableId,
  stripHtml
} from "./utils.ts";

type SourceResult = {
  jobs: Job[];
  warning?: string;
};

type RemotiveJob = {
  id: number;
  url: string;
  title: string;
  company_name: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description: string;
};

type ArbeitnowJob = {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote?: boolean;
  url: string;
  tags?: string[];
  job_types?: string[];
  created_at?: number;
};

type RemoteOkJob = {
  id?: string | number;
  url?: string;
  apply_url?: string;
  date?: string;
  company?: string;
  position?: string;
  description?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  tags?: string[];
};

type RssItem = {
  title?: string;
  link?: string;
  guid?: string | { "#text"?: string };
  description?: string;
  pubDate?: string;
  category?: string | string[];
  "content:encoded"?: string;
  "himalayasJobs:companyName"?: string;
  "himalayasJobs:locationRestriction"?: string;
  "himalayasJobs:timezoneRestriction"?: string | number;
  "hireweb3Jobs:companyName"?: string;
  "hireweb3Jobs:location"?: string;
  "hireweb3Jobs:locationType"?: string;
  "hireweb3Jobs:minSalary"?: string | number;
  "hireweb3Jobs:maxSalary"?: string | number;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "remote-contractor-canada/0.1 local research app"
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "remote-contractor-canada/0.1 local research app",
      accept: "application/rss+xml, application/xml, text/xml, */*"
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function parseRssItems(xml: string): RssItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: false,
    htmlEntities: true
  });
  const parsed = parser.parse(xml) as { rss?: { channel?: { item?: RssItem | RssItem[] } } };
  return asArray(parsed.rss?.channel?.item);
}

function titleCompanyParts(title: string) {
  const [jobTitle, company] = title.split(/\s+at\s+/i);
  return {
    title: jobTitle?.trim() || title,
    company: company?.trim() || "Unknown"
  };
}

function toJob(input: {
  title: string;
  company: string;
  source: string;
  url: string;
  postedDate: string | null;
  description: string;
  compensation?: string;
  locationText?: string;
  tags?: string[];
  query: string;
}): Job {
  const description = stripHtml(input.description);
  const fullText = `${input.title} ${input.company} ${description} ${input.locationText ?? ""} ${(input.tags ?? []).join(" ")}`;
  const eligibility = inferEligibility(fullText);
  const base = {
    id: stableId([input.source, input.company, input.title, input.url]),
    title: input.title,
    company: input.company,
    source: input.source,
    sourceUrl: input.url,
    applicationUrl: input.url,
    postedDate: input.postedDate,
    discoveredDate: new Date().toISOString(),
    description,
    excerpt: description.slice(0, 280),
    roleCategory: inferRoleCategory(input.title, description),
    skills: Array.from(new Set([...inferSkills(fullText), ...(input.tags ?? []).map((tag) => tag.toLowerCase())])).slice(0, 8),
    contractType: inferContractType(fullText),
    remoteType: inferRemoteType(fullText),
    candidateLocationRequirement: input.locationText || eligibility.requirement,
    canadaEligible: eligibility.status,
    canadaEligibilityConfidence: eligibility.confidence,
    timezoneRequirement: inferTimezone(fullText),
    compensation: input.compensation || "Not specified"
  };
  return { ...base, score: scoreJob(base, input.query) };
}

function toRssJob(input: {
  item: RssItem;
  source: string;
  query: string;
  company?: string;
  locationText?: string;
  description?: string;
  tags?: string[];
  compensation?: string;
}) {
  const title = String(input.item.title ?? "Untitled role");
  const fallback = titleCompanyParts(title);
  const link = typeof input.item.link === "string" ? input.item.link : "";
  return toJob({
    title: fallback.title,
    company: input.company || fallback.company,
    source: input.source,
    url: link || (typeof input.item.guid === "string" ? input.item.guid : input.item.guid?.["#text"] ?? ""),
    postedDate: input.item.pubDate ? new Date(input.item.pubDate).toISOString() : null,
    description: input.description ?? input.item["content:encoded"] ?? input.item.description ?? "",
    locationText: input.locationText,
    tags: input.tags,
    compensation: input.compensation,
    query: input.query
  });
}

export async function fetchRemotiveJobs(query: string): Promise<SourceResult> {
  try {
    const url = new URL("https://remotive.com/api/remote-jobs");
    url.searchParams.set("search", query || "contract Canada");
    const data = await fetchJson<{ jobs: RemotiveJob[] }>(url.toString());
    const jobs = data.jobs.map((job) =>
      toJob({
        title: job.title,
        company: job.company_name,
        source: "Remotive",
        url: job.url,
        postedDate: job.publication_date ?? null,
        description: job.description,
        compensation: job.salary,
        locationText: job.candidate_required_location,
        query
      })
    );
    return { jobs };
  } catch (error) {
    return { jobs: [], warning: `Remotive unavailable: ${error instanceof Error ? error.message : "unknown error"}` };
  }
}

export async function fetchArbeitnowJobs(query: string): Promise<SourceResult> {
  try {
    const data = await fetchJson<{ data: ArbeitnowJob[] }>("https://www.arbeitnow.com/api/job-board-api");
    const q = query.toLowerCase();
    const jobs = data.data
      .filter((job) => {
        const text = `${job.title} ${job.company_name} ${job.description} ${(job.tags ?? []).join(" ")} ${(job.job_types ?? []).join(" ")}`.toLowerCase();
        return !q || text.includes(q) || text.includes("remote") || text.includes("contract");
      })
      .slice(0, 80)
      .map((job) =>
        toJob({
          title: job.title,
          company: job.company_name,
          source: "Arbeitnow",
          url: job.url,
          postedDate: job.created_at ? new Date(job.created_at * 1000).toISOString() : null,
          description: job.description,
          locationText: job.remote ? "Remote" : "Location not specified",
          tags: [...(job.tags ?? []), ...(job.job_types ?? [])],
          query
        })
      );
    return { jobs };
  } catch (error) {
    return { jobs: [], warning: `Arbeitnow unavailable: ${error instanceof Error ? error.message : "unknown error"}` };
  }
}

export async function fetchRemoteOkJobs(query: string): Promise<SourceResult> {
  try {
    const data = await fetchJson<Array<RemoteOkJob | { legal?: string }>>("https://remoteok.com/api");
    const q = query.toLowerCase();
    const jobs = data
      .filter((entry): entry is RemoteOkJob => "position" in entry)
      .filter((job) => {
        const text = `${job.position ?? ""} ${job.company ?? ""} ${job.description ?? ""} ${job.location ?? ""} ${(job.tags ?? []).join(" ")}`.toLowerCase();
        return !q || text.includes(q) || text.includes("canada") || text.includes("contract");
      })
      .slice(0, 100)
      .map((job) => {
        const compensation =
          job.salary_min || job.salary_max ? `${job.salary_min ?? "?"}-${job.salary_max ?? "?"} USD/year` : undefined;
        return toJob({
          title: job.position ?? "Untitled role",
          company: job.company ?? "Unknown",
          source: "Remote OK",
          url: job.url || job.apply_url || `https://remoteok.com/remote-jobs/${job.id ?? ""}`,
          postedDate: job.date ?? null,
          description: job.description ?? "",
          compensation,
          locationText: job.location,
          tags: job.tags,
          query
        });
      });
    return { jobs };
  } catch (error) {
    return { jobs: [], warning: `Remote OK unavailable: ${error instanceof Error ? error.message : "unknown error"}` };
  }
}

export async function fetchHimalayasJobs(query: string): Promise<SourceResult> {
  try {
    const xml = await fetchText("https://himalayas.app/jobs/rss");
    const q = query.toLowerCase();
    const jobs = parseRssItems(xml)
      .filter((item) => {
        const text = `${item.title ?? ""} ${item.description ?? ""} ${item["content:encoded"] ?? ""} ${item["himalayasJobs:locationRestriction"] ?? ""}`.toLowerCase();
        return !q || text.includes(q) || text.includes("canada") || text.includes("contract") || text.includes("remote");
      })
      .slice(0, 100)
      .map((item) =>
        toRssJob({
          item,
          source: "Himalayas",
          query,
          company: item["himalayasJobs:companyName"],
          locationText: item["himalayasJobs:locationRestriction"]
            ? `Location restriction: ${item["himalayasJobs:locationRestriction"]}`
            : undefined,
          tags: asArray(item.category)
        })
      );
    return { jobs };
  } catch (error) {
    return { jobs: [], warning: `Himalayas unavailable: ${error instanceof Error ? error.message : "unknown error"}` };
  }
}

export async function fetchRemoteFirstJobs(query: string): Promise<SourceResult> {
  try {
    const xml = await fetchText("https://remotefirstjobs.com/rss/jobs/contract.rss");
    const q = query.toLowerCase();
    const jobs = parseRssItems(xml)
      .filter((item) => {
        const text = `${item.title ?? ""} ${item.description ?? ""}`.toLowerCase();
        return !q || text.includes(q) || text.includes("canada") || text.includes("contract") || text.includes("remote");
      })
      .slice(0, 100)
      .map((item) =>
        toRssJob({
          item,
          source: "RemoteFirstJobs",
          query,
          description: `${item.description ?? ""} Remote contract role from RemoteFirstJobs.`,
          locationText: "Remote contract feed"
        })
      );
    return { jobs };
  } catch (error) {
    return { jobs: [], warning: `RemoteFirstJobs unavailable: ${error instanceof Error ? error.message : "unknown error"}` };
  }
}

export async function fetchHireWeb3Jobs(query: string): Promise<SourceResult> {
  try {
    const xml = await fetchText("https://hireweb3.io/job/rss");
    const q = query.toLowerCase();
    const jobs = parseRssItems(xml)
      .filter((item) => {
        const text = `${item.title ?? ""} ${item.description ?? ""} ${item["hireweb3Jobs:companyName"] ?? ""} ${item["hireweb3Jobs:location"] ?? ""} ${item["hireweb3Jobs:locationType"] ?? ""}`.toLowerCase();
        return !q || text.includes(q) || text.includes("canada") || text.includes("contract") || text.includes("remote");
      })
      .slice(0, 80)
      .map((item) => {
        const min = item["hireweb3Jobs:minSalary"];
        const max = item["hireweb3Jobs:maxSalary"];
        const compensation = min || max ? `${min || "?"}-${max || "?"}` : undefined;
        return toRssJob({
          item,
          source: "HireWeb3",
          query,
          company: item["hireweb3Jobs:companyName"],
          locationText: [item["hireweb3Jobs:location"], item["hireweb3Jobs:locationType"]].filter(Boolean).join(" · "),
          compensation
        });
      });
    return { jobs };
  } catch (error) {
    return { jobs: [], warning: `HireWeb3 unavailable: ${error instanceof Error ? error.message : "unknown error"}` };
  }
}
