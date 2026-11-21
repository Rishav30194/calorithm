-- What was eaten, on which local calendar day and meal. The name, kcal, and protein are
-- copied when logged, so editing a food or recipe later never changes a past day.
create table public.log_entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  date date not null,
  meal text not null,
  food_id uuid,
  recipe_id uuid,
  servings numeric(7, 2) not null,
  name text not null,
  kcal integer not null,
  protein_g numeric(7, 1) not null,

  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null,
  deleted_at timestamptz,
  schema_version smallint not null,

  -- As in recipe_items, each reference includes user_id so it stays within one user's rows.
  constraint log_entries_food_fkey
    foreign key (food_id, user_id) references public.foods (id, user_id),
  constraint log_entries_recipe_fkey
    foreign key (recipe_id, user_id) references public.recipes (id, user_id),
  constraint log_entries_one_source check (num_nonnulls(food_id, recipe_id) = 1),
  constraint log_entries_meal_values check (meal in ('breakfast', 'lunch', 'dinner', 'snacks')),
  constraint log_entries_date_range check (date >= date '2000-01-01'),
  constraint log_entries_servings_range check (servings > 0 and servings <= 1000),
  constraint log_entries_name_length check (char_length(btrim(name)) between 1 and 100),
  constraint log_entries_kcal_range check (kcal between 0 and 100000),
  constraint log_entries_protein_range check (protein_g between 0 and 10000),
  constraint log_entries_schema_version_positive check (schema_version > 0)
);

create index log_entries_date_idx on public.log_entries (user_id, date);
create index log_entries_food_idx on public.log_entries (food_id);
create index log_entries_recipe_idx on public.log_entries (recipe_id);

create index log_entries_pull_idx on public.log_entries (user_id, updated_at, id);

create trigger log_entries_set_updated_at
  before insert or update on public.log_entries
  for each row execute function public.set_updated_at();

create trigger log_entries_skip_stale_update
  before update on public.log_entries
  for each row execute function public.skip_stale_update();

alter table public.log_entries enable row level security;

create policy "Owners read their log entries"
  on public.log_entries for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners create their log entries"
  on public.log_entries for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Owners update their log entries"
  on public.log_entries for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Rows are soft deleted through deleted_at. Account deletion (phase 6) removes them.
revoke all on public.log_entries from anon;
revoke delete, truncate on public.log_entries from authenticated;
