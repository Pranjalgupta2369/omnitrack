# Task prompts for further programming

How to use: start a session and run prompts/00_KICKOFF.md once (steps 1 to 4). Then pick a task below, or fill in the template. The agent still shows a plan and waits for "go".

## Template
```
Goal: <one sentence outcome>
Context: <files, docs, what already exists>
Constraints: <rules, what NOT to touch>
Done when: <commands that pass + what I can see by hand>
Before coding: ask me anything missing, show the plan, wait for "go".
```

## A. Backend live and proven (do this first)
Goal: the Supabase project is live and one fake RFID tap travels the whole chain.
Context: supabase/ (migrations, functions, cron.sql), scripts/simulate-hub.mjs, the first-run steps in README.md. Dashboard steps and accounts are mine: guide me one step at a time and ask me to paste outputs.
Constraints: do not deploy or run `db push` yourself unless I say so. No secret key in any client or committed file.
Done when: `node scripts/simulate-hub.mjs rfid <tag>` returns `logged: true` with an `xp` value; the Today screen updates within a few seconds without a manual refresh; `select * from cron.job` shows omnitrack-send-nudges; searching mobile/ and admin/ for the secret key finds nothing; docs/PROJECT_BRIEF.md is updated.

## B. Arduino sketch for the hub
Goal: an ESP32 sketch that logs RFID taps and sustained desk presence to ingest-log, shows XP and streak on the OLED, and survives Wi-Fi loss.
Context: docs/ARCHITECTURE.md (hub contract and status-code table), firmware/README.md (pins and a minimal POST). Arduino IDE, not PlatformIO. Libraries: MFRC522, Adafruit SSD1306 + GFX, Preferences. Board and parts as in docs/PROJECT_BRIEF.md.
Constraints: sketch folder firmware/OmniTrackHub/ with one .cpp/.h pair per subsystem. Secrets live in a git-ignored secrets.h with a committed secrets.example.h. `setInsecure()` only behind a DEV flag. Follow the status-code table exactly. Calibrate the presence threshold from real Serial readings, never guess it.
Done when: it compiles for my board (arduino-cli if installed, otherwise I compile and paste the result); a tag tap updates the app; an unknown tag shows "Unknown tag"; with Wi-Fi off, two taps, then Wi-Fi back on gives exactly one XP award per habit per day and no duplicates; 401, 404 and 422 responses drop the event and show a message.

## C. Tag pairing
Goal: tapping an unknown tag lets me assign it to a habit from the app.
Context: ingest_device_event returns unknown_tag today; habits.tag_uid is unique per user among active habits.
Constraints: new append-only migration with a `tag_scans` table (user_id, device_id, tag_uid, seen_at; RLS: select own, insert only through the ingest function); keep the function contract backward compatible; add RLS tests; app screen under Habits showing recent unknown tags.
Done when: DB tests pass including the new ones; an unknown tap appears in the app within seconds; assigning it makes the next tap log; another user cannot see my scans.

## D. Daily insights
Goal: a "Daily insight" card in the Progress tab: two or three sentences of advice grounded in the user's real numbers.
Context: stats come first, the model second. my_week() and my_stats() exist; send-nudges already has an optional LLM hook.
Constraints: compute the stats in SQL and send the model only those numbers. No medical or psychological advice and no guessing why someone is inconsistent. For medication habits comment only on logging consistency. The API key lives only in function secrets. Cache one insight per user per day in a new table with RLS.
Done when: the stats query has tests; one insight per user per day; the card shows the cached text; the fallback text works with no API key.

## E. User-facing web dashboard
Goal: a signed-in web dashboard for the user (not admin): Today, week chart, habits, live updates.
Context: admin/ shows the Next 16 + @supabase/ssr setup; mobile/ shows which RPCs to call. Look: dark, cyan = a sensor did it, indigo = a person did it.
Constraints: separate route group from admin; reuse the existing RPCs; Realtime subscription in a client component; no secret key; read admin/AGENTS.md and the bundled Next docs first.
Done when: `npm run typecheck` and `npx next build` pass; sign-in works; logging with simulate-hub updates the page live; another account sees nothing of mine.

## F. CI and hardening
Goal: every push is checked automatically and ingest-log cannot be hammered.
Context: the verification commands in AGENTS.md; the GitHub repo.
Constraints: GitHub Actions only; the checks need no secrets; agree the rate-limit design with me first (per-device counter table versus a platform feature); migrations append-only.
Done when: CI is green on a pull request (DB tests, mobile typecheck, admin typecheck + build); a test shows the request over the limit from one device is rejected with 429.

## Later (ask before starting any of these)
Family/caregiver sharing with consent (new RLS policies), firmware over-the-air updates, app-store release, translations, data export and delete.
