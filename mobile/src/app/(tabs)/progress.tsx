import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen, card } from '@/components/Screen';
import { XpBar } from '@/components/XpBar';
import { useDashboard } from '@/lib/dashboard';
import { supabase } from '@/lib/supabase';
import { colors, mono } from '@/lib/theme';
import type { Achievement } from '@/lib/types';

const TRACK = 100;
type IconName = ComponentProps<typeof Ionicons>['name'];

export default function Progress() {
  const { stats, week } = useDashboard();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [earned, setEarned] = useState<Set<string>>(new Set());
  const totalXp = stats?.total_xp ?? 0;

  // Re-read whenever XP changes: a new achievement usually arrives with the log that earned it.
  useEffect(() => {
    (async () => {
      const [a, e] = await Promise.all([
        supabase.from('achievements').select('id,title,description,icon,xp_reward,sort_order,metric,threshold').order('sort_order'),
        supabase.from('user_achievements').select('achievement_id'),
      ]);
      if (a.data) setAchievements(a.data as Achievement[]);
      if (e.data) setEarned(new Set((e.data as { achievement_id: string }[]).map((r) => r.achievement_id)));
    })();
  }, [totalXp]);

  const maxDay = Math.max(1, ...week.map((w) => w.completed));
  const weekDone = week.reduce((n, w) => n + w.completed, 0);
  const weekHub = week.reduce((n, w) => n + w.hands_free, 0);
  const floor = stats?.level_start_xp ?? 0;
  const ceil = stats?.next_level_xp ?? 25;
  const streak = stats?.current_streak ?? 0;
  const shields = stats?.shields ?? 0;
  const shieldDays = 7 - (streak % 7);

  return (
    <Screen>
      <Text style={styles.h1}>Progress</Text>

      <View style={card}>
        <Text style={styles.cardTitle}>Level {stats?.level ?? 1}</Text>
        <XpBar value={(totalXp - floor) / Math.max(1, ceil - floor)} />
        <Text style={styles.hint}>
          {totalXp} XP · longest streak {stats?.longest_streak ?? 0} days · {stats?.total_completions ?? 0} completions
        </Text>
      </View>

      <View style={card}>
        <Text style={styles.cardTitle}>Streak shield</Text>
        <Text style={styles.hint}>{shields >= 2 ? 'Shield capacity full · 2 of 2' : `${shieldDays} ${shieldDays === 1 ? 'day' : 'days'} until the next shield · ${shields} of 2 held`}</Text>
        <XpBar value={shields >= 2 ? 1 : (streak % 7) / 7} />
      </View>

      <View style={card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Last 7 days</Text>
          <Text style={styles.hint}>{weekDone ? `${weekHub}/${weekDone} hands-free` : 'no data yet'}</Text>
        </View>
        <View style={styles.bars}>
          {week.map((w) => {
            const manual = Math.max(0, w.completed - w.hands_free);
            const label = new Date(`${w.day}T12:00:00`).toLocaleDateString([], { weekday: 'short' }).slice(0, 3);
            return (
              <View key={w.day} style={styles.col}>
                <Text style={styles.num}>{w.completed}</Text>
                <View style={styles.track}>
                  <View style={{ height: Math.round((manual / maxDay) * TRACK), backgroundColor: colors.relay, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
                  <View style={{ height: Math.round((w.hands_free / maxDay) * TRACK), backgroundColor: colors.signal }} />
                </View>
                <Text style={styles.day}>{label}</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.legend}>
          <Text style={[styles.hint, { color: colors.signal }]}>■ hub</Text>
          <Text style={[styles.hint, { color: colors.relay }]}>■ by hand</Text>
        </View>
      </View>

      <View style={card}>
        <Text style={styles.cardTitle}>Achievements</Text>
        {achievements.map((a, i) => {
          const got = earned.has(a.id);
          const metricValue = stats?.[a.metric] ?? 0;
          return (
            <View key={a.id} style={[styles.ach, i > 0 && styles.divider]}>
              <Ionicons name={(got ? a.icon : 'lock-closed') as IconName} size={24} color={got ? colors.signal : colors.dim} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.achTitle, !got && { color: colors.muted }]}>{a.title}</Text>
                <Text style={styles.hint}>{a.description}</Text>
                {!got ? <Text style={styles.hint}>{metricValue} / {a.threshold}</Text> : null}
              </View>
              {a.xp_reward > 0 && <Text style={[styles.reward, got && { color: colors.signal }]}>+{a.xp_reward}</Text>}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.text, fontSize: 28, fontWeight: '600' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 8 },
  hint: { color: colors.dim, fontSize: 12, marginTop: 6 },
  bars: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  col: { alignItems: 'center', gap: 4, flex: 1 },
  num: { color: colors.muted, fontSize: 11, fontFamily: mono },
  track: { height: TRACK, justifyContent: 'flex-end', width: 26, backgroundColor: colors.lineSoft, borderRadius: 4, overflow: 'hidden' },
  day: { color: colors.dim, fontSize: 11 },
  legend: { flexDirection: 'row', gap: 16, marginTop: 8 },
  ach: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.lineSoft },
  achTitle: { color: colors.text, fontSize: 14, fontWeight: '500' },
  reward: { color: colors.dim, fontFamily: mono, fontSize: 12 },
});
