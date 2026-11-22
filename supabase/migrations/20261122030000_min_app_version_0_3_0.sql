-- Phase 8, release 2 (decision 0025): every device runs 0.3.0 or later (confirmed by the
-- user 2026-11-22), so an older app now stops syncing and asks for the update instead of
-- saving foods without carbs and fat. Columns stay nullable, so no NOT NULL follows.
update public.app_config set min_app_version = '0.3.0';
