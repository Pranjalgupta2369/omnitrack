# OmniTrack v2: architecture reference

```
 ESP32 hub ──HTTPS + x-device-key──▶ Edge Function ingest-log ──▶ Postgres (RLS on)
 (RFID, ultrasonic, OLED)                                         ├─ logs  ──trigger──▶ xp_events, user_stats, user_achievements
                                                                  ├─ habits, devices, nudges, push_tokens
                                                                  └─ my_today() / my_stats() / my_week()  (RPC for the apps)
                                                                         │ Realtime (RLS-filtered)
                          Expo app (iOS/Android) ◀────────────────────────┤
                          Next.js admin ◀──── admin_overview(), achievements table
 pg_cron (15 min) ──▶ Edge Function send-nudges ──▶ due_nudges() ──▶ Expo Push ──▶ phone
```

## Gamification rules (all enforced in `logs_after_insert`)
| Rule | Value |
|---|---|
| XP per habit per local day | 10 base, +5 if logged inside the habit's window, +5 if logged hands-free (RFID / presence) = 10 to 20 |
| Repeat logs the same day | recorded, but earn nothing (unique index on `xp_events`) |
| Level | `floor(sqrt(total_xp / 25)) + 1` (level n starts at 25·(n-1)² XP: 25, 100, 225, 400 ...) |
| Daily streak | any gamified completion keeps the local day alive |
| Streak shield | +1 on every 7th streak day, max 2. One shield forgives one fully missed day |
| Late or backfilled hub events | stored and rewarded, but never change the streak. Events older than 7 days are rejected |
| Manual logs | always stamped "now" by the database (no backfilling XP) |
| Medication habits | tracked and reminded, never gamified (trigger forces `gamified = false`) |
| Achievements | rows in `achievements` (metric + threshold + XP reward); evaluated after every log; admin-editable |

## Hub contract: `POST {SUPABASE_URL}/functions/v1/ingest-log`
Headers: `content-type: application/json`, `x-device-key: <key shown once when the hub was added>`

```json
{ "device_id": "<uuid>", "method": "rfid_tap", "tag_uid": "04A21B7C", "event_id": "boot17-0042", "occurred_at": "2026-10-12T08:31:02Z" }
```
`method` is `rfid_tap` or `ultrasonic_presence`. `tag_uid` is required for `rfid_tap`. `event_id` makes retries idempotent.
`occurred_at` is optional (omit it if the hub has no reliable clock).

| HTTP | Body | Firmware should |
|---|---|---|
| 200 | `{"ok":true,"logged":true,"habit":"Water","xp":20,"total_xp":130,"level":3,"streak":4,"gamified":true}` | show feedback, drop the event |
| 200 | `{"ok":true,"logged":false,"reason":"duplicate" or "no_active_habit"}` | drop the event |
| 400 | `invalid_json`, `invalid_device_id`, `invalid_method`, `tag_uid_required`, `invalid_occurred_at` | drop (bug in firmware) |
| 401 | `unauthorized` | stop retrying; key is wrong or was rotated |
| 404 | `unknown_tag` | show "unknown tag", drop |
| 422 | `event_too_old` | drop |
| 5xx / no network | | keep in the offline queue, retry later |

Presence events: the firmware should emit `ultrasonic_presence` only after sustained presence (for example 20 minutes)
and once per session. The database picks the habit whose weekday + window contains the event time; habits bound to
that hub win over unbound ones.

## RPCs the apps call
`my_today()`, `my_stats()`, `my_week()`, `register_device(label, location)` (returns the raw key once),
`rotate_device_key(device)`, `register_push_token(token, platform)`, `is_admin()`, `admin_overview()`,
`admin_recheck_achievements()`.
Internal, `service_role` only: `ingest_device_event`, `due_nudges`, `check_achievements`, `effective_streak`,
`resolve_presence_habit`.

## Security model
- Every table has RLS; clients read only their own rows. Clients can insert manual logs and edit habits/profile fields;
  nothing else (column-level grants).
- Device keys: 244 random bits, stored as SHA-256 only, never readable by clients, rotatable.
- Edge Functions run with `verify_jwt = false` and authenticate the caller themselves (device key / cron secret).
- The admin app uses the publishable key as the signed-in admin. It sees aggregates only, never another user's habits.
- Realtime: `logs`, `user_stats`, `user_achievements`, `nudges` are published; RLS filters per user.

## Not built yet (on purpose)
In-app tag pairing (scan an unknown tag, assign it to a habit), offline queue inside the app, user-facing web
dashboard, leaderboards, subscriptions, speech/pronunciation scoring, crash reporting, rate limiting on `ingest-log`.
