import { fetchSourceJobs } from "./sourceRunner.js";
import { hasSupabaseConfig, listSupabaseSources, searchSupabaseJobs } from "./supabaseJobs.js";
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

export function significantTerms(query: string) {
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
  if (hasSupabaseConfig()) {
    try {
      const jobs = await searchSupabaseJobs(params);
      const sources = await listSupabaseSources();
      return {
        jobs,
        sources,
        fetchedAt: new Date().toISOString(),
        warnings: []
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Supabase search error";
      return searchLiveJobs(params, [`Supabase search failed, using live sources: ${message}`]);
    }
  }

  return searchLiveJobs(params, ["Supabase is not configured; using live source search."]);
}

async function searchLiveJobs(params: SearchParams, warnings: string[] = []): Promise<JobSearchResponse> {
  const sourceResult = await fetchSourceJobs(params.query);
  const allJobs = sourceResult.jobs;
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
    warnings: [...warnings, ...sourceResult.warnings]
  };
}
