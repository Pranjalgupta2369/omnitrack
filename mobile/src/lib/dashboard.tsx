import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useSession } from './session';
import { supabase } from './supabase';
import type { Stats, TodayRow, WeekRow } from './types';

type DashboardState = {
  today: TodayRow[];
  stats: Stats | null;
  week: WeekRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const DashboardContext = createContext<DashboardState | null>(null);

// One shared subscription for every tab. All the time-zone / status maths happens in SQL
// (my_today, my_stats, my_week), so this app never recomputes a streak or an XP total itself.
export function DashboardProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const userId = session?.user.id;
  const [today, setToday] = useState<TodayRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [week, setWeek] = useState<WeekRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [t, s, w] = await Promise.all([
      supabase.rpc('my_today'),
      supabase.rpc('my_stats'),
      supabase.rpc('my_week'),
    ]);
    const failure = t.error ?? s.error ?? w.error;
    setError(failure ? failure.message : null);
    if (t.data) setToday(t.data as TodayRow[]);
    if (s.data) setStats((s.data as Stats[])[0] ?? null);
    if (w.data) setWeek(w.data as WeekRow[]);
    setLoading(false);
  }, []);

  // First sign-in: profiles default to UTC, so adopt the phone's time zone once.
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase.from('profiles').select('timezone').single();
      const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (data?.timezone === 'UTC' && device && device !== 'UTC') {
        await supabase.from('profiles').update({ timezone: device }).eq('id', userId);
        await refresh();
      }
    })();
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) return;
    void refresh();
    const channel = supabase
      .channel('omnitrack-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'logs' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_stats' }, () => void refresh())
      .subscribe();
    const tick = setInterval(() => void refresh(), 60_000); // "due" -> "missed" changes with the clock
    return () => {
      clearInterval(tick);
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  return (
    <DashboardContext.Provider value={{ today, stats, week, loading, error, refresh }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardState {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used inside <DashboardProvider>');
  return ctx;
}
