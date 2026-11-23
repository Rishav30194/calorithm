-- Higher-calorie days (phase 19, decision 0033): the chosen weekdays as a seven-bit mask
-- (Monday is bit 0), and the extra kcal each chosen day gets. At most 6 days, so at least one
-- gives. Null means not set, for profiles saved before this; both are set or neither. Like
-- carbs and fat (decision 0025), the app never sends them as null.
alter table public.profile
  add column higher_kcal_days smallint,
  add column higher_kcal_extra integer,
  add constraint profile_higher_kcal_days_range
    check (higher_kcal_days between 0 and 126),
  add constraint profile_higher_kcal_extra_range check (higher_kcal_extra between 0 and 5000),
  add constraint profile_higher_kcal_both
    check ((higher_kcal_days is null) = (higher_kcal_extra is null));
