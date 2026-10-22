import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AddHabitSheet } from '@/components/AddHabitSheet';
import { Screen, card } from '@/components/Screen';
import { useDashboard } from '@/lib/dashboard';
import { supabase } from '@/lib/supabase';
import { colors, mono } from '@/lib/theme';
import type { Habit } from '@/lib/types';

const hm = (t: string) => t.slice(0, 5);
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Habits() {
  const { refresh } = useDashboard();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('habits')
      .select('id,name,category,logging_method,tag_uid,window_start,window_end,days,gamified,active')
      .order('window_start');
    if (error) Alert.alert('Could not load habits', error.message);
    else setHabits((data ?? []) as Habit[]);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function setActive(id: string, active: boolean) {
    const { error } = await supabase.from('habits').update({ active }).eq('id', id);
    if (error) Alert.alert('Could not update', error.message);
    await load();
    await refresh();
  }

  return (
    <Screen>
      <View style={styles.head}>
        <Text style={styles.h1}>Habits</Text>
        <Pressable accessibilityRole="button" style={styles.add} onPress={() => setAdding(true)}>
          <Text style={styles.addText}>Add</Text>
        </Pressable>
      </View>

      <View style={card}>
        {habits.length === 0 && <Text style={styles.empty}>No habits yet. Add one, then pair its tag or pick a presence window.</Text>}
        {habits.map((h, i) => (
          <View key={h.id} style={[styles.row, i > 0 && styles.divider]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.name, !h.active && { color: colors.dim }]}>{h.name}</Text>
              <Text style={styles.meta}>
                {h.category} · {hm(h.window_start)}–{hm(h.window_end)} · {h.logging_method}
                {h.tag_uid ? ` · ${h.tag_uid}` : h.logging_method === 'rfid' ? ' · tag not paired' : ''}
              </Text>
              <Text style={styles.meta}>
                {h.days.length === 7 ? 'every day' : h.days.map((d) => DAY[d - 1]).join(' ')}
                {h.gamified ? '' : ' · tracking only'}
              </Text>
            </View>
            <Switch value={h.active} onValueChange={(v) => void setActive(h.id, v)}
              trackColor={{ false: colors.line, true: colors.signal }} />
          </View>
        ))}
      </View>

      <AddHabitSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onSaved={() => { setAdding(false); void load(); void refresh(); }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h1: { color: colors.text, fontSize: 28, fontWeight: '600' },
  add: { backgroundColor: colors.signal, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  addText: { color: '#062330', fontWeight: '600' },
  empty: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.lineSoft },
  name: { color: colors.text, fontSize: 15, fontWeight: '500' },
  meta: { color: colors.dim, fontSize: 12, fontFamily: mono },
});
