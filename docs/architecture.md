# MVP Architecture

## Overview

Remote Contractor Canada is a local-first web app for searching remote contractor jobs available to Canada-based applicants. The MVP should be small enough to run on a developer laptop while still having clear boundaries for source plugins, ingestion, deduplication, scoring, and saved searches.

The recommended MVP shape is a single local web process split into a browser UI, an HTTP API, an ingestion pipeline, pluggable source adapters, and a SQLite database. The process can run scheduled ingestion jobs in-process at first, with persisted run state so failures are visible and recoverable.

## Architecture Principles

- Local-first: all user data, saved searches, bookmarks, and source run history live in local SQLite.
- Pluggable sources: source-specific fetching and parsing is isolated behind a narrow adapter interface.
- Traceable ingestion: keep raw source payload references and sightings so users can understand where a job came from.
- Conservative dedupe: merge only when signals are strong; preserve duplicate sightings instead of losing source evidence.
- Explainable scoring: ranking should be heuristic and inspectable, not opaque.
- Replaceable internals: storage, queueing, and search can be upgraded later without changing the source plugin contract.

## Logical Components

### Web UI

Responsibilities:

- Render search, results, job details, saved searches, bookmarks, and source status.
- Submit search filters to the API.
- Show score breakdowns and dedupe/source sightings.
- Let the user enable or disable source plugins.
- Let the user rerun a saved search or trigger source refresh manually.

Suggested MVP implementation:

- React, Vite, TypeScript.
- Client-side routing.
- Data fetching through typed API client wrappers.

### API Server

Responsibilities:

- Expose local HTTP endpoints for search, jobs, saved searches, bookmarks, source configuration, and ingestion runs.
- Validate request input.
- Coordinate database reads and writes.
- Start manual ingestion runs.
- Return score explanations and dedupe metadata.

Suggested MVP implementation:

- Node.js with TypeScript.
- Fastify or Hono.
- Zod or Valibot for request and response schemas.

### Source Plugin Runtime

Responsibilities:

- Load enabled source plugins from configuration.
- Run plugin fetch methods with source-specific config.
- Enforce common limits such as timeout, max results, and rate delay.
- Capture plugin errors without crashing the app.
- Convert plugin output into ingestion candidates.

The plugin runtime should not own normalization, dedupe, persistence, or scoring. Those belong to the ingestion pipeline so every source is treated consistently.

### Ingestion Pipeline

Responsibilities:

- Start and track source runs.
- Store raw posting payloads or stable raw references.
- Normalize source records into the canonical job model.
- Create or update job sightings.
- Deduplicate candidates against existing jobs.
- Refresh search indexes.
- Recompute scores affected by new or changed data.

Pipeline stages:

1. Fetch source records through a source plugin.
2. Validate each source record.
3. Normalize into canonical fields.
4. Build dedupe keys and compare against existing records.
5. Insert a new job or attach a new sighting to an existing job.
6. Update full-text search data.
7. Compute score and score explanation.
8. Record run metrics and errors.

### Storage

Responsibilities:

- Persist jobs, sightings, source definitions, runs, saved searches, bookmarks, score snapshots, and user preferences.
- Provide transactional updates during ingestion.
- Support FTS-backed search.

Suggested MVP implementation:

- SQLite with migrations.
- SQLite FTS5 virtual table for searchable text.
- WAL mode for better local concurrency.

### Search and Scoring

Responsibilities:

- Search title, company, description, tags, seniority, and location.
- Apply structured filters.
- Rank results using a combined text relevance and heuristic score.
- Explain why a result ranked highly or poorly.

The MVP can compute scores during ingestion and optionally adjust them at query time based on the active search.

## Source Plugin Contract

Each source plugin should implement a small interface. Exact syntax can vary by stack, but the conceptual contract should look like this:

```ts
type SourcePlugin = {
  id: string;
  displayName: string;
  version: string;
  defaultConfig: Record<string, unknown>;
  fetchJobs(input: FetchInput): Promise<SourceJob[]>;
};

type FetchInput = {
  since?: string;
  query?: string;
  limit: number;
  timeoutMs: number;
  config: Record<string, unknown>;
};

type SourceJob = {
  sourceJobId?: string;
  sourceUrl: string;
  title: string;
  company?: string;
  locationText?: string;
  descriptionText?: string;
  employmentTypeText?: string;
  compensationText?: string;
  postedAt?: string;
  raw: unknown;
};
```

Plugin rules:

- Return source records only; do not write to the database.
- Include a stable `sourceUrl` for every job.
- Include `sourceJobId` when the source provides one.
- Preserve enough raw data to debug mapping problems.
- Avoid source-specific ranking. Ranking belongs to the app.
- Respect source terms, rate limits, and API requirements.

## Data Model

Recommended MVP tables:

- `sources`: configured source plugins and enabled status.
- `source_runs`: ingestion run status, timings, counts, and errors.
- `raw_postings`: raw source payloads or raw payload hashes.
- `jobs`: canonical deduplicated job records.
- `job_sightings`: source-specific appearances of a job.
- `job_search_index`: FTS5 searchable projection.
- `job_scores`: latest score and explanation JSON.
- `saved_searches`: named search filters.
- `bookmarks`: locally saved jobs.
- `user_preferences`: scoring and display preferences.

Canonical `jobs` fields:

- `id`
- `canonical_title`
- `company_name`
- `normalized_company_name`
- `location_text`
- `remote_scope`: `canada`, `north_america`, `global`, `unknown`, or `not_remote`
- `contract_type`: `contract`, `contract_to_hire`, `freelance`, `temporary`, `unknown`
- `seniority`
- `compensation_min`
- `compensation_max`
- `compensation_currency`
- `compensation_period`: `hour`, `day`, `month`, `year`, or `unknown`
- `description_text`
- `posted_at`
- `first_seen_at`
- `last_seen_at`
- `status`: `active`, `stale`, `closed`, or `unknown`

`job_sightings` should retain:

- `job_id`
- `source_id`
- `source_job_id`
- `source_url`
- `source_title`
- `source_company`
- `source_posted_at`
- `first_seen_at`
- `last_seen_at`
- `raw_posting_id`

## Deduplication Strategy

The dedupe system should produce a confidence level and reason, then merge only above a conservative threshold.

Strong signals:

- Same source and same `sourceJobId`.
- Same normalized URL after removing tracking parameters.
- Same company, same normalized title, and near-identical posted date.

Medium signals:

- Same company and highly similar title.
- Similar title and same external application URL.
- Matching title, location, and compensation range.

Weak signals:

- Similar title only.
- Similar description snippets only.
- Same company with generic title.

Recommended MVP approach:

- Generate deterministic keys from normalized URL, source ID plus source job ID, company plus title, and application URL when available.
- Use exact-key matching first.
- Use weighted fuzzy comparison second for company, title, location, compensation, and posted date.
- Auto-merge high-confidence matches.
- Keep medium-confidence matches separate at first, but expose possible duplicates in the job detail view later.

Normalization helpers:

- Lowercase and trim company names and titles.
- Remove punctuation, tracking query parameters, and common legal suffixes from companies.
- Collapse whitespace.
- Map employment phrases such as "independent contractor", "B2B", and "freelance" to canonical contract types.
- Detect Canada eligibility from phrases such as "Canada remote", "must be based in Canada", "US or Canada", and "North America".

## Scoring Model

The score should be a 0-100 value with a JSON explanation. It should combine stable job quality signals with user-specific preferences.

Suggested default weights:

- Canada remote eligibility: 25 points.
- Contractor fit: 20 points.
- Keyword/title relevance: 20 points.
- Freshness: 15 points.
- Compensation availability and match: 10 points.
- Source reliability: 5 points.
- Negative filters and exclusions: minus up to 25 points.

Example explanation:

```json
{
  "score": 82,
  "reasons": [
    { "key": "canada_remote", "points": 25, "label": "Open to Canada-based remote applicants" },
    { "key": "contract_fit", "points": 18, "label": "Described as contractor or freelance work" },
    { "key": "freshness", "points": 12, "label": "Posted within the last 7 days" }
  ],
  "penalties": [
    { "key": "unclear_compensation", "points": -4, "label": "No rate or salary listed" }
  ]
}
```

Search result ordering should use text relevance as a query-time input and the persisted score as a baseline. For example:

```text
final_rank = text_relevance * 0.45 + saved_job_score * 0.55
```

## Saved Searches

Saved searches should store both display metadata and machine-readable filters.

Fields:

- `id`
- `name`
- `query`
- `filters_json`
- `sort`
- `enabled_source_ids_json`
- `created_at`
- `updated_at`
- `last_run_at`

MVP behavior:

- Create, update, delete, and rerun saved searches.
- Show result counts for last run.
- Store filters as JSON to keep the schema flexible while filters evolve.
- Do not send saved searches to any external service.

## API Surface

Suggested local endpoints:

- `GET /api/jobs/search`: search and filter jobs.
- `GET /api/jobs/:id`: get one canonical job with sightings and score explanation.
- `POST /api/jobs/:id/bookmark`: bookmark a job.
- `DELETE /api/jobs/:id/bookmark`: remove bookmark.
- `GET /api/saved-searches`: list saved searches.
- `POST /api/saved-searches`: create saved search.
- `PUT /api/saved-searches/:id`: update saved search.
- `DELETE /api/saved-searches/:id`: delete saved search.
- `POST /api/saved-searches/:id/run`: rerun saved search.
- `GET /api/sources`: list source plugins and status.
- `PATCH /api/sources/:id`: enable, disable, or update source config.
- `POST /api/sources/:id/run`: manually run a source.
- `GET /api/source-runs`: list recent ingestion runs.

## MVP Source Strategy

Start with low-risk and testable sources:

1. Manual JSON or CSV import plugin.
2. Public RSS or Atom feed plugin where terms permit use.
3. Public API-backed job source plugin.

Manual import should come first because it lets the app validate normalization, search, dedupe, scoring, and UI without depending on external availability.

## Observability and Failure Handling

The app should expose source health in the UI rather than hiding ingestion failures.

Track per run:

- Source ID.
- Started and completed timestamps.
- Status: `queued`, `running`, `succeeded`, `failed`, or `partial`.
- Records fetched.
- Records inserted.
- Records deduped.
- Records rejected.
- Error summary.

Failure rules:

- One plugin failure should not stop other sources.
- Malformed records should be rejected with reasons and counted.
- Partial runs should persist successful records when transaction boundaries allow it.
- Repeated failures should mark a source as unhealthy but not disable it automatically.

## Security and Privacy

MVP security posture:

- Bind the local server to `127.0.0.1` by default.
- Avoid storing credentials unless a source requires an API key.
- If API keys are needed, store them in a local config file excluded from version control or in the OS keychain later.
- Sanitize HTML descriptions before rendering.
- Treat raw source content as untrusted input.
- Avoid executing plugin-provided dynamic code from remote locations.

Privacy posture:

- Saved searches and bookmarks stay local.
- No analytics by default.
- No background network calls except enabled source refreshes.

## Testing Strategy

MVP tests should focus on behavior that affects trust:

- Source plugin contract validation.
- Normalization fixtures for known source payloads.
- Dedupe cases for exact, strong, medium, and weak matches.
- Scoring fixtures with expected reason breakdowns.
- Search API filtering and ordering.
- Saved search create, update, delete, and rerun behavior.
- Ingestion failure isolation between sources.

Use fixture-based tests for source plugins so the app remains testable without live network calls.

## Implementation Milestones

1. App skeleton: frontend, API server, SQLite migration runner, and local dev command.
2. Schema: tables for sources, runs, jobs, sightings, saved searches, bookmarks, and scores.
3. Manual import source: JSON or CSV plugin with fixture tests.
4. Ingestion pipeline: validation, normalization, storage, dedupe, FTS update, scoring.
5. Search API: query, filters, result ranking, detail endpoint.
6. UI: search page, results, detail view, saved searches, bookmarks, and source status.
7. First live source: API or feed source with clear terms and rate limits.
8. Hardening: error reporting, source run visibility, sanitization, and packaging notes.

## Future Extensions

- Email or desktop notifications for saved search changes.
- Optional cloud sync.
- Additional source plugin packages.
- Better compensation parsing.
- User-tunable scoring weights.
- Possible duplicate review workflow.
- Export to CSV.
- Browser extension or share target for manually adding jobs.
