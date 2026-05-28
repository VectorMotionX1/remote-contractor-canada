import "dotenv/config";
import { dedupeJobs } from "../server/utils.js";
import { fetchSourceJobs } from "../server/sourceRunner.js";
import { upsertJobs } from "../server/supabaseJobs.js";

const query = process.argv.slice(2).join(" ").trim() || "remote contract Canada";

const { jobs, warnings } = await fetchSourceJobs(query);
const deduped = dedupeJobs(jobs).filter((job) => job.canadaEligible !== "excluded");
const result = await upsertJobs(deduped);

console.log(
  JSON.stringify(
    {
      query,
      fetched: jobs.length,
      upserted: result.count,
      warnings
    },
    null,
    2
  )
);
