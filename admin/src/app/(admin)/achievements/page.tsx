import { createClient } from '@/lib/supabase/server';

import { createAchievement, recheckAll, remove, setActive } from './actions';

// Every page here reads the signed-in user's cookies, so none of it can be prerendered. Next 16 (Cache
// Components) asks you to say so explicitly; `instant = false` lets these routes render on request.
export const instant = false;

type Achievement = {
  id: string;
  title: string;
  description: string;
  icon: string;
  metric: string;
  threshold: number;
  xp_reward: number;
  sort_order: number;
  active: boolean;
};

const METRICS: [string, string][] = [
  ['total_completions', 'Total completions'],
  ['hands_free_completions', 'Hands-free completions'],
  ['current_streak', 'Current streak (days)'],
  ['longest_streak', 'Longest streak (days)'],
  ['total_xp', 'Total XP'],
];

export default async function AchievementsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('achievements').select('*').order('sort_order');
  const rows = (data ?? []) as Achievement[];

  return (
    <>
      <h1>Achievements</h1>
      <p className="sub">
        Rules are data: pick a metric and a threshold and the database awards it, with no app release needed. Changes
        reach users on their next log, or immediately with &quot;Re-check all users&quot;.
      </p>
      {error ? <p className="err">{error.message}</p> : null}

      <table>
        <thead>
          <tr>
            <th>Achievement</th>
            <th>Rule</th>
            <th>Reward</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className={a.active ? undefined : 'off'}>
              <td>
                <strong>{a.title}</strong>
                <div className="dim">{a.description}</div>
                <div className="dim mono">
                  {a.id} · icon {a.icon}
                </div>
              </td>
              <td className="mono">
                {a.metric} ≥ {a.threshold}
              </td>
              <td className="mono">{a.xp_reward ? `+${a.xp_reward} XP` : '—'}</td>
              <td>
                <div className="row">
                  <form action={setActive}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="active" value={String(!a.active)} />
                    <button className="ghost" type="submit">
                      {a.active ? 'Disable' : 'Enable'}
                    </button>
                  </form>
                  <form action={remove}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="ghost danger" type="submit">
                      Delete
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="row" style={{ marginTop: 12 }}>
        <form action={recheckAll}>
          <button className="ghost" type="submit">
            Re-check all users
          </button>
        </form>
      </div>

      <h2>Add an achievement</h2>
      <form action={createAchievement} className="stack">
        <div className="grid2">
          <label>
            ID (lowercase, a-z 0-9 _)
            <input name="id" pattern="[a-z0-9_]+" placeholder="streak_14" required />
          </label>
          <label>
            Title
            <input name="title" placeholder="Fortnight" required />
          </label>
        </div>
        <label>
          Description
          <input name="description" placeholder="Keep a 14-day streak." required />
        </label>
        <div className="grid2">
          <label>
            Metric
            <select name="metric" defaultValue="current_streak">
              {METRICS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Threshold
            <input name="threshold" type="number" min={1} defaultValue={14} required />
          </label>
          <label>
            XP reward
            <input name="xp_reward" type="number" min={0} defaultValue={75} />
          </label>
          <label>
            Icon (Ionicons name)
            <input name="icon" defaultValue="flame" />
          </label>
          <label>
            Sort order
            <input name="sort_order" type="number" defaultValue={35} />
          </label>
        </div>
        <button className="primary" type="submit">
          Add achievement
        </button>
      </form>
    </>
  );
}
