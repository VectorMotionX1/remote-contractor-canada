# Remote Contractor Canada

Local-first web app for finding remote contractor jobs that are relevant to candidates in Canada. The MVP focuses on collecting jobs from pluggable sources, normalizing them into one searchable catalog, deduplicating repeated postings, scoring fit, and letting users save searches for repeat review.

This repository includes a working MVP local web app plus project documentation. The app currently searches live API-friendly sources, normalizes listings, estimates Canada eligibility, deduplicates obvious repeats, and persists saved/dismissed jobs in browser storage.

## MVP Goals

- Search remote contractor opportunities that are open to Canada-based applicants.
- Support multiple job sources behind a common plugin interface.
- Normalize postings into a consistent local data model.
- Deduplicate jobs that appear across multiple sources.
- Score jobs by relevance, Canada eligibility, contract fit, freshness, and user preferences.
- Let users save searches and revisit results locally.
- Run as a local web app without requiring hosted infrastructure for the MVP.

## Non-Goals for MVP

- Applying to jobs from inside the app.
- User accounts, team sharing, or cloud sync.
- Paid source integrations.
- Browser automation against sites that prohibit scraping or automated access.
- Machine-learning ranking infrastructure beyond transparent heuristic scoring.
- Background crawling at large scale.

## Product Shape

The MVP is a single-user local web app with:

- A search page for keywords, locations, contract type, remote eligibility, salary/rate filters, and source filters.
- A results list with dedupe indicators, source links, score breakdowns, and saved/bookmarked status.
- A job detail view showing normalized fields, source metadata, duplicate sightings, and scoring rationale.
- A saved searches view where users can rerun favorite filters.
- A source management view showing enabled plugins, last run status, and source health.

## Run Locally

```bash
npm install
npm run dev
```

Then open `http://127.0.0.1:5173/`.

Useful checks:

```bash
npm run build
npm run lint
curl 'http://127.0.0.1:5174/api/jobs?q=react%20contract%20Canada'
```

## Current Stack

- Frontend: React, Vite, TypeScript.
- Backend: Node.js, TypeScript, Express.
- Live sources: Remotive, Arbeitnow, Remote OK, Himalayas, RemoteFirstJobs, and HireWeb3 public APIs/RSS feeds.
- Local state: browser `localStorage` for saved and dismissed jobs.
- Search/scoring: in-process normalization, filtering, dedupe, and heuristic scoring.

The architecture doc still describes the next durable version with SQLite, FTS5, saved searches, source run history, and persisted ingestion.

## Core Concepts

- Source: A job board, company career page, public feed, or manually imported file.
- Source plugin: Adapter that knows how to fetch, parse, and map postings from one source.
- Raw posting: Source-specific payload stored for traceability and debugging.
- Normalized job: Canonical job record used by search, dedupe, and scoring.
- Job sighting: Evidence that a normalized job appeared at a source URL at a point in time.
- Saved search: User-owned search query and filters stored locally for reuse.
- Score: Transparent heuristic value used to order jobs and explain relevance.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the proposed MVP architecture, component boundaries, data model, plugin contract, dedupe strategy, scoring model, and implementation milestones.

## MVP Milestones

1. Project skeleton with local web app, API server, SQLite migrations, and development scripts.
2. Manual import source plugin for JSON or CSV job data.
3. First live source plugin using a permitted public API or feed.
4. Normalization, dedupe, and search index pipeline.
5. Search UI, job detail UI, saved searches, and bookmarks.
6. Score breakdowns and source run observability.
7. Packaging notes for local setup.

## Data and Compliance Notes

Source plugins should respect each source's terms of service, robots guidance, rate limits, and API requirements. The MVP should prefer official APIs, RSS/Atom feeds, structured exports, and explicit user-provided imports over scraping. Raw source payloads should be retained only as long as needed for debugging and provenance.
