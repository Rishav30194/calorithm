-- Shared trigger functions for every synced table. See docs/architecture.md, "Sync".

-- Stamps server time on every write. Pulls page through rows by this column.
-- now() is the transaction's start time, which is why pulls overlap by one minute.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Keeps the most recent edit. An upsert from a device that was offline carries an older
-- client_updated_at; returning null skips the update and keeps the stored row.
create function public.skip_stale_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.client_updated_at < old.client_updated_at then
    return null;
  end if;
  return new;
end;
$$;
