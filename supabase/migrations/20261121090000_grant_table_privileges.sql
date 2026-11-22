-- The hosted project was created without Supabase's automatic grants on new tables, so the
-- earlier migrations, which only revoke, left the Data API roles with nothing to use. Revoke
-- everything first so the result is the same whatever a project's defaults are, then grant
-- only what the app needs. Row-level security still limits each user to their own rows, and
-- deletes are soft (deleted_at), so no role may delete.

-- Read before sign-in, so an outdated app can say so on the sign-in screen.
revoke all on public.app_config from anon, authenticated;
grant select on public.app_config to anon, authenticated;

revoke all on public.profile, public.foods, public.recipes, public.recipe_items, public.days,
  public.log_entries, public.weights, public.checkins
  from anon, authenticated;

grant select, insert, update on public.profile, public.foods, public.recipes,
  public.recipe_items, public.days, public.log_entries, public.weights, public.checkins
  to authenticated;
