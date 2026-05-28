import type { EligibilityStatus } from "../server/jobTypes.ts";
import { searchJobs } from "../server/search.ts";
import type { VercelRequest, VercelResponse } from "./vercelTypes";

function single(value: string | string[] | undefined, fallback: string) {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const query = single(request.query.q, "contract Canada remote").trim();
  const eligibility = single(request.query.eligibility, "all") as EligibilityStatus | "all";
  const contractOnly = single(request.query.contractOnly, "true") === "true";
  const source = single(request.query.source, "all");

  try {
    response.status(200).json(await searchJobs({ query, eligibility, contractOnly, source }));
  } catch (error) {
    response.status(500).json({
      jobs: [],
      sources: [],
      fetchedAt: new Date().toISOString(),
      warnings: [error instanceof Error ? error.message : "Unknown search error"]
    });
  }
}
