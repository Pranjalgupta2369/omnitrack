# OmniTrack technology primer: what each piece is and where it goes next

Every row says what the technology is, where it lives in this repo, what we use it for today, and what we will use it for next.
Versions in the repo today: Expo SDK 57, React Native 0.86, React 19, Next.js 16.4, supabase-js 2.x, TypeScript 5 to 6.

## One tap, end to end
1. You tap an RFID tag. The MFRC522 reader gives the tag's UID to the ESP32 over SPI.
2. The ESP32 sends an HTTPS POST: device ID, tag UID, a unique event ID, and a secret device key in a header.
3. A Supabase Edge Function (TypeScript on Deno) checks the JSON, hashes the key with SHA-256 and calls one Postgres function using the secret key.
4. That function checks the device and key hash, maps the tag to a habit and inserts a row in `logs`. A repeated event ID is ignored, so retries are safe.
5. Database triggers stamp the user's local date, award XP (once per habit per day), update the streak and shields, and check achievements.
6. Supabase Realtime pushes the changed rows to the phone, filtered by Row Level Security so you only receive your own.
7. The Expo app re-reads `my_today()` and `my_stats()` and animates the ring, XP bar and streak.
8. The Edge Function replies with xp, streak and level, which the ESP32 can show on its OLED.
9. Every 15 minutes pg_cron calls `send-nudges`. If a habit's window closed with nothing logged, it stores a nudge and sends a push through Expo's push service.
10. In the Next.js admin, an admin edits achievements (rows in a table). The database applies them on the next log, or at once on "Re-check all users".

## 1. Hardware and firmware (`firmware/`)
| Technology | What it is | Today | Next |
|---|---|---|---|
| ESP32 | A Wi-Fi and Bluetooth microcontroller (240 MHz dual core, 3.3 V logic): the hub's brain | Reads sensors, calls `ingest-log` | Offline queue in flash, NTP clock, over-the-air updates, deep sleep, more hubs |
| Arduino IDE + Arduino-ESP32 core | C++ with Arduino's simple API, compiled and flashed from the IDE | Writing and uploading the sketch | `arduino-cli` so CI can compile-check the sketch |
| MFRC522 RFID reader (SPI, 13.56 MHz) | Reads the unique ID (UID) of a tag held near it | Tap-to-log: tag UID maps to a habit | In-app tag pairing, several tags per habit |
| HC-SR04 ultrasonic sensor | Measures distance from the echo time of a sound pulse | Presence at the desk | Sustained-presence state machine, smoothing, calibration |
| SSD1306 OLED (I2C) + LEDs | A tiny screen and lights for instant feedback | Status messages | Show XP, streak and level from the server's reply |
| HTTPS/TLS + JSON | The secure web protocol and data format between hub and cloud | One POST per event | Pin the Supabase root certificate (the dev sketch uses `setInsecure()`) |

## 2. Database and access control (`supabase/migrations/`)
| Technology | What it is | Today | Next |
|---|---|---|---|
| PostgreSQL | The relational database: tables, constraints, indexes | All data: users, habits, logs, XP, nudges | Analytics views, data export and delete, log retention and partitioning when data grows |
| PL/pgSQL triggers and functions | Code that runs inside the database when rows change | XP, streaks, shields, achievements, hub ingestion, nudge selection | Weekly summaries and insight roll-ups. New rules go here, with tests |
| Row Level Security + column GRANTs | Per-row and per-column permissions enforced by Postgres itself | Each user sees only their rows; clients cannot write XP | Caregiver/family sharing with consent (new policies + tests) |
| Supabase Auth | Sign-up and sign-in; issues a signed token (JWT); `auth.uid()` identifies the user inside SQL | Email + password | Google/Apple sign-in, password reset, optional MFA |
| PostgREST + supabase-js | Turns tables and SQL functions into an API your apps call with `.from()` and `.rpc()` | App and admin read and write through it | `supabase gen types` to replace hand-written TypeScript types |
| Realtime | Streams row changes to subscribed clients (RLS applies) | Live Today screen | Live hub status with Broadcast/Presence |

## 3. Backend functions and scheduling (`supabase/functions/`, `supabase/cron.sql`)
| Technology | What it is | Today | Next |
|---|---|---|---|
| Edge Functions (TypeScript on Deno) | Small serverless HTTP functions next to the database | `ingest-log` (hub to DB) and `send-nudges` | Rate limiting, firmware-update manifest, weekly report, LLM insights |
| pg_cron + pg_net + Vault | A scheduler inside Postgres, HTTP calls from SQL, and encrypted secret storage | Calls `send-nudges` every 15 minutes | Daily and weekly roll-ups, cleanup jobs |
| Supabase CLI + migrations | A command-line tool that versions the schema as SQL files and deploys functions | `db push`, `functions deploy`, `secrets set` | CI deploys, a separate staging project |
| Expo Push Service | Expo's HTTP API that delivers notifications through Google and Apple | Missed-window reminders | Action buttons, delivery receipts |
| Optional LLM API | A language model that can reword text | Off by default; rewords nudges, never for medication | Grounded daily insights built from your real numbers, with guardrails |

## 4. Mobile app (`mobile/`)
| Technology | What it is | Today | Next |
|---|---|---|---|
| React Native + Expo SDK 57 | JavaScript/TypeScript that renders real native screens; Expo adds tooling, device APIs and builds | The whole phone app | EAS Update for instant JS updates, home-screen widget, store release |
| TypeScript | JavaScript with types, so mistakes show up before you run | All app code | Generated database types |
| expo-router | Screens are files; folders become routes; `(tabs)` and `(auth)` are groups | Login gate and four tabs | Deep links from notifications |
| Animated + react-native-svg | Built-in animation plus vector drawing | Progress ring, XP bar, XP toast | Reanimated or Skia for richer charts, a level-up effect |
| AsyncStorage | Phone-local key-value storage | Keeps you signed in | Offline cache of the last dashboard |
| expo-notifications, expo-device, expo-constants | Push permission, token and device checks | `registerForPush()` | Tap a reminder to open that habit |
| EAS Build | Expo's cloud builder for installable apps | Needed for Android push (Expo Go cannot) | Store builds and submission |
| Metro + Hermes | The bundler and the JavaScript engine | Compile and run | n/a |

## 5. Admin web (`admin/`)
| Technology | What it is | Today | Next |
|---|---|---|---|
| Next.js 16 (App Router) + React 19 | React framework with server-rendered pages, Server Components and Server Actions | Login, overview, achievements editor | A user-facing web dashboard, deploy to Vercel |
| @supabase/ssr | Cookie-based Supabase auth for server-rendered apps | `proxy.ts` refreshes the session; pages act as the signed-in admin | The same for the user dashboard |
| Next 16 Cache Components rules | Pages that read cookies cannot be prerendered; we opt out with `instant = false` | Per-user pages | Restructure with Suspense |

## 6. Tooling and quality
| Technology | What it is | Today | Next |
|---|---|---|---|
| PGlite + `node --test` | Real Postgres compiled to WebAssembly, in memory | 17 tests run the actual migrations | A test for every new table and rule, RLS tests |
| tsc, `next build`, `expo export` | Type check, production build, bundle check | "Does it compile" checks | GitHub Actions CI |
| Git + GitHub | Version control | Local commits | Pull requests, CI, releases |
| Codex, Claude Code + AGENTS.md / CLAUDE.md | AI coding agents and the rule files they read | Building the project | The kickoff prompt: teach, interview, check, plan, build |
| VS Code, PowerShell | Your editor and shell | Daily work | n/a |

## Rules of thumb
- The secret key lives only in Edge Function secrets. Apps use the publishable key. `.env` files are never committed.
- Time zones are handled in SQL (`profiles.timezone`, `logs.local_date`), never in app code.
- Migrations are append-only. Every new table gets RLS and explicit grants; every new function gets an explicit revoke and grant.
- The ESP32 only joins 2.4 GHz Wi-Fi, uses 3.3 V logic (ECHO goes through a divider; the RC522 runs at 3.3 V).
- Expo Go cannot do Android push; use a development build.
- `setInsecure()` is for development only.
