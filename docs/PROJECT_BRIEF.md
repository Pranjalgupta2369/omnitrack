# Project brief (the agent fills this in during the kickoff interview and updates it after every session)
Last updated: 2026-10-29, Codex

Never write a secret or key in this file.

## About the developer
Skills 1 to 5 (TypeScript, React Native/Expo, Supabase/Postgres, C++ on ESP32, Git):
Explanation style:
Hours per week / deadline:
Reporting style:
Never touch:

## Goal and demo
Purpose and audience:
Demo script, in order:
Must-have:
Nice-to-have:

## Environment and accounts
OS and editor: Windows, VS Code
Phones (and Apple Developer account yes/no):
Supabase project ref:
Accounts (yes/no only): GitHub / Expo / Vercel / LLM key
Git status:

## Hardware
Board and Arduino-ESP32 core version:
Parts in hand:
Pin map: see firmware/README.md (changes noted here)
Wi-Fi at the desk:
Power and placement:

## Decisions
- Express/Firebase scaffold retired: unchanged; no decision recorded in this session.
- Medication outside XP and streaks: preserved; medication logging/reminders remain safety-neutral and factual.
- XP, shield and level numbers: existing SQL rules remain the source of truth; no client-side gamification writes added.
- Categories, grace, quiet hours: existing settings retained; no new product defaults selected.
- Time zone: new profiles default to Asia/Kolkata; existing profile time zones are unchanged.
- Users (just me / family later): not confirmed.
- Nudges (rule-based / LLM): deterministic, category-specific reminder copy; no LLM rewording.
- Checks before a commit: DB tests, mobile typecheck/export, admin typecheck/build.
- May commit / push / deploy: no; none performed.
- New dependencies policy: no new mobile dependency; admin Next.js upgraded to 16.4.1 with user approval.

## Status
Done: Added NLP habit quick-add, data-grounded behavioral coaching, context-aware factual reminders, medication-safe logging, admin companion and hub simulator routes, Asia/Kolkata default timezone for new profiles, distinct Supabase-backed mobile/web login and registration, companion starter chips/status groups/safety confirmation, hub registration + virtual OLED feedback, and Fogg B=MAP context with measured prompt/effort signals. Upgraded admin Next.js to 16.4.1.
In progress: Live authenticated Supabase, email confirmation, realtime, push delivery, and physical hub behavior still need an owner-run demo. The Fogg coach is deterministic and explicitly avoids guessing motivation or claiming psychological automaticity.
Blocked: No known code blocker. Supabase account/hardware details and user-specific profile defaults remain unconfirmed.

## Next three tasks
1. Confirm Supabase Auth email/password and confirmation settings, then test real registration/sign-in and admin role separation.
2. Run the local admin/mobile demo against Supabase and verify realtime, actual ingest responses, and reward triggers.
3. Exercise the new in-app hub registration and simulator with a test hub; review mobile lint tooling/dependency audit separately.

## Open questions
Supabase Auth email-confirmation settings, project redirect URL, and physical hub availability were not validated during this session. No schema migration was needed for signup or hub registration; existing auth and register_device functions handle those paths. Checks this session: 18/18 database tests, both TypeScript checks, Next build, Android Expo export. Mobile lint could not run because Expo attempted to install absent ESLint packages and the write failed with EPERM; no package changes were made. Mobile dependency audit previously reported 10 findings (6 moderate, 4 high); no broad remediation was applied.
