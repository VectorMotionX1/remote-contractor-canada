import {
  fetchArbeitnowJobs,
  fetchHimalayasJobs,
  fetchHireWeb3Jobs,
  fetchRemoteFirstJobs,
  fetchRemoteOkJobs,
  fetchRemotiveJobs
} from "./sources.js";
import { dedupeJobs } from "./utils.js";
import type { EligibilityStatus, Job, JobSearchResponse } from "./jobTypes.js";

export type SearchParams = {
  query: string;
  eligibility: EligibilityStatus | "all";
  contractOnly: boolean;
  source: string;
};

const broadSearchTerms = new Set([
  "canada",
  "canadian",
  "remote",
  "contract",
  "contractor",
  "contracting",
  "freelance",
  "freelancer",
  "job",
  "jobs",
  "role",
  "roles",
  "work"
]);

function significantTerms(query: string) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !broadSearchTerms.has(term));
}

function matchesQuery(job: Job, query: string) {
  const terms = significantTerms(query);
  if (terms.length === 0) return true;

  const searchable = [
    job.title,
    job.company,
    job.source,
    job.description,
    job.roleCategory,
    job.contractType,
    job.remoteType,
    job.candidateLocationRequirement,
    job.timezoneRequirement,
    ...job.skills
  ]
    .join(" ")
    .toLowerCase();

  return terms.every((term) => searchable.includes(term));
}

export async function searchJobs(params: SearchParams): Promise<JobSearchResponse> {
  const results = await Promise.all([
    fetchRemotiveJobs(params.query),
    fetchArbeitnowJobs(params.query),
    fetchRemoteOkJobs(params.query),
    fetchHimalayasJobs(params.query),
    fetchRemoteFirstJobs(params.query),
    fetchHireWeb3Jobs(params.query)
  ]);
  const warnings = results.flatMap((result) => (result.warning ? [result.warning] : []));
  const allJobs = results.flatMap((result) => result.jobs);
  const filtered = allJobs.filter((job) => {
    if (params.eligibility !== "all" && job.canadaEligible !== params.eligibility) return false;
    if (params.contractOnly && job.contractType === "unclear") return false;
    if (params.source !== "all" && job.source !== params.source) return false;
    if (!matchesQuery(job, params.query)) return false;
    return job.canadaEligible !== "excluded";
  });

  return {
    jobs: dedupeJobs(filtered).slice(0, 120),
    sources: Array.from(new Set(allJobs.map((job) => job.source))).sort(),
    fetchedAt: new Date().toISOString(),
    warnings
  };
}
