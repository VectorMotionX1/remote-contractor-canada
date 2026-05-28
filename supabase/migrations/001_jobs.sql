create extension if not exists pg_trgm;

create table if not exists public.jobs (
  id text primary key,
  title text not null,
  company text not null,
  source text not null,
  source_url text not null,
  application_url text not null,
  posted_date timestamptz,
  discovered_date timestamptz not null default now(),
  description text not null default '',
  excerpt text not null default '',
  role_category text not null default 'Other',
  skills text[] not null default '{}',
  contract_type text not null default 'unclear',
  remote_type text not null default 'unclear',
  candidate_location_requirement text not null default '',
  canada_eligible text not null default 'unclear',
  canada_eligibility_confidence numeric not null default 0,
  timezone_requirement text not null default 'Not specified',
  compensation text not null default 'Not specified',
  score integer not null default 0,
  updated_at timestamptz not null default now(),
  search_document tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(company, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(skills, ' '), '')), 'A') ||
    setweight(to_tsvector('english', coalesce(role_category, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(candidate_location_requirement, '')), 'D')
  ) stored
);

create index if not exists jobs_search_document_idx on public.jobs using gin (search_document);
create index if not exists jobs_title_trgm_idx on public.jobs using gin (title gin_trgm_ops);
create index if not exists jobs_company_trgm_idx on public.jobs using gin (company gin_trgm_ops);
create index if not exists jobs_source_idx on public.jobs (source);
create index if not exists jobs_canada_eligible_idx on public.jobs (canada_eligible);
create index if not exists jobs_contract_type_idx on public.jobs (contract_type);
create index if not exists jobs_score_idx on public.jobs (score desc);

create or replace function public.touch_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_jobs_updated_at on public.jobs;
create trigger touch_jobs_updated_at
before update on public.jobs
for each row execute function public.touch_jobs_updated_at();

create or replace function public.search_jobs(
  search_query text default '',
  eligibility_filter text default 'all',
  source_filter text default 'all',
  contract_only boolean default true,
  limit_count integer default 120
)
returns setof public.jobs
language sql
stable
as $$
  select *
  from public.jobs
  where canada_eligible <> 'excluded'
    and (eligibility_filter = 'all' or canada_eligible = eligibility_filter)
    and (source_filter = 'all' or source = source_filter)
    and (contract_only = false or contract_type <> 'unclear')
    and (
      nullif(trim(search_query), '') is null
      or search_document @@ websearch_to_tsquery('english', search_query)
      or title ilike '%' || search_query || '%'
      or company ilike '%' || search_query || '%'
      or array_to_string(skills, ' ') ilike '%' || search_query || '%'
    )
  order by
    case
      when nullif(trim(search_query), '') is null then score
      else ts_rank_cd(search_document, websearch_to_tsquery('english', search_query)) * 100 + score
    end desc,
    posted_date desc nulls last
  limit least(limit_count, 200);
$$;
