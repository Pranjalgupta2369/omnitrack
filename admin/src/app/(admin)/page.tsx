import { createClient } from '@/lib/supabase/server';

// Every page here reads the signed-in user's cookies, so none of it can be prerendered. Next 16 (Cache
// Components) asks you to say so explicitly; `instant = false` lets these routes render on request.
export const instant = false;

type Overview = {
  users: number;
  devices: number;
  devices_seen_24h: number;
  logs_24h: number;
  hands_free_pct_7d: number | null;
};

export default async function OverviewPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_overview');
  const o = data as Overview | null;

  const cards: [string, string][] = o
    ? [
        ['Users', String(o.users)],
        ['Hubs', String(o.devices)],
        ['Hubs seen in 24h', String(o.devices_seen_24h)],
        ['Logs in 24h', String(o.logs_24h)],
        ['Hands-free, 7 days', o.hands_free_pct_7d === null ? '—' : `${o.hands_free_pct_7d}%`],
      ]
    : [];

  return (
    <>
      <h1>Overview</h1>
      <p className="sub">
        Aggregates only. By design this panel can&apos;t read any user&apos;s habits or logs, so a privacy-first product
        stays privacy-first for its own operators.
      </p>
      {error ? <p className="err">{error.message}</p> : null}
      <div className="cards">
        {cards.map(([k, v]) => (
          <div className="card" key={k}>
            <div className="k">{k}</div>
            <div className="v">{v}</div>
          </div>
        ))}
      </div>
    </>
  );
}
