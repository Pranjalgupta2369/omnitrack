# OmniTrack: agent instructions

Hybrid IoT + AI habit tracker. ESP32 hub -> Supabase (Postgres, Auth, Edge Functions) -> Expo app + Next.js admin.
Architecture, contracts and the numbers behind the rules: `docs/ARCHITECTURE.md`.

## Session start
New session or new task? Follow `prompts/00_KICKOFF.md` (teach, interview, check, plan, build). If `docs/PROJECT_BRIEF.md` is filled in and current, do not re-ask what it already answers: confirm only what changed, and update it at the end of every session. Task prompts live in `prompts/TASKS.md`.

## Working agreement
Ask before installing packages, changing the schema, deploying, pushing, deleting files, or touching anything that needs a secret. If a step fails twice, stop and show the exact error plus two options. Never invent Expo, Next.js or Supabase API details: read the versioned docs.

## Layout
- `supabase/migrations/`  schema, RLS, XP / streak / achievement triggers (source of truth for all gamification)
- `supabase/functions/`   `ingest-log` (ESP32 -> DB), `send-nudges` (pg_cron -> Expo push)
- `supabase/tests/`       in-memory Postgres tests that run the real migrations
- `mobile/`               Expo SDK 57 + TypeScript (expo-router). Has its own AGENTS.md: follow it for Expo APIs.
- `admin/`                Next.js 16 + TypeScript (achievements editor, aggregate stats)
- `firmware/`             contract + Arduino IDE notes for the ESP32
- `scripts/simulate-hub.mjs`  fake hub for testing without hardware

## Rules that must not be broken
- XP, streaks, shields and achievements are written ONLY by SQL triggers/functions. Never add a client write path to
  `xp_events`, `user_stats` or `user_achievements`.
- The secret key never goes in `mobile/`, `admin/`, or any `EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` variable.
  Clients use the publishable key and Row Level Security.
- Time-zone maths lives in SQL (`profiles.timezone`, `logs.local_date`, `my_today()`, `due_nudges()`).
  Do not re-implement streak or "today" logic in TypeScript.
- Medication habits are never gamified (a trigger enforces it). Do not add XP, streak or loss mechanics to them.
- New table: enable RLS, add policies, grant only the columns clients need.
- New SQL function: `revoke execute ... from public, anon, authenticated`, then grant explicitly (see the end of the
  core migration).
- Migrations are append-only: add a new file, never edit one that has been applied.

## Verify before calling work done
- `supabase/`: `cd supabase/tests && npm install && npm test`
- `mobile/`: `npm run typecheck` (and `npx expo export --platform android` for a bundling check)
- `admin/`: `npm run typecheck && npx next build`
- `firmware/`: say what needs the physical board; the owner flashes and tests it.

## Style
TypeScript strict. Small files. Say why before adding a dependency.
