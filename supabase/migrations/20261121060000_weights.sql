-- One weigh-in per user and calendar day, in kg. The app derives the id from the user and date
-- (decision 0020), so a second weigh-in on the same day, from any device, replaces the first.
create table public.weights (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  date date not null,
  weight_kg numeric(5,2) not null,

  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null,
  deleted_at timestamptz,
  schema_version smallint not null,

  constraint weights_user_id_date_key unique (user_id, date),
  constraint weights_date_range check (date >= date '2000-01-01'),
  constraint weights_weight_kg_range check (weight_kg between 20 and 400),
  constraint weights_schema_version_positive check (schema_version > 0),
  -- The namespace matches WEIGHTS_NAMESPACE in src/data/dayId.ts. Checking the id against the
  -- row's own user_id means no user can claim another user's weigh-in ids first.
  constraint weights_id_from_user_and_date check (
    id = extensions.uuid_generate_v5(
      '927e1d10-0ca5-4624-ba33-d19a9497f975',
      user_id::text || '/' || to_char(date, 'YYYY-MM-DD')
    )
  )
);

create index weights_pull_idx on public.weights (user_id, updated_at, id);

create trigger weights_set_updated_at
  before insert or update on public.weights
  for each row execute function public.set_updated_at();

create trigger weights_skip_stale_update
  before update on public.weights
  for each row execute function public.skip_stale_update();

alter table public.weights enable row level security;

create policy "Owners read their weights"
  on public.weights for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners create their weights"
  on public.weights for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Owners update their weights"
  on public.weights for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Rows are soft deleted through deleted_at. Account deletion (phase 6) removes them.
revoke all on public.weights from anon;
revoke delete, truncate on public.weights from authenticated;
