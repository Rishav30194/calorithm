-- A day's id is a UUID v5 of its owner and date (decision 0018), so two devices marking the
-- same day write one row. Checking it here means a user who learns someone else's user id
-- can't claim that user's day ids first: their own rows must carry their own user_id.
-- The namespace matches DAYS_NAMESPACE in src/data/dayId.ts.
create extension if not exists "uuid-ossp" with schema extensions;

alter table public.days
  add constraint days_id_from_user_and_date check (
    id = extensions.uuid_generate_v5(
      '55e70c90-e7ae-4176-b16f-2c8bfcbdef11',
      user_id::text || '/' || to_char(date, 'YYYY-MM-DD')
    )
  );
