-- Settings every client reads before syncing. Only migrations change them.
create table public.app_config (
  id smallint primary key default 1,
  min_app_version text not null,
  updated_at timestamptz not null default now(),
  constraint app_config_single_row check (id = 1),
  constraint app_config_min_app_version_semver check (min_app_version ~ '^\d+\.\d+\.\d+$')
);

comment on table public.app_config is
  'One row. min_app_version: clients below it stop syncing and must update.';

alter table public.app_config enable row level security;

-- Readable before sign-in, so an outdated app can say so on the sign-in screen.
create policy "Anyone can read the app config"
  on public.app_config for select
  to anon, authenticated
  using (true);

revoke insert, update, delete, truncate on public.app_config from anon, authenticated;

insert into public.app_config (min_app_version) values ('0.0.0');
