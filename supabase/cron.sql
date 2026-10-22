-- Run ONCE in the SQL editor, after: (1) deploying send-nudges, (2) setting the CRON_SECRET function secret.
-- Needs the pg_cron and pg_net extensions (Dashboard > Database > Extensions).

-- 1) keep the URL + secret in Vault, not in the cron command
select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'omnitrack_project_url');
select vault.create_secret('SAME-VALUE-AS-CRON_SECRET',            'omnitrack_cron_secret');

-- 2) every 15 minutes
select cron.schedule(
  'omnitrack-send-nudges',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'omnitrack_project_url')
               || '/functions/v1/send-nudges',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'omnitrack_cron_secret')),
    body    := '{}'::jsonb
  );
  $$
);

-- To stop:  select cron.unschedule('omnitrack-send-nudges');
