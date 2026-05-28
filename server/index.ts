import express from "express";
import type { EligibilityStatus } from "./jobTypes.js";
import { searchJobs } from "./search.js";

const app = express();
const port = Number(process.env.PORT ?? 5174);

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/jobs", async (request, response) => {
  const query = String(request.query.q ?? "contract Canada remote").trim();
  const eligibility = String(request.query.eligibility ?? "all") as EligibilityStatus | "all";
  const contractOnly = String(request.query.contractOnly ?? "true") === "true";
  const source = String(request.query.source ?? "all");

  response.json(await searchJobs({ query, eligibility, contractOnly, source }));
});

app.listen(port, "127.0.0.1", () => {
  console.log(`API listening on http://127.0.0.1:${port}`);
});
