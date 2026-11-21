-- One row per logged calendar day. Only days marked complete count toward the maintenance
-- estimate. The app derives the id from the user and date, so two devices write one row.
create table public.days (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  date date not null,
  complete boolean not null default false,

  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null,
  deleted_at timestamptz,
  schema_version smallint not null,

  constraint days_user_id_date_key unique (user_id, date),
  constraint days_date_range check (date >= date '2000-01-01'),
  constraint days_schema_version_positive check (schema_version > 0)
);

create index days_pull_idx on public.days (user_id, updated_at, id);

create trigger days_set_updated_at
  before insert or update on public.days
  for each row execute function public.set_updated_at();

create trigger days_skip_stale_update
  before update on public.days
  for each row execute function public.skip_stale_update();

alter table public.days enable row level security;

create policy "Owners read their days"
  on public.days for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners create their days"
  on public.days for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Owners update their days"
  on public.days for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Rows are soft deleted through deleted_at. Account deletion (phase 6) removes them.
revoke all on public.days from anon;
revoke delete, truncate on public.days from authenticated;
