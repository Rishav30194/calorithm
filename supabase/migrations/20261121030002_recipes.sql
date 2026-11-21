-- A recipe's name and how many servings it makes. Its totals come from recipe_items.
create table public.recipes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  name text not null,
  servings numeric(6, 2) not null,
  archived_at timestamptz,

  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null,
  deleted_at timestamptz,
  schema_version smallint not null,

  constraint recipes_id_user_id_key unique (id, user_id),
  constraint recipes_name_length check (char_length(btrim(name)) between 1 and 100),
  constraint recipes_servings_range check (servings > 0 and servings <= 1000),
  constraint recipes_schema_version_positive check (schema_version > 0)
);

create index recipes_pull_idx on public.recipes (user_id, updated_at, id);

create trigger recipes_set_updated_at
  before insert or update on public.recipes
  for each row execute function public.set_updated_at();

create trigger recipes_skip_stale_update
  before update on public.recipes
  for each row execute function public.skip_stale_update();

alter table public.recipes enable row level security;

create policy "Owners read their recipes"
  on public.recipes for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners create their recipes"
  on public.recipes for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Owners update their recipes"
  on public.recipes for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Rows are soft deleted through deleted_at. Account deletion (phase 6) removes them.
revoke all on public.recipes from anon;
revoke delete, truncate on public.recipes from authenticated;
