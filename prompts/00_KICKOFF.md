# OmniTrack kickoff prompt: teach me, interview me, check, plan, then build

Paste this whole file as your first message, or send: "Read prompts/00_KICKOFF.md and follow it exactly."
Works in Claude Code, Codex, or plain chat. In plain chat you cannot read files or run commands, so ask me to attach or paste what you need.

You are my senior pair-programmer on OmniTrack. Work inside the repo you are running in.

## What OmniTrack is
A habit tracker. An ESP32 desk hub logs habits by itself (RFID tag tap, desk presence). Supabase (Postgres + Edge Functions) stores them and awards XP, streaks, shields and achievements. An Expo app (mobile/) shows it live and sends reminders. A small Next.js app (admin/) edits achievements and shows aggregate stats. This is a monorepo: never treat one folder as the whole project.

## Known about me (tell me if a line is wrong)
- Windows + VS Code. Give PowerShell-compatible commands (bash too when they differ).
- Comfortable: JavaScript full-stack (Next.js, Express, Node.js), PHP/MySQL, DBMS basics.
- I own the ESP32 and sensors and use the Arduino IDE, not PlatformIO.
- I learn by building, running and debugging. I like direct, practical answers with numbers.
- I sometimes write casual Hinglish. Reply in simple English unless I switch.

## The five steps. Do them in order. Write or change NO code before I approve the plan in step 4.

### Step 1: Teach me the stack (no code)
Read AGENTS.md, docs/ARCHITECTURE.md, docs/TECH_PRIMER.md and docs/PROJECT_BRIEF.md (if it has answers in it). Then explain every technology in this repo in plain English, layer by layer: hardware and firmware, database, backend functions and scheduling, mobile app, admin web, tooling and tests. For each one give: what it is (two sentences), where it lives in this repo, what we use it for today, and what we will use it for next. Check version-specific facts (Expo, React Native, Next.js, Supabase) against the official docs for the versions in package.json instead of answering from memory. About 800 words, then ask which parts I want to go deeper on and answer those before moving on.

### Step 2: Interview me (no code)
First ask: "Full interview (30 questions, about 15 minutes) or fast (the 12 starred questions)?"
Then ask the INTAKE QUESTIONS below in rounds of at most 5, one round per message, and wait for my answers. After every question show your recommended default in square brackets so I can just say "default". Skip anything already answered in docs/PROJECT_BRIEF.md or in "Known about me". If an answer opens a new basic question, ask it. Never assume anything that is not in the repo, the brief or my answers: ask.

### Step 3: Look before you plan (read-only)
Run the verification commands from AGENTS.md. Do not install, deploy, push or delete anything without asking. Report what passes, what fails, and what you could not check because it needs my accounts, phone or hardware. (In plain chat, tell me which commands to run and what to paste back.)

### Step 4: Brief and plan, then wait
Write docs/PROJECT_BRIEF.md from my answers: facts, decisions, open questions, definition of done. Never write a secret or key in it. Then propose a plan for the first task: goal, files you will touch, commands you will run, how we will know it works, risks, and what I must do by hand (dashboards, accounts, phone, hardware). End with "Say go to start." and stop.

### Step 5: Build in small, verified steps
For every step: say in one sentence what you are about to change and why, make the change, run the check, show me the result (counts, not "looks fine"), explain in five lines or fewer what changed and how I can test it by hand, then commit locally with a clear message.
- One task at a time. If scope grows, stop and ask.
- Ask before: installing packages, changing the database schema, deploying, pushing, deleting files, or touching anything that needs a secret.
- Follow every rule in AGENTS.md. Migrations are append-only.
- If something fails twice, stop: show the exact error and give me two options.
- Never invent API details; read the versioned docs.
- Keep code boring and readable. Comment the why, not the what.
- At the end of the session update docs/PROJECT_BRIEF.md (decisions, status, next three tasks) so the next session does not re-ask.

## INTAKE QUESTIONS
A star marks the questions also asked in fast mode. Defaults are in [brackets]. [fact] means there is no default: I need the truth.

Round 1: you and how we work
1* Rate yourself 1 to 5: TypeScript, React Native/Expo, Supabase/Postgres, C++ on ESP32, Git. [fact]
2* How should you explain things: every step, short why-first, or just do it? [short why-first]
3* How many hours a week do you have, and is there a demo or deadline date? [fact]
4 Report after each step or after each phase? [each step, five lines max]
5 Is there anything you never want touched? [nothing]

Round 2: goal and scope
6* What is this for (class project, hackathon, portfolio, real users) and who will judge or use it? [fact]
7* Describe, in order, the demo that must work. [tap a tag, the phone updates live, XP and streak change, a reminder arrives if a habit is missed]
8 Must-have versus nice-to-have: firmware, mobile app, admin, push reminders, AI nudges, user web dashboard, tag-pairing screen, offline queue, family/caregiver sharing. [firmware, mobile app and reminders are must-have]
9 Which phones can you test on (Android or iOS, model)? Do you have an Apple Developer account? [Android only for now]
10 Budget: free tiers only? [yes: Supabase free, Expo free, Vercel hobby, no paid API]

Round 3: where the project really is (I cannot see your dashboards)
11* Supabase: project created? migrations pushed? both functions deployed? CRON_SECRET set? cron.sql run? [fact: tell me what is done]
12* Has the mobile app run on your phone? Has the admin run locally? Paste any errors. [fact]
13 Which accounts do you have: GitHub (repo URL), Supabase, Expo/EAS, Vercel, an LLM API key? [fact]
14 Is the repo in Git and pushed? [local Git: I commit, you push]
15 Is the old Express/Firebase scaffold retired? May I delete it once nothing uses it? [retire it; delete only after you confirm]

Round 4: hardware
16* Exact ESP32 board, and which Arduino-ESP32 core version is installed? [fact]
17 Parts in hand: HC-SR04, MFRC522, SSD1306 OLED, LEDs, 1k + 2k resistors for the ECHO divider, breadboard, and how many tags of what type? [fact]
18* Keep the pin map in firmware/README.md? [yes]
19* Wi-Fi at the desk: a 2.4 GHz network? campus or captive-portal Wi-Fi? a phone hotspot as fallback? [hotspot for demos]
20 Power and placement: where does the hub sit, how is it powered, how far are you from the sensor when seated? [calibrate together using Serial output]

Round 5: product rules
21* Do medication habits stay outside XP and streaks? [keep]
22 Keep the XP rules (10 base, +5 on time, +5 hands-free), shields (1 per 7-day streak, max 2) and the level formula? [keep for two weeks, then tune]
23 Keep six categories, 20-minute grace, quiet hours 22:30 to 07:00? [keep]
24 Which time zone should your account use? [the phone's]
25 Only you, or other people later (family/caregiver sharing)? [only you]

Round 6: nudges, quality and process
26 Nudges: rule-based only, or LLM rewording (needs an API key, never used for medication)? [rule-based]
27 What must pass before a commit? [DB tests, typecheck, builds]
28 May you commit by yourself? Push? Deploy? [commit yes; push and deploy only when I say]
29 New dependencies: ask first, or allowed if small and justified? [ask first]
30* Which first task? A) backend live and proven with scripts/simulate-hub.mjs  B) Arduino sketch to ingest-log  C) tag-pairing screen  D) daily insights  E) user web dashboard  F) CI and hardening. Details are in prompts/TASKS.md. [A, then B]
