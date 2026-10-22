# OmniTrack v2

ESP32 desk hub -> Supabase -> Expo mobile app + Next.js admin. Habits log themselves (RFID tap, desk presence); the
database awards XP, streaks and achievements; a cron job nudges when a window closes with nothing logged.

```
supabase/   migrations, Edge Functions, cron, in-memory DB tests
mobile/     Expo SDK 57 app            admin/   Next.js 16 admin
firmware/   hub contract + Arduino notes     scripts/   fake hub
docs/ARCHITECTURE.md   rules, numbers, contracts       AGENTS.md   rules for coding agents
```

## First run (about 30 minutes)
1. **Supabase project**: create one at supabase.com. *Settings > API Keys*: copy the **publishable** key. Do not copy
   the secret key anywhere. *Authentication > Providers > Email*: turn off "Confirm email" while developing.
2. **Database**
   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR-PROJECT-REF
   npx supabase db push                # applies supabase/migrations
   ```
3. **Edge Functions**
   ```bash
   npx supabase secrets set CRON_SECRET=pick-a-long-random-string
   npx supabase functions deploy ingest-log
   npx supabase functions deploy send-nudges     # if it asks for Docker, add --use-api
   ```
4. **Nudge schedule** (needs the `pg_cron` and `pg_net` extensions enabled): edit and run `supabase/cron.sql` in the
   SQL editor.
5. **Mobile**: see `mobile/README.md`. **Admin**: see `admin/README.md`.
6. **Test the whole chain without hardware.** In the app: *You > Add hub*, copy the device ID and key, add a habit with an
   RFID tag UID (say `04A21B7C`), then:
   ```bash
   export SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co DEVICE_ID=... DEVICE_KEY=...    # PowerShell: $env:SUPABASE_URL="..."
   node scripts/simulate-hub.mjs rfid 04A21B7C
   ```
   The Today screen updates by itself (Realtime), XP goes up, the ring fills.
7. **Firmware**: `firmware/README.md`.

## Tests
```bash
cd supabase/tests && npm install && npm test     # 17 tests against the real migrations (in-memory Postgres)
cd mobile && npm run typecheck                   # and: npx expo export --platform android
cd admin  && npm run typecheck && npx next build
```
Not covered by any test: the Edge Functions running on Supabase, the cron schedule, push delivery, the apps on a
device or against a live project. Exercise those once yourself (step 6 covers most of the chain).
