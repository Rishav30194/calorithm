-- Each entry keeps the per-serving values it was logged with, so changing its servings
-- later rescales exactly. Rescaling from the stored totals, which are rounded, drifts badly
-- for small servings (0.1 serving of a 7 kcal food stores 1 kcal, which rescales to 10 kcal
-- a serving). Three decimals hold a recipe's per-serving share closely enough.
alter table public.log_entries
  add column kcal_per_serving numeric(9, 3),
  add column protein_g_per_serving numeric(8, 3);

-- Rows written before this migration: the best available values are the totals' ratio.
update public.log_entries
set kcal_per_serving = round(kcal / servings, 3),
    protein_g_per_serving = round(protein_g / servings, 3);

alter table public.log_entries
  alter column kcal_per_serving set not null,
  alter column protein_g_per_serving set not null,
  add constraint log_entries_kcal_per_serving_range
    check (kcal_per_serving between 0 and 100000),
  add constraint log_entries_protein_per_serving_range
    check (protein_g_per_serving between 0 and 10000);
