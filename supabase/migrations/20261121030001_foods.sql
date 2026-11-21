-- Foods the user enters, with kcal and protein per serving. Archived foods stay on past
-- log entries and recipes but leave the pickers.
create table public.foods (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  name text not null,
  serving_size numeric(7, 2) not null,
  serving_unit text not null,
  kcal integer not null,
  protein_g numeric(6, 1) not null,
  archived_at timestamptz,

  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null,
  deleted_at timestamptz,
  schema_version smallint not null,

  -- Lets other tables reference a food together with its owner; see recipe_items.
  constraint foods_id_user_id_key unique (id, user_id),
  constraint foods_name_length check (char_length(btrim(name)) between 1 and 100),
  constraint foods_serving_size_range check (serving_size > 0 and serving_size <= 10000),
  constraint foods_serving_unit_length check (char_length(btrim(serving_unit)) between 1 and 20),
  constraint foods_kcal_range check (kcal between 0 and 10000),
  constraint foods_protein_range check (protein_g between 0 and 1000),
  constraint foods_schema_version_positive check (schema_version > 0)
);

create index foods_pull_idx on public.foods (user_id, updated_at, id);

create trigger foods_set_updated_at
  before insert or update on public.foods
  for each row execute function public.set_updated_at();

create trigger foods_skip_stale_update
  before update on public.foods
  for each row execute function public.skip_stale_update();

alter table public.foods enable row level security;

create policy "Owners read their foods"
  on public.foods for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners create their foods"
  on public.foods for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Owners update their foods"
  on public.foods for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Rows are soft deleted through deleted_at. Account deletion (phase 6) removes them.
revoke all on public.foods from anon;
revoke delete, truncate on public.foods from authenticated;
