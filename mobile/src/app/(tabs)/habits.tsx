import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { AddHabitSheet } from '@/components/AddHabitSheet';
import { Chip } from '@/components/Chip';
import { Screen, card } from '@/components/Screen';
import { useDashboard } from '@/lib/dashboard';
import { supabase } from '@/lib/supabase';
import { colors, mono } from '@/lib/theme';
import { parseHabitText, type ParsedHabit } from '@/lib/nlp-habit-parser';
import type { Habit } from '@/lib/types';

const hm = (t: string) => t.slice(0, 5);
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STARTERS = [
  { label: '💧 Water + RFID', text: 'Drink water every day from 7am to 10pm with RFID tag 04A21B7C' },
  { label: '💻 Study + presence', text: 'Desk study session Mon to Fri 9:00-12:00 using presence sensor' },
  { label: '💊 Medication', text: 'Take blood pressure tablet every morning 8am to 9am' },
  { label: '🚶 Evening walk', text: 'Evening walk daily 6pm to 7:30pm' },
];

export default function Habits() {
  const { refresh } = useDashboard();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [adding, setAdding] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [initial, setInitial] = useState<ParsedHabit | null>(null);
  const parsed = useMemo(() => quickText.trim() ? parseHabitText(quickText) : null, [quickText]);

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
        <Text style={styles.sectionTitle}>Describe a habit</Text>
        <Text style={styles.helper}>Start from an example, then review the details before saving.</Text>
        <View style={styles.starters}>
          {STARTERS.map((starter) => (
            <Chip key={starter.label} label={starter.label} selected={quickText === starter.text}
              onPress={() => setQuickText(starter.text)} />
          ))}
        </View>
        <TextInput
          accessibilityLabel="Describe a habit in your own words"
          style={styles.quickInput}
          value={quickText}
          onChangeText={setQuickText}
          placeholder="Try: Drink water daily 8am-8pm with RFID tag 04A21B7C"
          placeholderTextColor={colors.dim}
        />
        {parsed ? (
          <>
            <View style={styles.pills}>
              {[parsed.name || 'Add a habit name', parsed.category, parsed.logging_method, parsed.window_start && parsed.window_end ? `${parsed.window_start.slice(0, 5)}–${parsed.window_end.slice(0, 5)}` : 'Choose a time window', parsed.days.length === 7 ? 'Daily' : parsed.days.map((d) => DAY[d - 1]).join(' · ')].map((pill) => (
                <Text key={pill} style={styles.pill}>{pill}</Text>
              ))}
            </View>
            {parsed.category === 'medication' ? <Text style={styles.safety}>Tracked &amp; reminded · never gamified</Text> : null}
            <Pressable accessibilityRole="button" style={styles.quickButton} onPress={() => { setInitial(parsed); setAdding(true); }}>
              <Text style={styles.quickButtonText}>Review &amp; create</Text>
            </Pressable>
          </>
        ) : null}
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
        initial={initial}
        onSaved={() => { setAdding(false); setQuickText(''); setInitial(null); void load(); void refresh(); }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h1: { color: colors.text, fontSize: 28, fontWeight: '600' },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 8 },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  starters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 4 },
  quickInput: { backgroundColor: colors.void, borderColor: colors.line, borderWidth: 1, borderRadius: 10, color: colors.text, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  pill: { color: colors.signal, backgroundColor: colors.panel2, borderRadius: 16, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5, fontSize: 11 },
  safety: { color: colors.warn, fontSize: 12, marginTop: 8 },
  quickButton: { backgroundColor: colors.signal, borderRadius: 8, padding: 10, alignItems: 'center', marginTop: 10 },
  quickButtonText: { color: '#062330', fontWeight: '600' },
  add: { backgroundColor: colors.signal, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  addText: { color: '#062330', fontWeight: '600' },
  empty: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.lineSoft },
  name: { color: colors.text, fontSize: 15, fontWeight: '500' },
  meta: { color: colors.dim, fontSize: 12, fontFamily: mono },
});
