import type { EligibilityStatus, Job } from "./jobTypes.js";

const skillTerms = [
  "react",
  "typescript",
  "javascript",
  "node",
  "python",
  "django",
  "rails",
  "ruby",
  "go",
  "java",
  "aws",
  "azure",
  "gcp",
  "devops",
  "kubernetes",
  "data",
  "sql",
  "product",
  "design",
  "marketing",
  "salesforce"
];

const categories: Array<[string, string[]]> = [
  ["Software Engineering", ["engineer", "developer", "frontend", "backend", "full stack", "software"]],
  ["Data", ["data", "analytics", "machine learning", "ai", "scientist"]],
  ["Design", ["designer", "ux", "ui", "product design"]],
  ["Product", ["product manager", "product owner"]],
  ["Marketing", ["marketing", "seo", "content", "growth"]],
  ["Operations", ["operations", "project manager", "customer", "support"]]
];

export function stableId(parts: string[]) {
  const input = parts.join("|").toLowerCase();
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return Math.abs(hash).toString(36).padStart(8, "0").slice(0, 16);
}

export function stripHtml(value: string) {
  return value
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferSkills(text: string) {
  const lower = text.toLowerCase();
  return skillTerms.filter((term) => lower.includes(term));
}

export function inferRoleCategory(title: string, description: string) {
  const lower = `${title} ${description}`.toLowerCase();
  return categories.find(([, terms]) => terms.some((term) => lower.includes(term)))?.[0] ?? "Other";
}

export function inferContractType(text: string): Job["contractType"] {
  const lower = text.toLowerCase();
  if (/\bcontract[- ]to[- ]hire\b/.test(lower)) return "contract-to-hire";
  if (/\bfreelance|freelancer\b/.test(lower)) return "freelance";
  if (/\bcontractor|contract\b/.test(lower)) return "contractor";
  if (/\btemporary|temp\b/.test(lower)) return "temporary";
  return "unclear";
}

export function inferRemoteType(text: string): Job["remoteType"] {
  const lower = text.toLowerCase();
  if (/\bhybrid\b/.test(lower)) return "hybrid";
  if (/\bonsite|on-site\b/.test(lower)) return "onsite";
  if (/\bremote|work from home|distributed\b/.test(lower)) return "remote";
  return "unclear";
}

export function inferEligibility(text: string): {
  status: EligibilityStatus;
  confidence: number;
  requirement: string;
} {
  const lower = text.toLowerCase();
  const excluded = /\bus only\b|\bu\.s\. only\b|\bunited states only\b|\bmust be based in the us\b|\beu only\b|\buk only\b/.test(lower);
  if (excluded) {
    return { status: "excluded", confidence: 0.9, requirement: "Explicitly excludes Canada or limits candidates elsewhere." };
  }
  if (/\bcanada\b|\bcanadian\b|\bus\/canada\b|\bu\.s\.\/canada\b/.test(lower)) {
    return { status: "confirmed", confidence: 0.92, requirement: "Mentions Canada or US/Canada eligibility." };
  }
  if (/\bnorth america\b|\bamericas\b|\bglobal remote\b|\bworldwide\b|\banywhere\b/.test(lower)) {
    return { status: "likely", confidence: 0.7, requirement: "Remote scope appears broad enough for Canada." };
  }
  if (/\bremote\b/.test(lower)) {
    return { status: "unclear", confidence: 0.45, requirement: "Remote role with no clear Canada candidate rule." };
  }
  return { status: "unclear", confidence: 0.25, requirement: "Location eligibility was not found." };
}

export function inferTimezone(text: string) {
  const matches = text.match(/\b(EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC[+-]\d{1,2}|North American time zones?)\b/gi);
  return matches ? Array.from(new Set(matches)).slice(0, 3).join(", ") : "Not specified";
}

export function scoreJob(job: Omit<Job, "score">, query: string) {
  const text = `${job.title} ${job.company} ${job.description}`.toLowerCase();
  let score = 0;
  if (job.canadaEligible === "confirmed") score += 45;
  if (job.canadaEligible === "likely") score += 28;
  if (job.contractType !== "unclear") score += 20;
  if (job.remoteType === "remote") score += 16;
  if (query && text.includes(query.toLowerCase())) score += 18;
  if (job.postedDate) score += 8;
  return score;
}

export function dedupeJobs(jobs: Job[]) {
  const byKey = new Map<string, Job>();
  for (const job of jobs) {
    const key = `${job.company}-${job.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const existing = byKey.get(key);
    if (!existing || job.score > existing.score) byKey.set(key, job);
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score);
}
