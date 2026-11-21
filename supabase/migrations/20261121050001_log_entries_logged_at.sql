-- When the entry was first logged, by the device's clock. A meal lists its entries in this
-- order; client_updated_at changes on every edit, so it can't keep the order stable.
alter table public.log_entries add column logged_at timestamptz;

update public.log_entries set logged_at = client_updated_at;

alter table public.log_entries alter column logged_at set not null;
