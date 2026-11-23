-- Quick add (phase 16): a log entry may have no food or recipe behind it, only its own name
-- and values. It still never has both. Versions before 0.17.0 leave such entries out of the
-- day, so a later migration raises min_app_version once 0.17.0 is live.
alter table public.log_entries
  drop constraint log_entries_one_source,
  add constraint log_entries_at_most_one_source check (num_nonnulls(food_id, recipe_id) <= 1);
