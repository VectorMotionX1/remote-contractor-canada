import { createClient } from "@supabase/supabase-js";
import type { EligibilityStatus, Job } from "./jobTypes.js";
import type { SearchParams } from "./search.js";
import { significantTerms } from "./search.js";

declare const process: {
  env: Record<string, string | undefined>;
};

type JobRow = {
  id: string;
  title: string;
  company: string;
  source: string;
  source_url: string;
  application_url: string;
  posted_date: string | null;
  discovered_date: string;
  description: string;
  excerpt: string;
  role_category: string;
  skills: string[];
  contract_type: Job["contractType"];
  remote_type: Job["remoteType"];
  candidate_location_requirement: string;
  canada_eligible: EligibilityStatus;
  canada_eligibility_confidence: number;
  timezone_requirement: string;
  compensation: string;
  score: number;
};

export function hasSupabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: {
      persistSession: false
    }
  });
}

export function toJobRow(job: Job): JobRow {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    source: job.source,
    source_url: job.sourceUrl,
    application_url: job.applicationUrl,
    posted_date: job.postedDate,
    discovered_date: job.discoveredDate,
    description: job.description,
    excerpt: job.excerpt,
    role_category: job.roleCategory,
    skills: job.skills,
    contract_type: job.contractType,
    remote_type: job.remoteType,
    candidate_location_requirement: job.candidateLocationRequirement,
    canada_eligible: job.canadaEligible,
    canada_eligibility_confidence: job.canadaEligibilityConfidence,
    timezone_requirement: job.timezoneRequirement,
    compensation: job.compensation,
    score: job.score
  };
}

export function fromJobRow(row: JobRow): Job {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    source: row.source,
    sourceUrl: row.source_url,
    applicationUrl: row.application_url,
    postedDate: row.posted_date,
    discoveredDate: row.discovered_date,
    description: row.description,
    excerpt: row.excerpt,
    roleCategory: row.role_category,
    skills: row.skills ?? [],
    contractType: row.contract_type,
    remoteType: row.remote_type,
    candidateLocationRequirement: row.candidate_location_requirement,
    canadaEligible: row.canada_eligible,
    canadaEligibilityConfidence: row.canada_eligibility_confidence,
    timezoneRequirement: row.timezone_requirement,
    compensation: row.compensation,
    score: row.score
  };
}

export async function upsertJobs(jobs: Job[]) {
  if (jobs.length === 0) return { count: 0 };
  const client = supabase();
  const rows = jobs.map(toJobRow);
  const { error } = await client.from("jobs").upsert(rows, { onConflict: "id" });
  if (error) throw error;
  return { count: rows.length };
}

export async function searchSupabaseJobs(params: SearchParams) {
  const client = supabase();
  const dbQuery = significantTerms(params.query).join(" ");
  const { data, error } = await client.rpc("search_jobs", {
    search_query: dbQuery,
    eligibility_filter: params.eligibility,
    source_filter: params.source,
    contract_only: params.contractOnly,
    limit_count: 120
  });

  if (error) throw error;
  const rows = (data ?? []) as JobRow[];
  return rows.map(fromJobRow);
}

export async function listSupabaseSources() {
  const client = supabase();
  const { data, error } = await client.from("jobs").select("source").order("source");
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((row) => row.source).filter(Boolean))).sort();
}
