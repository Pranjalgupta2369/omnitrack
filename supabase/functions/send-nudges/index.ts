// Scheduled every 15 minutes by pg_cron (see supabase/cron.sql).
//
// Rule-based first: due_nudges() (SQL) decides WHO needs a nudge — window closed + grace, nothing logged today,
// outside quiet hours, scheduled weekday. This function writes the nudge row (unique per habit per day, so
// overlapping runs can't double-send), then pushes it through Expo's push service.
//
// Optional: set ANTHROPIC_API_KEY to have a model reword the sentence. It is skipped for medication habits and
// always falls back to the template on any error or timeout.
import { admin, json } from '../_shared/admin.ts';

const CRON_SECRET = Deno.env.get('CRON_SECRET');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
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
    return `Not logged yet. If you've already taken it, tap to log it. Only log it once you actually have.`;
  }
  return `Your window closed at ${hhmm(d.window_end)} and nothing's been logged yet. Still want to fit it in today?`;
}

async function reword(d: Due, fallback: string): Promise<string> {
  if (!ANTHROPIC_API_KEY || d.category === 'medication') return fallback;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-5-5',
        max_tokens: 80,
        system:
          'You write ONE push-notification sentence for a habit tracker. Max 18 words, friendly and specific, ' +
          'no emoji, no guilt, no health or medical claims. Output only the sentence.',
        messages: [{
          role: 'user',
          content: `Habit: ${d.habit_name} (${d.category}). Its window closed at ${hhmm(d.window_end)} and nothing was logged today.`,
        }],
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return fallback;
    const out = await res.json();
    const text: string | undefined = out?.content?.[0]?.text?.trim();
    return text && text.length <= 160 ? text : fallback;
  } catch {
    return fallback;
  }
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
    const message = await reword(d, template(d));

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
