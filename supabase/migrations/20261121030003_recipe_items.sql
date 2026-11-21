-- The foods in a recipe and how many servings of each.
create table public.recipe_items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  recipe_id uuid not null,
  food_id uuid not null,
  servings numeric(7, 2) not null,

  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null,
  deleted_at timestamptz,
  schema_version smallint not null,

  -- Foreign keys skip row-level security, so each one includes user_id: a row can only point
  -- at the same user's recipe and food, never at another user's by id.
  constraint recipe_items_recipe_fkey
    foreign key (recipe_id, user_id) references public.recipes (id, user_id),
  constraint recipe_items_food_fkey
    foreign key (food_id, user_id) references public.foods (id, user_id),
  constraint recipe_items_servings_range check (servings > 0 and servings <= 1000),
  constraint recipe_items_schema_version_positive check (schema_version > 0)
);

create index recipe_items_recipe_idx on public.recipe_items (recipe_id);
create index recipe_items_food_idx on public.recipe_items (food_id);

create index recipe_items_pull_idx on public.recipe_items (user_id, updated_at, id);

create trigger recipe_items_set_updated_at
  before insert or update on public.recipe_items
  for each row execute function public.set_updated_at();

create trigger recipe_items_skip_stale_update
  before update on public.recipe_items
  for each row execute function public.skip_stale_update();

alter table public.recipe_items enable row level security;

create policy "Owners read their recipe items"
  on public.recipe_items for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners create their recipe items"
  on public.recipe_items for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Owners update their recipe items"
  on public.recipe_items for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Rows are soft deleted through deleted_at. Account deletion (phase 6) removes them.
revoke all on public.recipe_items from anon;
revoke delete, truncate on public.recipe_items from authenticated;
