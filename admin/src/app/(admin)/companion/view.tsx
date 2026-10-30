'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { buildBehavioralInsight, type TodayHabit, type UserStats, type WeekDay } from '@/lib/behavioral-insights';
import { createClient } from '@/lib/supabase/client';
import { parseHabitText } from '@/lib/nlp-habit-parser';

type TodayRow = TodayHabit & { window_end: string; gamified: boolean; logged_at: string | null; logged_method: string | null };
type StatsRow = UserStats & { total_xp: number; level: number; level_start_xp: number; next_level_xp: number; total_completions: number };
type WeekRow = WeekDay & { day: string };
const PRESETS = [
  { label: '💧 Water + RFID', text: 'Drink water every day from 7am to 10pm with RFID tag 04A21B7C' },
  { label: '💻 Study + presence', text: 'Desk study session Mon to Fri 9:00-12:00 using presence sensor' },
  { label: '💊 Medication', text: 'Take blood pressure tablet every morning 8am to 9am' },
  { label: '🚶 Evening walk', text: 'Evening walk daily 6pm to 7:30pm' },
];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STATUS_GROUPS = [
  { status: 'due', title: 'Ready now' },
  { status: 'upcoming', title: 'Coming up' },
  { status: 'missed', title: 'Window closed' },
  { status: 'done', title: 'Completed' },
] as const;

export default function Companion() {
  const supabase = useMemo(() => createClient(), []);
  const [today, setToday] = useState<TodayRow[]>([]);
  const [stats, setStats] = useState<StatsRow | null>(null);
  const [week, setWeek] = useState<WeekRow[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [medConfirmHabit, setMedConfirmHabit] = useState<TodayRow | null>(null);
  const parsed = useMemo(() => text.trim() ? parseHabitText(text) : null, [text]);

  const refresh = useCallback(async () => {
    const [t, s, w] = await Promise.all([supabase.rpc('my_today'), supabase.rpc('my_stats'), supabase.rpc('my_week')]);
    const failure = t.error ?? s.error ?? w.error;
    setError(failure?.message ?? '');
    if (!failure) {
      setToday((t.data ?? []) as TodayRow[]);
      setStats(((s.data ?? []) as StatsRow[])[0] ?? null);
      setWeek((w.data ?? []) as WeekRow[]);
    }
  }, [supabase]);

  useEffect(() => {
    void refresh();
    const channel = supabase.channel('companion-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'logs' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_stats' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habits' }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh, supabase]);

  const insight = buildBehavioralInsight(today, stats, week);

  async function createHabit() {
    if (!parsed?.name) return setError('Add a habit name to the sentence first.');
    if (!parsed.window_start || !parsed.window_end) return setError('Add a time window, such as 08:00–09:00.');
    if (parsed.window_end <= parsed.window_start) return setError('The end time must be later than the start time.');
    if (parsed.logging_method === 'rfid' && !parsed.tag_uid) return setError('Add the RFID tag UID, or choose a different detection method.');
    setBusy(true); setError(''); setNotice('');
    const { error: insertError } = await supabase.from('habits').insert({
      name: parsed.name, category: parsed.category, logging_method: parsed.logging_method,
      tag_uid: parsed.logging_method === 'rfid' ? parsed.tag_uid : null,
      window_start: parsed.window_start, window_end: parsed.window_end, days: parsed.days,
    });
    if (insertError) setError(insertError.message);
    else {
      setText('');
      setNotice(parsed.category === 'medication' ? 'Medication routine added · tracked, never gamified.' : 'Habit added. Your schedule is up to date.');
      await refresh();
    }
    setBusy(false);
  }

  async function logHabit(habit: TodayRow) {
    setBusy(true); setError(''); setNotice('');
    const { error: insertError } = await supabase.from('logs').insert({ habit_id: habit.habit_id, method: 'manual' });
    if (insertError) setError(insertError.message);
    else setNotice(habit.category === 'medication' ? 'Medication log saved · no XP or streak effect.' : 'Check-in saved. Rewards are calculated by the database.');
    setMedConfirmHabit(null);
    await refresh(); setBusy(false);
  }

  const todayDone = today.filter((habit) => habit.status === 'done').length;
  const canCreate = Boolean(parsed?.name && parsed.window_start && parsed.window_end &&
    parsed.window_end > parsed.window_start && (parsed.logging_method !== 'rfid' || parsed.tag_uid));

  return (
    <>
      <h1>My Habits &amp; Live Companion</h1>
      <p className="sub">Your personal dashboard follows the same privacy rules as the mobile app. Updates stream from Supabase in real time.</p>
      {error ? <p className="err" role="alert">{error}</p> : null}
      {notice ? <p className="notice" role="status">{notice}</p> : null}
      <div className="cards">
        <div className="card"><div className="k">Level</div><div className="v">{stats?.level ?? '—'}</div><div className="dim">{stats?.total_xp ?? 0} XP</div></div>
        <div className="card"><div className="k">Current streak</div><div className="v">{stats?.current_streak ?? 0} days</div><div className="dim">{stats?.shields ?? 0} shields · {insight.shieldMessage}</div></div>
        <div className="card"><div className="k">This week</div><div className="v">{week.reduce((n, day) => n + day.completed, 0)}</div><div className="dim">{insight.frictionReductionPercent}% hands-free</div></div>
      </div>
      <section className="card coach-panel section">
        <div className="coach-heading">
          <div><span className="eyebrow">OmniTrack Coach</span><h2>{today.some((habit) => habit.status === 'due') ? 'A habit is due now' : 'Today’s next step'}</h2></div>
          <span className="stage-pill">{insight.automationSupport}</span>
        </div>
        <p>{insight.nudge}</p>
        <div className="coach-meter" role="img" aria-label={`${insight.frictionReductionPercent}% of logged events used a hub`}>
          <span style={{ width: `${insight.frictionReductionPercent}%` }} />
        </div>
        <p className="dim">{insight.evidence} · {insight.consistencyPercent}% of the week had at least one log. {insight.shieldMessage}</p>
        <div className="model-box">
          <strong>Fogg B=MAP lens</strong>
          <span>{insight.foggPrompt}</span><span>{insight.foggAbility}</span>
          <small>{insight.foggMotivation} Hub support is a logging proxy, not a measure of habit automaticity.</small>
        </div>
      </section>
      <section className="card section">
        <div className="section-heading"><h2>Today’s plan</h2><span className="dim">{todayDone} / {today.length} complete</span></div>
        {today.length ? STATUS_GROUPS.map((group) => {
          const rows = today.filter((habit) => habit.status === group.status);
          return rows.length ? <div className="habit-group" key={group.status}>
            <h3>{group.title}<span>{rows.length}</span></h3>
            {rows.map((habit) => {
              const medication = habit.category === 'medication';
              return <article className={`habit-card status-${habit.status}`} key={habit.habit_id}>
                <div className="habit-card-main">
                  <strong>{habit.name}</strong>
                  <span className="dim">{habit.window_start.slice(0, 5)}–{habit.window_end.slice(0, 5)} · {habit.logging_method}</span>
                  {medication ? <span className="safety">Tracked &amp; reminded · never gamified</span> : null}
                </div>
                {habit.status === 'done' ? <span className="complete-label">✓ Logged</span> :
                  <button className={medication ? 'ghost' : 'primary'} disabled={busy}
                    onClick={() => medication ? setMedConfirmHabit(habit) : void logHabit(habit)}>
                    {medication ? 'Confirm dose' : 'Log check-in'}
                  </button>}
              </article>;
            })}
          </div> : null;
        }) : <div className="empty-state"><strong>A clear slate.</strong><p>No habits are scheduled today. Create one below to get started.</p></div>}
      </section>
      <section className="card section">
        <h2>Smart habit add</h2>
        <p className="dim">Choose a starter or describe your routine. Review the schedule and cue before it is saved.</p>
        <div className="preset-row">{PRESETS.map((preset) => <button className={`preset ${text === preset.text ? 'selected' : ''}`} type="button" key={preset.label} onClick={() => { setText(preset.text); setError(''); }} aria-pressed={text === preset.text}>{preset.label}</button>)}</div>
        <form className="quick-add" onSubmit={(event) => { event.preventDefault(); void createHabit(); }}>
          <input aria-label="Describe a habit" value={text} onChange={(event) => setText(event.target.value)} placeholder="For example: Read every weekday at 8pm" />
          <button className="primary" disabled={!canCreate || busy}>{busy ? 'Saving…' : 'Review & create'}</button>
        </form>
        {parsed ? <div className="pills">{[
          `Name · ${parsed.name || 'needed'}`, `Category · ${parsed.category}`, `Cue · ${parsed.logging_method}`,
          `Window · ${parsed.window_start && parsed.window_end ? `${parsed.window_start.slice(0, 5)}–${parsed.window_end.slice(0, 5)}` : 'needed'}`,
          `Days · ${parsed.days.length === 7 ? 'Daily' : parsed.days.map((day) => DAYS[day - 1]).join(' · ')}`,
          ...(parsed.logging_method === 'rfid' ? [`Tag · ${parsed.tag_uid ?? 'needed'}`] : []),
        ].map((pill) => <span className="pill" key={pill}>{pill}</span>)}</div> : null}
        {parsed?.category === 'medication' ? <p className="safety">Tracked &amp; reminded · never gamified</p> : null}
        {text && !canCreate ? <p className="form-hint">Add a valid time window{parsed?.logging_method === 'rfid' && !parsed.tag_uid ? ' and RFID tag UID' : ''} to continue.</p> : null}
      </section>
      {medConfirmHabit ? <div className="modal-backdrop" role="presentation">
        <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="med-confirm-title">
          <span className="eyebrow">Medication safety</span>
          <h2 id="med-confirm-title">Log this dose?</h2>
          <p>Only record <strong>{medConfirmHabit.name}</strong> if you have actually taken it. This is a safety log, not a reward.</p>
          <div className="row"><button className="ghost" onClick={() => setMedConfirmHabit(null)}>Cancel</button>
            <button className="primary" disabled={busy} onClick={() => void logHabit(medConfirmHabit)}>Yes, I took it</button></div>
        </section>
      </div> : null}
    </>
  );
}
