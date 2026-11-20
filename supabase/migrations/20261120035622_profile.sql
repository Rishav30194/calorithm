-- One row per user: body measurements and settings. Its id is the user's id, so two devices
-- creating a profile offline write the same row instead of clashing.
create table public.profile (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  height_cm numeric(4, 1),
  birth_date date,
  sex text,
  activity_level text,
  units text not null default 'metric',
  goal_rate_kg_per_week numeric(4, 2) not null default 0,
  protein_g_per_kg numeric(2, 1) not null default 1.8,
  calorie_floor_kcal integer not null default 1200,

  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null,
  deleted_at timestamptz,
  schema_version smallint not null,

  constraint profile_id_is_user_id check (id = user_id),
  constraint profile_height_range check (height_cm between 100 and 250),
  constraint profile_birth_date_range check (birth_date >= date '1900-01-01'),
  constraint profile_sex_values check (sex in ('female', 'male')),
  constraint profile_activity_values
    check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  constraint profile_units_values check (units in ('metric', 'imperial')),
  -- The app caps the rate at 1% of trend weight a week; this is the outer bound.
  constraint profile_goal_rate_range check (goal_rate_kg_per_week between -2 and 2),
  constraint profile_protein_range check (protein_g_per_kg between 1.6 and 2.2),
  constraint profile_calorie_floor_range check (calorie_floor_kcal between 1000 and 3000),
  constraint profile_schema_version_positive check (schema_version > 0)
);

comment on column public.profile.client_updated_at is
  'Device time of the edit. Decides conflicts; see public.skip_stale_update().';

create index profile_pull_idx on public.profile (user_id, updated_at, id);

create trigger profile_set_updated_at
  before insert or update on public.profile
  for each row execute function public.set_updated_at();

create trigger profile_skip_stale_update
  before update on public.profile
  for each row execute function public.skip_stale_update();

alter table public.profile enable row level security;

create policy "Owners read their profile"
  on public.profile for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners create their profile"
  on public.profile for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Owners update their profile"
  on public.profile for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Rows are soft deleted through deleted_at. Account deletion (phase 6) removes them.
revoke all on public.profile from anon;
revoke delete, truncate on public.profile from authenticated;
