-- A food copied from the built-in list keeps that item's id (phase 10, decision 0027), so the
-- app can name its source and not offer the same item twice. Nullable: foods typed in, or
-- saved before this, have none. Like carbs and fat (decision 0025), the app never sends it as
-- null, so a device that hasn't set it can't clear it.
alter table public.foods
  add column catalog_id text,
  add constraint foods_catalog_id_length check (char_length(catalog_id) between 1 and 60);
