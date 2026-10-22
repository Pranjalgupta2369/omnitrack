-- =====================================================================
-- OmniTrack v2 — core schema (Supabase / Postgres)
--
-- Rules this file enforces:
--   * Clients (role `authenticated`) can only read their own rows and make a few narrow writes.
--   * XP, streaks, shields and achievements are written ONLY by triggers / functions below.
--   * ESP32 hubs never hold a user session: they call the `ingest-log` Edge Function with a device
--     key, which calls ingest_device_event() using the secret key.
-- =====================================================================

-- ---------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  display_name    text,
  timezone        text    not null default 'UTC',
  nudge_grace_min integer not null default 20 check (nudge_grace_min between 0 and 240),
  quiet_start     time    not null default '22:30',
  quiet_end       time    not null default '07:00',
  is_admin        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create or replace function public.profiles_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform now() at time zone new.timezone;   -- raises if the IANA zone name is not recognised
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_before_write before insert or update on public.profiles
  for each row execute function public.profiles_before_write();

-- ---------------------------------------------------------------------
-- user_stats: cached gamification totals (written by triggers only)
-- level = floor(sqrt(total_xp / 25)) + 1   ->  XP needed for level n = 25 * (n-1)^2
-- ---------------------------------------------------------------------
create table public.user_stats (
  user_id                uuid primary key references public.profiles (id) on delete cascade,
  total_xp               integer not null default 0 check (total_xp >= 0),
  level                  integer generated always as ((floor(sqrt(total_xp / 25.0)))::integer + 1) stored,
  current_streak         integer not null default 0,
  longest_streak         integer not null default 0,
  last_active_date       date,
  shields                integer not null default 0 check (shields between 0 and 2),
  total_completions      integer not null default 0,
  hands_free_completions integer not null default 0,
  updated_at             timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  insert into public.user_stats (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- devices (ESP32 hubs). Only a SHA-256 of the key is stored.
-- ---------------------------------------------------------------------
create table public.devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  label         text not null check (char_length(label) between 1 and 60),
  location      text,
  api_key_hash  text not null unique,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index devices_user_idx on public.devices (user_id);

-- ---------------------------------------------------------------------
-- habits: data-driven definitions (the "habit engine" — new habit = new row, not new screen)
-- ---------------------------------------------------------------------
create table public.habits (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 80),
  category       text not null default 'custom'
                   check (category in ('medication','exercise','hydration','recovery','focus','custom')),
  logging_method text not null default 'manual' check (logging_method in ('rfid','ultrasonic','manual')),
  tag_uid        text,                                    -- RFID tag UID, uppercase hex, e.g. 04A21B7C
  device_id      uuid references public.devices (id) on delete set null,  -- hub whose presence counts (ultrasonic)
  window_start   time not null default '09:00',
  window_end     time not null default '10:00',
  days           smallint[] not null default '{1,2,3,4,5,6,7}',           -- ISO weekdays, 1 = Monday
  gamified       boolean not null default true,           -- forced false for medication (see trigger)
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (window_end > window_start),
  check (cardinality(days) between 1 and 7 and days <@ array[1,2,3,4,5,6,7]::smallint[])
);
create unique index habits_user_tag_uniq on public.habits (user_id, tag_uid) where tag_uid is not null and active;
create index habits_user_active_idx on public.habits (user_id) where active;

create or replace function public.habits_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.tag_uid is not null then
    new.tag_uid := nullif(upper(regexp_replace(new.tag_uid, '[^0-9A-Fa-f]', '', 'g')), '');
  end if;
  if new.category = 'medication' then
    new.gamified := false;     -- plain tracking only: no XP, no streak pressure around medication
  end if;
  if new.device_id is not null and not exists (
       select 1 from public.devices d where d.id = new.device_id and d.user_id = new.user_id) then
    raise exception 'device does not belong to this user' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger habits_before_write before insert or update on public.habits
  for each row execute function public.habits_before_write();

-- ---------------------------------------------------------------------
-- logs: immutable event log (hub events + manual taps)
-- ---------------------------------------------------------------------
create table public.logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  habit_id    uuid not null references public.habits (id) on delete cascade,
  device_id   uuid references public.devices (id) on delete set null,
  method      text not null check (method in ('rfid_tap','ultrasonic_presence','manual')),
  event_id    text,                                   -- device-generated id -> retries are idempotent
  occurred_at timestamptz not null default now(),
  local_date  date not null,                          -- user-local calendar day, set by trigger
  created_at  timestamptz not null default now(),
  constraint logs_device_event_uniq unique (device_id, event_id)   -- NULLs never collide
);
create index logs_user_date_idx  on public.logs (user_id, local_date desc);
create index logs_habit_date_idx on public.logs (habit_id, local_date desc);

-- ---------------------------------------------------------------------
-- achievements: rule rows an admin can edit without touching app code
-- ---------------------------------------------------------------------
create table public.achievements (
  id          text primary key check (id ~ '^[a-z0-9_]+$'),
  title       text not null,
  description text not null,
  icon        text not null default 'trophy',        -- an Ionicons name
  metric      text not null check (metric in
                ('total_completions','hands_free_completions','current_streak','longest_streak','total_xp')),
  threshold   integer not null check (threshold > 0),
  xp_reward   integer not null default 0 check (xp_reward >= 0),
  sort_order  integer not null default 100,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.user_achievements (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  achievement_id text not null references public.achievements (id) on delete cascade,
  earned_at      timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- ---------------------------------------------------------------------
-- xp_events: append-only XP ledger
-- ---------------------------------------------------------------------
create table public.xp_events (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  habit_id       uuid references public.habits (id) on delete set null,
  log_id         uuid references public.logs (id) on delete set null,
  achievement_id text references public.achievements (id) on delete set null,
  local_date     date not null,
  reason         text not null check (reason in ('log','achievement')),
  amount         integer not null check (amount > 0),
  created_at     timestamptz not null default now()
);
-- XP is awarded once per habit per local day, however many times (or from however many devices) it is logged
create unique index xp_log_once on public.xp_events (user_id, habit_id, local_date) where reason = 'log';

-- ---------------------------------------------------------------------
-- nudges + push tokens
-- ---------------------------------------------------------------------
create table public.nudges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  habit_id   uuid not null references public.habits (id) on delete cascade,
  local_date date not null,
  message    text not null,
  status     text not null default 'pending' check (status in ('pending','sent','acknowledged','dismissed')),
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  unique (habit_id, local_date)
);

create table public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text,
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- Gamification logic (server-side only)
-- =====================================================================

-- Awards achievements whose rule is now satisfied. Loops because an achievement's XP reward can unlock
-- another total_xp achievement.
create or replace function public.check_achievements(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s      public.user_stats;
  a      record;
  v_val  integer;
  v_rows integer;
  v_new  integer;
begin
  loop
    select * into s from public.user_stats where user_id = p_user;
    v_new := 0;
    for a in
      select ac.* from public.achievements ac
       where ac.active
         and not exists (select 1 from public.user_achievements ua
                          where ua.user_id = p_user and ua.achievement_id = ac.id)
    loop
      v_val := case a.metric
        when 'total_completions'      then s.total_completions
        when 'hands_free_completions' then s.hands_free_completions
        when 'current_streak'         then s.current_streak
        when 'longest_streak'         then s.longest_streak
        when 'total_xp'               then s.total_xp
      end;
      if v_val >= a.threshold then
        insert into public.user_achievements (user_id, achievement_id)
        values (p_user, a.id) on conflict do nothing;
        get diagnostics v_rows = row_count;
        if v_rows = 1 then
          v_new := v_new + 1;
          if a.xp_reward > 0 then
            insert into public.xp_events (user_id, achievement_id, local_date, reason, amount)
            values (p_user, a.id, coalesce(s.last_active_date, current_date), 'achievement', a.xp_reward);
            update public.user_stats set total_xp = total_xp + a.xp_reward, updated_at = now()
             where user_id = p_user;
          end if;
        end if;
      end if;
    end loop;
    exit when v_new = 0;
  end loop;
end $$;

-- Validates and normalises every log before it is stored.
create or replace function public.logs_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_tz    text;
begin
  select user_id into v_owner from public.habits where id = new.habit_id;
  if v_owner is null or v_owner <> new.user_id then
    raise exception 'habit does not belong to this user' using errcode = '42501';
  end if;
  if new.device_id is not null and not exists (
       select 1 from public.devices d where d.id = new.device_id and d.user_id = new.user_id) then
    raise exception 'device does not belong to this user' using errcode = '42501';
  end if;

  if new.method = 'manual' then
    new.occurred_at := now();                          -- manual taps are always "now": no XP backfilling
  else
    if new.occurred_at > now() + interval '5 minutes' then new.occurred_at := now(); end if;
    if new.occurred_at < now() - interval '7 days' then
      raise exception 'event too old' using errcode = '22023';
    end if;
  end if;

  select timezone into v_tz from public.profiles where id = new.user_id;
  new.local_date := (new.occurred_at at time zone v_tz)::date;
  return new;
end $$;

-- XP + daily streak + shields + achievements.
--   XP per habit per local day: 10 base, +5 inside the habit's window, +5 if logged hands-free
--   Streak: any gamified completion keeps the day alive. Backfilled (older) events never touch it.
--   Shields: +1 every 7th streak day (max 2). A shield forgives one fully missed day.
create or replace function public.logs_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_habit      public.habits;
  v_prof       public.profiles;
  v_stats      public.user_stats;
  v_hands_free boolean;
  v_on_time    boolean;
  v_amount     integer;
  v_rows       integer;
  v_streak     integer;
  v_shields    integer;
  v_missed     integer;
begin
  select * into v_habit from public.habits where id = new.habit_id;
  if not v_habit.gamified then
    return new;                                        -- tracked, but not gamified (e.g. medication)
  end if;

  select * into v_prof  from public.profiles   where id = new.user_id;
  select * into v_stats from public.user_stats where user_id = new.user_id for update;  -- serialise per user

  v_hands_free := new.method <> 'manual';
  v_on_time    := (new.occurred_at at time zone v_prof.timezone)::time
                  between v_habit.window_start and v_habit.window_end;
  v_amount     := 10 + case when v_on_time then 5 else 0 end + case when v_hands_free then 5 else 0 end;

  insert into public.xp_events (user_id, habit_id, log_id, local_date, reason, amount)
  values (new.user_id, new.habit_id, new.id, new.local_date, 'log', v_amount)
  on conflict (user_id, habit_id, local_date) where reason = 'log' do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 1 then
    update public.user_stats
       set total_xp               = total_xp + v_amount,
           total_completions      = total_completions + 1,
           hands_free_completions = hands_free_completions + case when v_hands_free then 1 else 0 end,
           updated_at             = now()
     where user_id = new.user_id;
  end if;

  if v_stats.last_active_date is null or new.local_date > v_stats.last_active_date then
    v_shields := v_stats.shields;
    if v_stats.last_active_date is null then
      v_streak := 1;
    else
      v_missed := new.local_date - v_stats.last_active_date - 1;   -- whole days skipped in between
      if v_missed = 0 then
        v_streak := v_stats.current_streak + 1;
      elsif v_missed <= v_shields then
        v_streak  := v_stats.current_streak + 1;
        v_shields := v_shields - v_missed;
      else
        v_streak := 1;
      end if;
    end if;
    if v_streak % 7 = 0 then v_shields := least(2, v_shields + 1); end if;

    update public.user_stats
       set current_streak   = v_streak,
           longest_streak   = greatest(longest_streak, v_streak),
           shields          = v_shields,
           last_active_date = new.local_date,
           updated_at       = now()
     where user_id = new.user_id;
  end if;

  perform public.check_achievements(new.user_id);
  return new;
end $$;

create trigger logs_before_insert before insert on public.logs
  for each row execute function public.logs_before_insert();
create trigger logs_after_insert after insert on public.logs
  for each row execute function public.logs_after_insert();

-- Streak as the user would see it right now (stored value can be stale until their next log).
create or replace function public.effective_streak(p_user uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select case
           when s.last_active_date is null then 0
           when ((now() at time zone p.timezone)::date - s.last_active_date - 1) <= s.shields then s.current_streak
           else 0
         end
    from public.user_stats s
    join public.profiles p on p.id = s.user_id
   where s.user_id = p_user
$$;

-- =====================================================================
-- Read helpers for the apps (one round trip, all time-zone maths in one place)
-- =====================================================================

create or replace function public.my_stats()
returns table (
  total_xp integer, level integer, level_start_xp integer, next_level_xp integer,
  current_streak integer, longest_streak integer, shields integer,
  total_completions integer, hands_free_completions integer, active_today boolean)
language sql stable security definer set search_path = '' as $$
  select s.total_xp, s.level,
         25 * (s.level - 1) * (s.level - 1),
         25 * s.level * s.level,
         public.effective_streak(s.user_id), s.longest_streak, s.shields,
         s.total_completions, s.hands_free_completions,
         coalesce(s.last_active_date = (now() at time zone p.timezone)::date, false)
    from public.user_stats s
    join public.profiles p on p.id = s.user_id
   where s.user_id = (select auth.uid())
$$;

create or replace function public.my_today()
returns table (
  habit_id uuid, name text, category text, logging_method text,
  window_start time, window_end time, gamified boolean,
  status text, logged_at timestamptz, logged_method text)
language sql stable security definer set search_path = '' as $$
  with p as (select timezone from public.profiles where id = (select auth.uid())),
       n as (select (now() at time zone (select timezone from p)) as local_now)
  select h.id, h.name, h.category, h.logging_method, h.window_start, h.window_end, h.gamified,
         case
           when l.id is not null                                 then 'done'
           when (select local_now::time from n) < h.window_start then 'upcoming'
           when (select local_now::time from n) <= h.window_end  then 'due'
           else 'missed'
         end,
         l.occurred_at, l.method
    from public.habits h
    left join lateral (
           select g.id, g.occurred_at, g.method
             from public.logs g
            where g.habit_id = h.id and g.local_date = (select local_now::date from n)
            order by g.occurred_at limit 1) l on true
   where h.user_id = (select auth.uid())
     and h.active
     and extract(isodow from (select local_now from n))::integer = any (h.days)
   order by h.window_start, h.name
$$;

create or replace function public.my_week()
returns table (day date, completed integer, hands_free integer)
language sql stable security definer set search_path = '' as $$
  with t as (select (now() at time zone p.timezone)::date as today
               from public.profiles p where p.id = (select auth.uid()))
  select (t.today - g.i) as day,
         count(distinct l.habit_id)::integer as completed,
         (count(distinct l.habit_id) filter (where l.method <> 'manual'))::integer as hands_free
    from t
   cross join generate_series(0, 6) as g(i)
    left join public.logs l on l.user_id = (select auth.uid()) and l.local_date = (t.today - g.i)
   group by 1
   order by 1
$$;

-- =====================================================================
-- Device + token management (called by signed-in users)
-- =====================================================================

create or replace function public.register_device(p_label text, p_location text default null)
returns table (device_id uuid, api_key text)
language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
  v_id  uuid;
begin
  if (select auth.uid()) is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_key := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');   -- 244 random bits
  insert into public.devices (user_id, label, location, api_key_hash)
  values ((select auth.uid()), p_label, p_location, encode(sha256(convert_to(v_key, 'UTF8')), 'hex'))
  returning id into v_id;
  return query select v_id, v_key;          -- the raw key is returned exactly once
end $$;

create or replace function public.rotate_device_key(p_device uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  v_key := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  update public.devices
     set api_key_hash = encode(sha256(convert_to(v_key, 'UTF8')), 'hex')
   where id = p_device and user_id = (select auth.uid());
  if not found then raise exception 'device not found' using errcode = 'P0002'; end if;
  return v_key;
end $$;

create or replace function public.register_push_token(p_token text, p_platform text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, (select auth.uid()), p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now()
$$;

-- =====================================================================
-- Hub ingestion (service role only; called by the ingest-log Edge Function)
-- =====================================================================

-- Presence habit = an active ultrasonic habit for this user (bound to this hub, or to no hub)
-- whose weekday + window contains the event time. Hub-bound habits win.
create or replace function public.resolve_presence_habit(p_user uuid, p_device uuid, p_at timestamptz)
returns uuid language sql stable security definer set search_path = '' as $$
  select h.id
    from public.habits h
    join public.profiles p on p.id = h.user_id
   where h.user_id = p_user
     and h.active
     and h.logging_method = 'ultrasonic'
     and (h.device_id is null or h.device_id = p_device)
     and extract(isodow from (p_at at time zone p.timezone))::integer = any (h.days)
     and (p_at at time zone p.timezone)::time between h.window_start and h.window_end
   order by (h.device_id = p_device) desc nulls last, h.window_start
   limit 1
$$;

create or replace function public.ingest_device_event(
  p_device_id   uuid,
  p_key_hash    text,
  p_method      text,
  p_event_id    text default null,
  p_tag_uid     text default null,
  p_occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_dev   public.devices;
  v_habit uuid;
  v_name  text;
  v_gam   boolean;
  v_at    timestamptz;
  v_log   uuid;
  v_xp    integer;
  v_stats public.user_stats;
begin
  select * into v_dev from public.devices where id = p_device_id and api_key_hash = p_key_hash;
  if not found then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;

  update public.devices set last_seen_at = now() where id = v_dev.id;

  if p_method not in ('rfid_tap', 'ultrasonic_presence') then
    return jsonb_build_object('ok', false, 'error', 'invalid_method');
  end if;

  v_at := coalesce(p_occurred_at, now());
  if v_at > now() + interval '5 minutes' then v_at := now(); end if;
  if v_at < now() - interval '7 days' then
    return jsonb_build_object('ok', false, 'error', 'event_too_old');
  end if;

  if p_method = 'rfid_tap' then
    select h.id into v_habit
      from public.habits h
     where h.user_id = v_dev.user_id and h.active
       and h.tag_uid = upper(regexp_replace(coalesce(p_tag_uid, ''), '[^0-9A-Fa-f]', '', 'g'))
     limit 1;
    if v_habit is null then return jsonb_build_object('ok', false, 'error', 'unknown_tag'); end if;
  else
    v_habit := public.resolve_presence_habit(v_dev.user_id, v_dev.id, v_at);
    if v_habit is null then
      return jsonb_build_object('ok', true, 'logged', false, 'reason', 'no_active_habit');
    end if;
  end if;

  insert into public.logs (user_id, habit_id, device_id, method, event_id, occurred_at)
  values (v_dev.user_id, v_habit, v_dev.id, p_method, p_event_id, v_at)
  on conflict (device_id, event_id) do nothing
  returning id into v_log;

  if v_log is null then
    return jsonb_build_object('ok', true, 'logged', false, 'reason', 'duplicate');
  end if;

  select name, gamified into v_name, v_gam from public.habits where id = v_habit;
  select coalesce(sum(amount), 0) into v_xp from public.xp_events where log_id = v_log;
  select * into v_stats from public.user_stats where user_id = v_dev.user_id;

  return jsonb_build_object(
    'ok', true, 'logged', true, 'log_id', v_log, 'habit', v_name, 'gamified', v_gam,
    'xp', v_xp, 'total_xp', v_stats.total_xp, 'level', v_stats.level,
    'streak', public.effective_streak(v_dev.user_id));
end $$;

-- =====================================================================
-- Rule-based nudges: habits whose window closed (+ grace) with nothing logged today.
-- Skips quiet hours, non-scheduled weekdays, already-nudged habits, and habits created after today's window.
-- p_now is a parameter only so tests can pin the clock.
-- =====================================================================
create or replace function public.due_nudges(p_now timestamptz default now())
returns table (user_id uuid, habit_id uuid, habit_name text, category text, window_end time, local_date date)
language sql stable security definer set search_path = '' as $$
  with base as (
    select h.id as hid, h.user_id as uid, h.name as hname, h.category as cat,
           h.window_start as ws, h.window_end as we, h.days as dys, h.created_at as made,
           p.timezone as tz, p.nudge_grace_min as grace, p.quiet_start as qs, p.quiet_end as qe,
           (p_now at time zone p.timezone) as local_now
      from public.habits h
      join public.profiles p on p.id = h.user_id
     where h.active
  )
  select b.uid, b.hid, b.hname, b.cat, b.we, b.local_now::date
    from base b
   where extract(isodow from b.local_now)::integer = any (b.dys)
     and b.local_now >= (b.local_now::date + b.we) + make_interval(mins => b.grace)
     and (b.made at time zone b.tz) < (b.local_now::date + b.ws)
     and not (case when b.qs <= b.qe
                   then b.local_now::time >= b.qs and b.local_now::time < b.qe
                   else b.local_now::time >= b.qs or  b.local_now::time < b.qe end)
     and not exists (select 1 from public.logs g
                      where g.habit_id = b.hid and g.local_date = b.local_now::date)
     and not exists (select 1 from public.nudges n
                      where n.habit_id = b.hid and n.local_date = b.local_now::date)
$$;

-- =====================================================================
-- Admin helpers (aggregates only: admins never see another user's habits or logs)
-- =====================================================================
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false)
$$;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users',            (select count(*) from public.profiles),
    'devices',          (select count(*) from public.devices),
    'devices_seen_24h', (select count(*) from public.devices where last_seen_at > now() - interval '24 hours'),
    'logs_24h',         (select count(*) from public.logs where created_at > now() - interval '24 hours'),
    'hands_free_pct_7d',(select case when count(*) = 0 then null
                                     else round(100.0 * count(*) filter (where method <> 'manual') / count(*)) end
                           from public.logs where created_at > now() - interval '7 days'));
end $$;

-- Re-evaluates every user after an admin adds or edits an achievement.
create or replace function public.admin_recheck_achievements()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  for r in select id from public.profiles loop
    perform public.check_achievements(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles          enable row level security;
alter table public.user_stats        enable row level security;
alter table public.devices           enable row level security;
alter table public.habits            enable row level security;
alter table public.logs              enable row level security;
alter table public.achievements      enable row level security;
alter table public.user_achievements enable row level security;
alter table public.xp_events         enable row level security;
alter table public.nudges            enable row level security;
alter table public.push_tokens       enable row level security;

create policy profiles_read   on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy stats_read on public.user_stats for select to authenticated using (user_id = (select auth.uid()));

create policy devices_read   on public.devices for select to authenticated using (user_id = (select auth.uid()));
create policy devices_update on public.devices for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy devices_delete on public.devices for delete to authenticated using (user_id = (select auth.uid()));

create policy habits_read   on public.habits for select to authenticated using (user_id = (select auth.uid()));
create policy habits_insert on public.habits for insert to authenticated with check (user_id = (select auth.uid()));
create policy habits_update on public.habits for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy habits_delete on public.habits for delete to authenticated using (user_id = (select auth.uid()));

create policy logs_read on public.logs for select to authenticated using (user_id = (select auth.uid()));
create policy logs_add_manual on public.logs for insert to authenticated
  with check (user_id = (select auth.uid()) and method = 'manual');

create policy xp_read on public.xp_events for select to authenticated using (user_id = (select auth.uid()));

create policy achievements_read on public.achievements for select to authenticated
  using (active or public.is_admin());
create policy achievements_admin_insert on public.achievements for insert to authenticated
  with check (public.is_admin());
create policy achievements_admin_update on public.achievements for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy achievements_admin_delete on public.achievements for delete to authenticated
  using (public.is_admin());

create policy user_ach_read on public.user_achievements for select to authenticated
  using (user_id = (select auth.uid()));

create policy nudges_read   on public.nudges for select to authenticated using (user_id = (select auth.uid()));
create policy nudges_update on public.nudges for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and status in ('acknowledged', 'dismissed'));

create policy push_read   on public.push_tokens for select to authenticated using (user_id = (select auth.uid()));
create policy push_delete on public.push_tokens for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Table privileges: start from nothing, grant the minimum
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles, public.user_stats, public.habits, public.logs,
                public.xp_events, public.achievements, public.user_achievements,
                public.nudges, public.push_tokens to authenticated;
-- devices: everything except the key hash (clients must list columns instead of select *)
grant select (id, user_id, label, location, last_seen_at, created_at) on public.devices to authenticated;

grant update (display_name, timezone, nudge_grace_min, quiet_start, quiet_end) on public.profiles to authenticated;
grant update (label, location) on public.devices to authenticated;
grant delete on public.devices to authenticated;
grant insert (name, category, logging_method, tag_uid, device_id, window_start, window_end, days, active)
  on public.habits to authenticated;
grant update (name, category, logging_method, tag_uid, device_id, window_start, window_end, days, active)
  on public.habits to authenticated;
grant delete on public.habits to authenticated;
grant insert (habit_id, device_id, method) on public.logs to authenticated;
grant update (status) on public.nudges to authenticated;
grant delete on public.push_tokens to authenticated;
grant insert, update, delete on public.achievements to authenticated;     -- policies limit this to admins

grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------
-- Function privileges: nothing is callable by default
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.my_stats(), public.my_today(), public.my_week(),
  public.register_device(text, text), public.rotate_device_key(uuid), public.register_push_token(text, text),
  public.is_admin(), public.admin_overview(), public.admin_recheck_achievements()
  to authenticated;

grant execute on all functions in schema public to service_role;

-- ---------------------------------------------------------------------
-- Realtime: stream these tables to the apps (RLS still filters per user)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.logs, public.user_stats,
                                                   public.user_achievements, public.nudges;
  end if;
end $$;
