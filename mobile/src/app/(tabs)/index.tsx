import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { HabitRow } from '@/components/HabitRow';
import { ProgressRing } from '@/components/ProgressRing';
import { Screen, card } from '@/components/Screen';
import { StreakBadge } from '@/components/StreakBadge';
import { XpBar } from '@/components/XpBar';
import { XpToast } from '@/components/XpToast';
import { useDashboard } from '@/lib/dashboard';
import { buildBehavioralInsight } from '@/lib/behavioral-insights';
import { supabase } from '@/lib/supabase';
import { colors, mono } from '@/lib/theme';
import type { Stats, TodayRow } from '@/lib/types';

export default function Today() {
  const { today, stats, week, loading, error, refresh } = useDashboard();
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const done = today.filter((t) => t.status === 'done');
  const byHub = done.filter((t) => t.logged_method !== null && t.logged_method !== 'manual').length;
  const handsFree = done.length ? Math.round((byHub / done.length) * 100) : null;

  const level = stats?.level ?? 1;
  const floor = stats?.level_start_xp ?? 0;
  const ceil = stats?.next_level_xp ?? 25;
  const xp = stats?.total_xp ?? 0;
  const insight = buildBehavioralInsight(today, stats, week);

  async function logByHand(row: TodayRow) {
    const submit = async () => {
      const before = xp;
      const { error: insertError } = await supabase
        .from('logs')
        .insert({ habit_id: row.habit_id, method: 'manual' });
      if (insertError) {
        Alert.alert('Could not log', insertError.message);
        return;
      }
      const after = await supabase.rpc('my_stats');
      const gained = ((after.data as Stats[] | null)?.[0]?.total_xp ?? before) - before;
      if (row.category === 'medication') setToast({ text: 'Logged · Medication safety tracked', id: Date.now() });
      else if (gained > 0) setToast({ text: `+${gained} XP`, id: Date.now() });
      await refresh();
    };

    if (row.category === 'medication') {
      // The log is the source of truth for "did I take it", so make the tap deliberate.
      Alert.alert('Log this dose?', 'Only log it if you have actually taken it.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, I took it', onPress: () => void submit() },
      ]);
    } else {
      await submit();
    }
  }

  return (
    <View style={styles.root}>
      <Screen
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await refresh();
          setRefreshing(false);
        }}>
        <View>
          <Text style={styles.h1}>Today</Text>
          <Text style={styles.date}>
            {new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          <Text style={styles.date}>{today.filter((row) => row.status === 'due').length} due · {done.length} of {today.length} completed</Text>
        </View>

        <View style={card}>
          <View style={styles.coachHeading}>
            <Text style={styles.insightTitle}>OmniTrack Coach</Text>
            <Text style={styles.stage}>{insight.automationSupport}</Text>
          </View>
          <Text style={styles.coachSubtitle}>{insight.nudgeTitle}</Text>
          <Text style={styles.caption}>{insight.nudge}</Text>
          <View style={styles.meterTrack}>
            <View style={[styles.meterFill, { width: `${insight.frictionReductionPercent}%` }]} />
          </View>
          <Text style={styles.insightMeta}>{insight.evidence}</Text>
          <Text style={styles.insightMeta}>Weekly consistency: {insight.weeklyConsistencyPercent}% · {insight.shieldMessage}</Text>
          <View style={styles.modelBox}>
            <Text style={styles.modelTitle}>Fogg B=MAP lens</Text>
            <Text style={styles.modelText}>{insight.foggPrompt}</Text>
            <Text style={styles.modelText}>{insight.foggAbility}</Text>
            <Text style={styles.modelFootnote}>{insight.foggMotivation} Hub support is a logging proxy, not a measure of habit automaticity.</Text>
          </View>
        </View>

        <View style={card}>
          <View style={styles.levelRow}>
            <Text style={styles.level}>LVL {level}</Text>
            <Text style={styles.xp}>{xp} XP</Text>
          </View>
          <XpBar value={(xp - floor) / Math.max(1, ceil - floor)} />
          <Text style={styles.hint}>{Math.max(0, ceil - xp)} XP to level {level + 1}</Text>
          <View style={{ marginTop: 12 }}>
            <StreakBadge streak={stats?.current_streak ?? 0} shields={stats?.shields ?? 0} />
          </View>
        </View>

        <View style={[card, styles.ringCard]}>
          <ProgressRing
            value={today.length ? done.length / today.length : 0}
            label={`${done.length}/${today.length}`}
            sub="done today"
          />
          <View style={styles.ringText}>
            <Text style={styles.big}>{handsFree === null ? '—' : `${handsFree}%`}</Text>
            <Text style={styles.caption}>of today's habits were logged without opening an app</Text>
          </View>
        </View>

        <View style={card}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!loading && today.length === 0 && !error ? (
            <Text style={styles.caption}>Nothing scheduled today. Add a habit in the Habits tab.</Text>
          ) : null}
          {today.map((row, i) => (
            <View key={row.habit_id} style={i > 0 ? styles.divider : undefined}>
              <HabitRow row={row} onLog={(r) => void logByHand(r)} />
            </View>
          ))}
        </View>
      </Screen>
      <XpToast text={toast?.text ?? null} id={toast?.id ?? 0} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  h1: { color: colors.text, fontSize: 28, fontWeight: '600' },
  date: { color: colors.muted, fontSize: 14, marginTop: 2 },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  level: { color: colors.signal, fontFamily: mono, fontWeight: '600', fontSize: 14 },
  xp: { color: colors.text, fontFamily: mono, fontSize: 14 },
  hint: { color: colors.dim, fontSize: 12, marginTop: 6 },
  ringCard: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  ringText: { flex: 1, gap: 4 },
  big: { color: colors.signal, fontSize: 40, fontWeight: '600', fontFamily: mono },
  caption: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  divider: { borderTopWidth: 1, borderTopColor: colors.lineSoft },
  error: { color: colors.miss, fontSize: 13, marginBottom: 8 },
  insightTitle: { color: colors.signal, fontSize: 15, fontWeight: '600', marginBottom: 6 },
  insightMeta: { color: colors.dim, fontSize: 11, lineHeight: 16, marginTop: 8 },
  coachHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  coachSubtitle: { color: colors.text, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  stage: { color: colors.signal, backgroundColor: colors.panel2, borderRadius: 999, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, fontSize: 10, fontWeight: '600' },
  meterTrack: { height: 5, borderRadius: 99, backgroundColor: colors.line, overflow: 'hidden', marginTop: 12 },
  meterFill: { height: '100%', backgroundColor: colors.signal, borderRadius: 99 },
  modelBox: { marginTop: 12, padding: 11, gap: 4, backgroundColor: colors.panel2, borderRadius: 10 },
  modelTitle: { color: colors.text, fontSize: 12, fontWeight: '600' },
  modelText: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  modelFootnote: { color: colors.dim, fontSize: 10, lineHeight: 15, marginTop: 3 },
});
