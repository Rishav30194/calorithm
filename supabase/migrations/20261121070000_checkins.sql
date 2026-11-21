-- One weekly check-in per user and calendar day: the maintenance estimate, the targets it set,
-- and the inputs used. The app derives the id from the user and date, like weights (decision
-- 0020), so two devices running the same check-in offline write one row. A skipped week stores
-- why, and carries the previous estimate and targets forward. Decision 0021 holds the rules.
create table public.checkins (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  date date not null,
  status text not null,
  skip_reason text,
  method text,

  previous_maintenance_kcal integer,
  raw_maintenance_kcal integer,
  maintenance_kcal integer not null,
  kcal_target integer not null,
  protein_target_g numeric(4,1) not null,

  trend_weight_kg numeric(5,2) not null,
  trend_change_kg numeric(5,2),
  window_days smallint,
  complete_days_in_window smallint,
  average_intake_kcal integer,
  complete_days_in_week smallint not null,

  goal_rate_requested_kg_per_week numeric(4,2) not null,
  goal_rate_applied_kg_per_week numeric(4,2) not null,
  protein_g_per_kg numeric(2,1) not null,
  calorie_floor_kcal integer not null,
  floor_applied boolean not null,
  rate_capped boolean not null,

  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null,
  deleted_at timestamptz,
  schema_version smallint not null,

  constraint checkins_user_id_date_key unique (user_id, date),
  constraint checkins_date_range check (date >= date '2000-01-01'),
  constraint checkins_status_values check (status in ('updated', 'skipped')),
  -- Only a week with too few complete days is stored as skipped. Missing weigh-ins or profile
  -- fields block a check-in instead, so they never reach the table.
  constraint checkins_skip_reason_values check (skip_reason in ('too_few_complete_days')),
  constraint checkins_method_values check (method in ('formula', 'adaptive')),
  constraint checkins_status_fields check (
    (status = 'updated' and skip_reason is null and method is not null)
    or (status = 'skipped' and skip_reason is not null and method is null)
  ),
  -- A skipped week copies the previous check-in's estimate, targets, and settings, so every
  -- rule below holds for it too. The first check-in has nothing to carry, so it's never
  -- skipped (decision 0021).
  constraint checkins_skipped_carries_previous check (
    status = 'updated'
    or (previous_maintenance_kcal is not null and maintenance_kcal = previous_maintenance_kcal)
  ),
  -- Every updated check-in has a raw estimate; only the adaptive method has a window.
  constraint checkins_raw_when_updated check ((status = 'updated') = (raw_maintenance_kcal is not null)),
  constraint checkins_window_when_adaptive check (
    (method is not distinct from 'adaptive'
      and trend_change_kg is not null and window_days is not null
      and complete_days_in_window is not null and average_intake_kcal is not null)
    or (method is distinct from 'adaptive'
      and trend_change_kg is null and window_days is null
      and complete_days_in_window is null and average_intake_kcal is null)
  ),
  -- The calculation clamps to these ranges, which every input the profile and weights tables
  -- allow can reach, so a check-in never fails to push.
  constraint checkins_maintenance_range check (maintenance_kcal between 0 and 20000),
  constraint checkins_previous_maintenance_range
    check (previous_maintenance_kcal between 0 and 20000),
  constraint checkins_raw_maintenance_range
    check (raw_maintenance_kcal between -100000 and 100000),
  -- The estimate moves at most 150 kcal a check-in.
  constraint checkins_maintenance_step
    check (abs(maintenance_kcal - previous_maintenance_kcal) <= 150),
  constraint checkins_kcal_target_range check (kcal_target between 1000 and 25000),
  constraint checkins_kcal_target_floor check (kcal_target >= calorie_floor_kcal),
  constraint checkins_floor_applied
    check (not floor_applied or kcal_target = calorie_floor_kcal),
  constraint checkins_protein_target_range check (protein_target_g between 1 and 999.9),
  constraint checkins_trend_weight_range check (trend_weight_kg between 20 and 400),
  constraint checkins_trend_change_range check (trend_change_kg between -380 and 380),
  constraint checkins_window_days_range check (window_days between 1 and 28),
  constraint checkins_complete_days_in_window_range
    check (complete_days_in_window between 0 and window_days),
  constraint checkins_average_intake_range check (average_intake_kcal between 0 and 100000),
  constraint checkins_complete_days_in_week_range check (complete_days_in_week between 0 and 7),
  constraint checkins_goal_rate_requested_range
    check (goal_rate_requested_kg_per_week between -2 and 2),
  -- The applied rate is the requested one, capped at 1% of trend weight a week (decision 0009).
  constraint checkins_goal_rate_applied_range check (
    abs(goal_rate_applied_kg_per_week) <= abs(goal_rate_requested_kg_per_week)
    and abs(goal_rate_applied_kg_per_week) <= trend_weight_kg * 0.01
    and sign(goal_rate_applied_kg_per_week) * sign(goal_rate_requested_kg_per_week) >= 0
  ),
  constraint checkins_rate_capped check (
    rate_capped = (goal_rate_applied_kg_per_week <> goal_rate_requested_kg_per_week)
  ),
  constraint checkins_protein_range check (protein_g_per_kg between 1.6 and 2.2),
  constraint checkins_calorie_floor_range check (calorie_floor_kcal between 1000 and 3000),
  constraint checkins_schema_version_positive check (schema_version > 0),
  -- The namespace matches CHECKINS_NAMESPACE in src/data/dayId.ts. Checking the id against the
  -- row's own user_id means no user can claim another user's check-in ids first.
  constraint checkins_id_from_user_and_date check (
    id = extensions.uuid_generate_v5(
      '7211687f-5471-4201-a682-62b6fde94019',
      user_id::text || '/' || to_char(date, 'YYYY-MM-DD')
    )
  )
);

create index checkins_pull_idx on public.checkins (user_id, updated_at, id);

create trigger checkins_set_updated_at
  before insert or update on public.checkins
  for each row execute function public.set_updated_at();

create trigger checkins_skip_stale_update
  before update on public.checkins
  for each row execute function public.skip_stale_update();

alter table public.checkins enable row level security;

create policy "Owners read their check-ins"
  on public.checkins for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners create their check-ins"
  on public.checkins for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Owners update their check-ins"
  on public.checkins for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Rows are soft deleted through deleted_at. Account deletion (phase 6) removes them.
revoke all on public.checkins from anon;
revoke delete, truncate on public.checkins from authenticated;
