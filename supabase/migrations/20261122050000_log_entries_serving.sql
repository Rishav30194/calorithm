-- The food's serving when an entry was logged (phase 14), so its servings can be shown and
-- edited as grams or ml even after the food changes. Same ranges as foods. Null for recipes
-- and for entries logged before this; both are set or neither. Like carbs and fat (decision
-- 0025), the app never sends them as null.
alter table public.log_entries
  add column serving_size numeric(7, 2),
  add column serving_unit text,
  add constraint log_entries_serving_size_range check (serving_size > 0 and serving_size <= 10000),
  add constraint log_entries_serving_unit_length
    check (char_length(btrim(serving_unit)) between 1 and 20),
  add constraint log_entries_serving_both check ((serving_size is null) = (serving_unit is null));
