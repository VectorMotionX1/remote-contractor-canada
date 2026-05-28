import {
  fetchArbeitnowJobs,
  fetchHimalayasJobs,
  fetchHireWeb3Jobs,
  fetchRemoteFirstJobs,
  fetchRemoteOkJobs,
  fetchRemotiveJobs
} from "./sources.js";
import { dedupeJobs } from "./utils.js";
import type { EligibilityStatus, JobSearchResponse } from "./jobTypes.js";

export type SearchParams = {
  query: string;
  eligibility: EligibilityStatus | "all";
  contractOnly: boolean;
  source: string;
};

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
    return job.canadaEligible !== "excluded";
  });

  return {
    jobs: dedupeJobs(filtered).slice(0, 120),
    sources: Array.from(new Set(allJobs.map((job) => job.source))).sort(),
    fetchedAt: new Date().toISOString(),
    warnings
  };
}
