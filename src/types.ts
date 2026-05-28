export type EligibilityStatus = "confirmed" | "likely" | "unclear" | "excluded";

export type Job = {
  id: string;
  title: string;
  company: string;
  source: string;
  sourceUrl: string;
  applicationUrl: string;
  postedDate: string | null;
  discoveredDate: string;
  description: string;
  excerpt: string;
  roleCategory: string;
  skills: string[];
  contractType: "contractor" | "freelance" | "contract-to-hire" | "temporary" | "unclear";
  remoteType: "remote" | "hybrid" | "onsite" | "unclear";
  candidateLocationRequirement: string;
  canadaEligible: EligibilityStatus;
  canadaEligibilityConfidence: number;
  timezoneRequirement: string;
  compensation: string;
  score: number;
};

export type JobSearchResponse = {
  jobs: Job[];
  sources: string[];
  fetchedAt: string;
  warnings: string[];
};
