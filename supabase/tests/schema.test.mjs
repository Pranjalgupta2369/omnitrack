// Runs the real migrations against an in-memory Postgres (PGlite) with just enough of Supabase's
// `auth` schema and roles stubbed. Run:  npm install && npm test
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');
const db = new PGlite();

const STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text,
                           raw_user_meta_data jsonb not null default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
`;

before(async () => {
  await db.exec(STUBS);
  for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
  }
});
after(() => db.close());

// ---------------------------------------------------------------- helpers
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const sha = (s) => createHash('sha256').update(s).digest('hex');

async function asUser(uid, fn) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);
  await db.exec('set role authenticated');
  try { return await fn(); }
  finally {
    await db.exec('reset role');
    await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}
async function asAnon(fn) {
  await db.exec('set role anon');
  try { return await fn(); } finally { await db.exec('reset role'); }
}

let n = 0;
async function newUser(tz = 'Asia/Kolkata') {
  const { id } = await one(`insert into auth.users (email) values ($1) returning id`, [`u${++n}@example.com`]);
  await q(`update public.profiles set timezone = $2 where id = $1`, [id, tz]);
  return id;
}
async function addHabit(uid, h = {}) {
  return asUser(uid, () => one(
    `insert into public.habits (name, category, logging_method, tag_uid, window_start, window_end, days)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [h.name ?? 'Habit', h.category ?? 'custom', h.method ?? 'manual', h.tag ?? null,
     h.ws ?? '08:00', h.we ?? '09:00', h.days ?? '{1,2,3,4,5,6,7}']));
}
async function addDevice(uid) {
  return asUser(uid, () => one(`select * from public.register_device('Desk hub', 'Bedroom')`));
}
// local wall-clock time N days ago, as an ISO instant
async function at(daysAgo, hhmm, tz = 'Asia/Kolkata') {
  const r = await one(
    `select (((date_trunc('day', now() at time zone $3) - make_interval(days => $1::int)) + $2::time)
             at time zone $3) as t`, [daysAgo, hhmm, tz]);
  return r.t.toISOString();
}
const hub = async (dev, method, o = {}) =>
  (await one(`select public.ingest_device_event($1,$2,$3,$4,$5,$6) as r`,
    [dev.device_id, o.hash ?? sha(dev.api_key), method, o.event ?? null, o.tag ?? null, o.at ?? null])).r;
const stats = (uid) => one(`select * from public.user_stats where user_id = $1`, [uid]);
const earned = async (uid) =>
  (await q(`select achievement_id from public.user_achievements where user_id = $1 order by 1`, [uid]))
    .map((r) => r.achievement_id);
const myStats = (uid) => asUser(uid, () => one(`select * from public.my_stats()`));

// ---------------------------------------------------------------- tests
test('sign-up creates a profile and a stats row', async () => {
  const u = await newUser();
  assert.equal((await one(`select count(*)::int c from public.profiles where id=$1`, [u])).c, 1);
  const s = await stats(u);
  assert.equal(s.total_xp, 0); assert.equal(s.level, 1); assert.equal(s.current_streak, 0);
});

test('new profiles default to Asia/Kolkata', async () => {
  const { id } = await one(`insert into auth.users (email) values ('timezone-default@example.com') returning id`);
  assert.equal((await one(`select timezone from public.profiles where id=$1`, [id])).timezone, 'Asia/Kolkata');
});

test('profile timezone must be a real IANA zone', async () => {
  const u = await newUser();
  await assert.rejects(asUser(u, () => q(`update public.profiles set timezone='Mars/Phobos' where id=$1`, [u])),
                       /not recognized/i);
  await asUser(u, () => q(`update public.profiles set timezone='Europe/Paris' where id=$1`, [u]));
});

test('habits: tag UIDs are normalised, medication is never gamified, duplicate active tags rejected', async () => {
  const u = await newUser();
  const h = await addHabit(u, { method: 'rfid', tag: '04:a2-1b 7c' });
  assert.equal(h.tag_uid, '04A21B7C');
  assert.equal(h.gamified, true);
  const med = await addHabit(u, { category: 'medication', method: 'rfid', tag: 'ff00' });
  assert.equal(med.gamified, false);
  await assert.rejects(addHabit(u, { method: 'rfid', tag: '04A21B7C' }), /duplicate key/i);
  await assert.rejects(addHabit(u, { ws: '10:00', we: '09:00' }), /check/i);
});

test('RLS: users only see their own rows and cannot write XP, stats or admin flags', async () => {
  const a = await newUser(); const b = await newUser();
  const ha = await addHabit(a, { name: 'A-only', ws: '00:00', we: '23:59:59' });
  assert.equal((await asUser(b, () => q(`select * from public.habits`))).length, 0);
  assert.equal((await asUser(a, () => q(`select * from public.habits where name='A-only'`))).length, 1);

  // b cannot log against a's habit, cannot forge a hub event, cannot use someone else's user_id
  await assert.rejects(asUser(b, () => q(`insert into public.logs (habit_id, method) values ($1,'manual')`, [ha.id])),
                       /does not belong/i);
  await assert.rejects(asUser(a, () => q(`insert into public.logs (habit_id, method) values ($1,'rfid_tap')`, [ha.id])),
                       /row-level security/i);
  await assert.rejects(asUser(a, () => q(`insert into public.habits (user_id, name) values ($1,'x')`, [b])),
                       /permission denied/i);
  // no direct writes to gamification state
  await assert.rejects(asUser(a, () => q(`insert into public.xp_events (user_id,local_date,reason,amount) values ($1,current_date,'log',999)`, [a])),
                       /permission denied/i);
  await assert.rejects(asUser(a, () => q(`update public.user_stats set total_xp = 99999 where user_id=$1`, [a])),
                       /permission denied/i);
  await assert.rejects(asUser(a, () => q(`update public.profiles set is_admin = true where id=$1`, [a])),
                       /permission denied/i);
  await assert.rejects(asUser(a, () => q(`update public.habits set gamified = true where id=$1`, [ha.id])),
                       /permission denied/i);
  // internal functions are not callable by clients; anon sees nothing
  await assert.rejects(asUser(a, () => q(`select * from public.due_nudges()`)), /permission denied/i);
  await assert.rejects(asUser(a, () => q(`select public.check_achievements($1)`, [a])), /permission denied/i);
  await assert.rejects(asAnon(() => q(`select * from public.habits`)), /permission denied/i);
});

test('manual log: 10 base + 5 in-window = 15 XP, +10 first-step bonus, streak starts, repeat logs add nothing', async () => {
  const u = await newUser();
  const h = await addHabit(u, { ws: '00:00', we: '23:59:59' });
  await asUser(u, () => q(`insert into public.logs (habit_id, method) values ($1,'manual')`, [h.id]));
  let s = await stats(u);
  assert.equal(s.total_xp, 25);                 // 15 + first_step (10)
  assert.equal(s.level, 2);                     // 25 XP is exactly the start of level 2
  assert.equal(s.total_completions, 1); assert.equal(s.hands_free_completions, 0);
  assert.equal(s.current_streak, 1);
  assert.deepEqual(await earned(u), ['first_step']);

  await asUser(u, () => q(`insert into public.logs (habit_id, method) values ($1,'manual')`, [h.id]));
  s = await stats(u);
  assert.equal(s.total_xp, 25); assert.equal(s.total_completions, 1);
  assert.equal((await one(`select count(*)::int c from public.logs where user_id=$1`, [u])).c, 2);
  assert.equal((await myStats(u)).active_today, true);
});

test('hub RFID event: 20 XP (10 + on-time 5 + hands-free 5), idempotent retries, auth + tag checks', async () => {
  const u = await newUser();
  await addHabit(u, { name: 'Water', method: 'rfid', tag: 'A1B2C3D4' });
  const dev = await addDevice(u);
  assert.match(dev.api_key, /^[0-9a-f]{64}$/);

  assert.deepEqual(await hub(dev, 'rfid_tap', { tag: 'A1B2C3D4', hash: sha('wrong') }), { ok: false, error: 'unauthorized' });
  assert.deepEqual(await hub(dev, 'rfid_tap', { tag: 'DEADBEEF', event: 'e0' }), { ok: false, error: 'unknown_tag' });
  assert.deepEqual(await hub(dev, 'rfid_tap', { tag: 'A1B2C3D4', event: 'old', at: await at(8, '08:30') }),
                   { ok: false, error: 'event_too_old' });

  const ts = await at(1, '08:30');
  const r = await hub(dev, 'rfid_tap', { tag: 'a1:b2:c3:d4', event: 'e1', at: ts });
  assert.equal(r.ok, true); assert.equal(r.logged, true); assert.equal(r.habit, 'Water');
  assert.equal(r.xp, 20); assert.equal(r.total_xp, 30); assert.equal(r.level, 2); assert.equal(r.streak, 1);

  assert.deepEqual(await hub(dev, 'rfid_tap', { tag: 'A1B2C3D4', event: 'e1', at: ts }),
                   { ok: true, logged: false, reason: 'duplicate' });
  const again = await hub(dev, 'rfid_tap', { tag: 'A1B2C3D4', event: 'e2', at: await at(1, '08:40') });
  assert.equal(again.logged, true); assert.equal(again.xp, 0);        // same habit, same day: no second award
  assert.equal((await stats(u)).total_xp, 30);
  assert.equal((await stats(u)).hands_free_completions, 1);
  assert.ok((await one(`select last_seen_at from public.devices where id=$1`, [dev.device_id])).last_seen_at);
});

test('medication habits are logged but never gamified', async () => {
  const u = await newUser();
  await addHabit(u, { name: 'Morning meds', category: 'medication', method: 'rfid', tag: '0M0M'.replace(/M/g, 'A') });
  const dev = await addDevice(u);
  const r = await hub(dev, 'rfid_tap', { tag: '0A0A', event: 'm1', at: await at(1, '08:30') });
  assert.equal(r.logged, true); assert.equal(r.gamified, false); assert.equal(r.xp, 0);
  const s = await stats(u);
  assert.equal(s.total_xp, 0); assert.equal(s.total_completions, 0); assert.equal(s.current_streak, 0);
  assert.deepEqual(await earned(u), []);
  assert.equal((await one(`select count(*)::int c from public.logs where user_id=$1`, [u])).c, 1);
});

test('presence: picks the habit whose window contains the event; hub-bound habits win; outside a window logs nothing', async () => {
  const u = await newUser();
  const dev = await addDevice(u);
  await addHabit(u, { name: 'Unbound study', method: 'ultrasonic', ws: '19:00', we: '21:00' });
  const bound = await addHabit(u, { name: 'Desk study', method: 'ultrasonic', ws: '19:30', we: '21:00' });
  await asUser(u, () => q(`update public.habits set device_id=$1 where id=$2`, [dev.device_id, bound.id]));

  const r = await hub(dev, 'ultrasonic_presence', { event: 'p1', at: await at(1, '20:00') });
  assert.equal(r.logged, true); assert.equal(r.habit, 'Desk study');
  assert.deepEqual(await hub(dev, 'ultrasonic_presence', { event: 'p2', at: await at(1, '12:00') }),
                   { ok: true, logged: false, reason: 'no_active_habit' });
});

test('streak: 7 consecutive days earn a shield and the 3 / 7-day achievements', async () => {
  const u = await newUser();
  await addHabit(u, { method: 'rfid', tag: 'AA01' });
  const dev = await addDevice(u);
  for (let d = 6; d >= 0; d--) await hub(dev, 'rfid_tap', { tag: 'AA01', event: `s${d}`, at: await at(d, '08:30') });
  const s = await stats(u);
  assert.equal(s.current_streak, 7); assert.equal(s.longest_streak, 7); assert.equal(s.shields, 1);
  const got = await earned(u);
  for (const id of ['first_step', 'streak_3', 'streak_7']) assert.ok(got.includes(id), id);
  assert.ok(!got.includes('streak_30'));
});

test('streak: a shield forgives one missed day, two missed days reset it, backfills never touch it', async () => {
  const u = await newUser();
  await addHabit(u, { name: 'A', method: 'rfid', tag: 'AA02' });
  await addHabit(u, { name: 'B', method: 'rfid', tag: 'BB02' });
  const dev = await addDevice(u);
  const go = async (tag, d) => hub(dev, 'rfid_tap', { tag, event: `${tag}-${d}`, at: await at(d, '08:30') });

  await go('AA02', 6); await go('AA02', 5);
  assert.equal((await stats(u)).current_streak, 2);

  await q(`update public.user_stats set shields = 1 where user_id=$1`, [u]);   // as if earned
  await go('AA02', 3);                                                         // day 4 skipped
  let s = await stats(u);
  assert.equal(s.current_streak, 3); assert.equal(s.shields, 0);

  const back = await go('BB02', 6);                                            // older than last_active_date
  assert.equal(back.logged, true);
  assert.equal((await stats(u)).current_streak, 3);

  await go('AA02', 0);                                                         // days 2 and 1 skipped, no shield
  s = await stats(u);
  assert.equal(s.current_streak, 1); assert.equal(s.longest_streak, 3);
  assert.equal((await myStats(u)).current_streak, 1);
});

test('effective streak: shields protect up to their count, otherwise the streak reads as broken', async () => {
  const u = await newUser();
  const today = (await one(`select (now() at time zone 'Asia/Kolkata')::date as d`)).d;
  const set = (shields, daysAgo) => q(
    `update public.user_stats set current_streak=5, longest_streak=5, shields=$2,
            last_active_date = (now() at time zone 'Asia/Kolkata')::date - $3::int where user_id=$1`,
    [u, shields, daysAgo]);
  await set(0, 1); assert.equal((await myStats(u)).current_streak, 5);   // logged yesterday: alive
  await set(0, 2); assert.equal((await myStats(u)).current_streak, 0);   // missed one day, no shield
  await set(1, 2); assert.equal((await myStats(u)).current_streak, 5);   // shield covers it
  await set(1, 3); assert.equal((await myStats(u)).current_streak, 0);   // two missed, one shield
  await set(2, 3); assert.equal((await myStats(u)).current_streak, 5);
  assert.ok(today);
});

test('achievements: rules are data; one reward can unlock the next (total_xp chain)', async () => {
  const u = await newUser();
  await q(`update public.user_stats set total_xp=400, current_streak=30, longest_streak=30 where user_id=$1`, [u]);
  await q(`select public.check_achievements($1)`, [u]);
  const got = await earned(u);
  assert.deepEqual(got, ['streak_3', 'streak_30', 'streak_7', 'xp_500']);
  assert.equal((await stats(u)).total_xp, 400 + 20 + 50 + 200);
  await q(`select public.check_achievements($1)`, [u]);                       // idempotent
  assert.equal((await stats(u)).total_xp, 670);
});

test('admin: only admins edit achievements or see the overview; overview is aggregate-only', async () => {
  const admin = await newUser(); const user = await newUser();
  await assert.rejects(asUser(user, () => q(
    `insert into public.achievements (id,title,description,metric,threshold) values ('x1','t','d','total_xp',1)`)),
    /row-level security/i);
  await assert.rejects(asUser(user, () => q(`select public.admin_overview()`)), /forbidden/i);

  await q(`update public.profiles set is_admin = true where id = $1`, [admin]);
  await asUser(admin, () => q(
    `insert into public.achievements (id,title,description,metric,threshold,xp_reward)
     values ('streak_2','Two in a row','Keep a 2-day streak.','current_streak',2,5)`));
  await q(`update public.user_stats set current_streak = 4 where user_id = $1`, [user]);
  const touched = (await asUser(admin, () => one(`select public.admin_recheck_achievements() as n`))).n;
  assert.ok(touched >= 2);
  assert.ok((await earned(user)).includes('streak_2'));

  const o = (await asUser(admin, () => one(`select public.admin_overview() as o`))).o;
  assert.ok(o.users >= 2); assert.ok('logs_24h' in o); assert.ok(!('habits' in o));
  assert.equal((await asUser(user, () => q(`select id from public.achievements where id='streak_2'`))).length, 1);
});

test('device keys: shown once, stored hashed, rotation kills the old key, other users cannot rotate', async () => {
  const u = await newUser(); const other = await newUser();
  await addHabit(u, { method: 'rfid', tag: 'CC03' });
  const dev = await addDevice(u);
  const row = await one(`select api_key_hash from public.devices where id=$1`, [dev.device_id]);
  assert.equal(row.api_key_hash, sha(dev.api_key));
  assert.ok(!JSON.stringify(row).includes(dev.api_key));
  await assert.rejects(asUser(u, () => q(`select api_key_hash from public.devices`)), /permission denied/i);

  await assert.rejects(asUser(other, () => q(`select public.rotate_device_key($1)`, [dev.device_id])), /not found/i);
  const fresh = (await asUser(u, () => one(`select public.rotate_device_key($1) as k`, [dev.device_id]))).k;
  assert.equal((await hub(dev, 'rfid_tap', { tag: 'CC03' })).error, 'unauthorized');
  const ok = await hub({ ...dev, api_key: fresh }, 'rfid_tap', { tag: 'CC03', event: 'r1', at: await at(1, '08:30') });
  assert.equal(ok.logged, true);
});

test('my_today + my_week: statuses and the 7-day shape', async () => {
  const u = await newUser();
  const all   = await addHabit(u, { name: 'All day', ws: '00:00', we: '23:59:59' });
  await addHabit(u, { name: 'Early', ws: '00:00', we: '00:00:01' });
  await addHabit(u, { name: 'Late',  ws: '23:59:58', we: '23:59:59' });
  let rows = await asUser(u, () => q(`select * from public.my_today()`));
  assert.deepEqual(rows.map((r) => [r.name, r.status]),
                   [['All day', 'due'], ['Early', 'missed'], ['Late', 'upcoming']]);
  await asUser(u, () => q(`insert into public.logs (habit_id, method) values ($1,'manual')`, [all.id]));
  rows = await asUser(u, () => q(`select * from public.my_today() where name='All day'`));
  assert.equal(rows[0].status, 'done'); assert.equal(rows[0].logged_method, 'manual');
  const week = await asUser(u, () => q(`select * from public.my_week()`));
  assert.equal(week.length, 7);
  assert.equal(week[6].completed, 1); assert.equal(week[6].hands_free, 0); assert.equal(week[0].completed, 0);
});

test('due_nudges: window closed + grace, quiet hours, weekday, already logged / nudged, new habits', async () => {
  const u = await newUser('UTC');
  const h = await addHabit(u, { name: 'Stretch', ws: '08:00', we: '09:00' });
  await q(`update public.habits set created_at = now() - interval '3 days' where id=$1`, [h.id]);
  const yday = async (hhmm) => (await one(
    `select ((date_trunc('day', now() at time zone 'UTC') - interval '1 day' + $1::time) at time zone 'UTC') as t`,
    [hhmm])).t.toISOString();
  const due = async (hhmm) => q(`select * from public.due_nudges($1)`, [await yday(hhmm)]);

  assert.equal((await due('09:10')).length, 0);                       // grace (20 min) not over yet
  const r = await due('09:25');
  assert.equal(r.length, 1); assert.equal(r[0].habit_name, 'Stretch'); assert.equal(r[0].category, 'custom');

  await q(`update public.profiles set quiet_start='09:00', quiet_end='10:00' where id=$1`, [u]);
  assert.equal((await due('09:25')).length, 0);                       // inside quiet hours
  await q(`update public.profiles set quiet_start='22:30', quiet_end='07:00' where id=$1`, [u]);
  assert.equal((await due('09:25')).length, 1);
  assert.equal((await due('23:30')).length, 0);                       // wrapped quiet window

  const dow = (await one(`select extract(isodow from (now() at time zone 'UTC') - interval '1 day')::int as d`)).d;
  await q(`update public.habits set days = $2::smallint[] where id=$1`, [h.id, `{${(dow % 7) + 1}}`]);
  assert.equal((await due('09:25')).length, 0);                       // not scheduled that weekday
  await q(`update public.habits set days = '{1,2,3,4,5,6,7}' where id=$1`, [h.id]);

  await q(`update public.habits set created_at = now() where id=$1`, [h.id]);
  assert.equal((await due('09:25')).length, 0);                       // habit didn't exist when the window opened
  await q(`update public.habits set created_at = now() - interval '3 days' where id=$1`, [h.id]);

  await q(`insert into public.nudges (user_id, habit_id, local_date, message)
           values ($1,$2,(now() at time zone 'UTC')::date - 1,'x')`, [u, h.id]);
  assert.equal((await due('09:25')).length, 0);                       // already nudged that day
  await q(`delete from public.nudges where habit_id=$1`, [h.id]);

  await q(`insert into public.logs (user_id, habit_id, method, occurred_at) values ($1,$2,'rfid_tap',$3)`,
          [u, h.id, await yday('08:30')]);
  assert.equal((await due('09:25')).length, 0);                       // logged that day
});

test('realtime publication guard and push-token upsert move a token between users', async () => {
  const a = await newUser(); const b = await newUser();
  await asUser(a, () => q(`select public.register_push_token('ExponentPushToken[abc]','android')`));
  await asUser(b, () => q(`select public.register_push_token('ExponentPushToken[abc]','ios')`));
  const rows = await q(`select user_id, platform from public.push_tokens where token='ExponentPushToken[abc]'`);
  assert.equal(rows.length, 1); assert.equal(rows[0].user_id, b); assert.equal(rows[0].platform, 'ios');
});
