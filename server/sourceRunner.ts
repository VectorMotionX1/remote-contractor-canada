import {
  fetchArbeitnowJobs,
  fetchHimalayasJobs,
  fetchHireWeb3Jobs,
  fetchRemoteFirstJobs,
  fetchRemoteOkJobs,
  fetchRemotiveJobs
} from "./sources.js";

export async function fetchSourceJobs(query: string) {
  const results = await Promise.all([
    fetchRemotiveJobs(query),
    fetchArbeitnowJobs(query),
    fetchRemoteOkJobs(query),
    fetchHimalayasJobs(query),
    fetchRemoteFirstJobs(query),
    fetchHireWeb3Jobs(query)
  ]);

  return {
    jobs: results.flatMap((result) => result.jobs),
    warnings: results.flatMap((result) => (result.warning ? [result.warning] : []))
  };
}
