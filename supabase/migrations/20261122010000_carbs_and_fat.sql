-- Carbs and fat beside kcal and protein (phase 8, decision 0025). Nullable for good: rows saved
-- before this have no values, and 0 would be a false one; a later app version requires both
-- when it saves a food. Same precision and ranges as protein. The app never sends null for
-- them, and an upsert that leaves a column out keeps its stored value, so a device that hasn't
-- set them can't clear them.

alter table public.foods
  add column carbs_g numeric(6, 1),
  add column fat_g numeric(6, 1),
  add constraint foods_carbs_range check (carbs_g between 0 and 1000),
  add constraint foods_fat_range check (fat_g between 0 and 1000);

alter table public.log_entries
  add column carbs_g numeric(7, 1),
  add column fat_g numeric(7, 1),
  add column carbs_g_per_serving numeric(8, 3),
  add column fat_g_per_serving numeric(8, 3),
  add constraint log_entries_carbs_range check (carbs_g between 0 and 10000),
  add constraint log_entries_fat_range check (fat_g between 0 and 10000),
  add constraint log_entries_carbs_per_serving_range check (carbs_g_per_serving between 0 and 10000),
  add constraint log_entries_fat_per_serving_range check (fat_g_per_serving between 0 and 10000);
