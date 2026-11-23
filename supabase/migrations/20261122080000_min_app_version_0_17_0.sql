-- Phase 16, release 2: versions before 0.17.0 leave entries without a food or recipe out of
-- the day, so once 0.17.0 is live on every device (the user applies this then), an older app
-- stops syncing and asks for the update instead of showing short totals beside quick adds.
update public.app_config set min_app_version = '0.17.0';
