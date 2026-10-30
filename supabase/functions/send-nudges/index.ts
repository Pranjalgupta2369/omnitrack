// Scheduled every 15 minutes by pg_cron (see supabase/cron.sql).
//
// Rule-based first: due_nudges() (SQL) decides WHO needs a nudge — window closed + grace, nothing logged today,
// outside quiet hours, scheduled weekday. This function writes the nudge row (unique per habit per day, so
// overlapping runs can't double-send), then pushes it through Expo's push service.
//
import { admin, json } from '../_shared/admin.ts';

const CRON_SECRET = Deno.env.get('CRON_SECRET');
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type Due = {
  user_id: string;
  habit_id: string;
  habit_name: string;
  category: string;
  window_end: string; // "HH:MM:SS"
  local_date: string;
};

const hhmm = (t: string) => t.slice(0, 5);

function template(d: Due): string {
  if (d.category === 'medication') {
    return `Reminder: ${d.habit_name} window closed at ${hhmm(d.window_end)}. Please log if taken.`;
  }
  const categoryCopy: Record<string, string> = {
    hydration: 'A small sip still counts. Your water window closed at',
    focus: 'A short focused session is a good next step. Your study window closed at',
    exercise: 'A few minutes of movement can be a useful start. Your activity window closed at',
    recovery: 'Make room for a calm reset when it works for you. Your recovery window closed at',
    custom: 'There is still room for this habit today. Its window closed at',
  };
  return `${categoryCopy[d.category] ?? categoryCopy.custom} ${hhmm(d.window_end)}; nothing has been logged yet.`;
}

Deno.serve(async (req: Request) => {
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return json({ error: 'unauthorized' }, 401);
  }

  const { data, error } = await admin.rpc('due_nudges');
  if (error) {
    console.error('due_nudges failed', error);
    return json({ error: 'server_error' }, 500);
  }
  const due = (data ?? []) as Due[];

  let created = 0;
  let pushed = 0;
  for (const d of due) {
    const message = template(d);

    // unique (habit_id, local_date): if another run already created it, nothing comes back and we skip
    const { data: inserted, error: insertError } = await admin
      .from('nudges')
      .upsert(
        { user_id: d.user_id, habit_id: d.habit_id, local_date: d.local_date, message },
        { onConflict: 'habit_id,local_date', ignoreDuplicates: true },
      )
      .select('id');
    if (insertError || !inserted || inserted.length === 0) continue;
    created++;
    const nudgeId = inserted[0].id as string;

    const { data: tokens } = await admin.from('push_tokens').select('token').eq('user_id', d.user_id);
    const messages = (tokens ?? []).map((t: { token: string }) => ({
      to: t.token,
      title: d.habit_name,
      body: message,
      sound: 'default',
      channelId: 'nudges',
      data: { nudgeId, habitId: d.habit_id },
    }));
    if (messages.length === 0) continue;

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(8000),
    });
    const out = await res.json().catch(() => null);
    const tickets: Array<{ status: string; details?: { error?: string } }> = out?.data ?? [];
    for (let i = 0; i < tickets.length; i++) {
      if (tickets[i].status === 'error' && tickets[i].details?.error === 'DeviceNotRegistered') {
        await admin.from('push_tokens').delete().eq('token', messages[i].to); // prune dead tokens
      }
    }
    if (res.ok) {
      pushed += messages.length;
      await admin.from('nudges').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', nudgeId);
    }
  }

  return json({ ok: true, due: due.length, created, pushed });
});
