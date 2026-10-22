import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/Chip';
import { supabase } from '@/lib/supabase';
import { colors, mono } from '@/lib/theme';
import { CATEGORIES, METHODS, type Category, type Method } from '@/lib/types';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // ISO weekdays 1..7
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

type Props = { visible: boolean; onClose: () => void; onSaved: () => void };

export function AddHabitSheet({ visible, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('custom');
  const [method, setMethod] = useState<Method>('rfid');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [tag, setTag] = useState('');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [busy, setBusy] = useState(false);

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  async function save() {
    if (!name.trim()) return Alert.alert('Name your habit');
    if (!TIME.test(start) || !TIME.test(end)) return Alert.alert('Use 24-hour times, like 08:30');
    if (end <= start) return Alert.alert('The window has to end after it starts');
    if (days.length === 0) return Alert.alert('Pick at least one day');

    setBusy(true);
    const { error } = await supabase.from('habits').insert({
      name: name.trim(),
      category,
      logging_method: method,
      tag_uid: method === 'rfid' && tag.trim() ? tag.trim() : null,
      window_start: start,
      window_end: end,
      days,
    });
    setBusy(false);
    if (error) {
      return Alert.alert('Could not save', error.code === '23505' ? 'That tag is already used by another active habit.' : error.message);
    }
    setName(''); setTag('');
    onSaved();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <Text style={styles.title}>New habit</Text>
            <Pressable onPress={onClose} accessibilityRole="button"><Text style={styles.cancel}>Cancel</Text></Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName}
              placeholder="Refill water bottle" placeholderTextColor={colors.dim} />

            <Text style={styles.label}>Category</Text>
            <View style={styles.wrap}>
              {CATEGORIES.map((c) => <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />)}
            </View>
            {category === 'medication' && (
              <Text style={styles.note}>
                Medication is tracked and reminded, but never earns XP or streaks, so there is no incentive to log a dose you did not take.
              </Text>
            )}

            <Text style={styles.label}>Detected by</Text>
            <View style={styles.wrap}>
              {METHODS.map((m) => <Chip key={m.value} label={m.label} selected={method === m.value} onPress={() => setMethod(m.value)} />)}
            </View>

            {method === 'rfid' && (
              <>
                <Text style={styles.label}>Tag UID (optional for now)</Text>
                <TextInput style={[styles.input, { fontFamily: mono }]} value={tag} onChangeText={setTag}
                  autoCapitalize="characters" placeholder="04A21B7C" placeholderTextColor={colors.dim} />
              </>
            )}

            <Text style={styles.label}>Window (24h)</Text>
            <View style={styles.row}>
              <TextInput style={[styles.input, styles.half, { fontFamily: mono }]} value={start} onChangeText={setStart}
                placeholder="09:00" placeholderTextColor={colors.dim} />
              <TextInput style={[styles.input, styles.half, { fontFamily: mono }]} value={end} onChangeText={setEnd}
                placeholder="10:00" placeholderTextColor={colors.dim} />
            </View>

            <Text style={styles.label}>Days</Text>
            <View style={styles.wrap}>
              {DAY_LABELS.map((d, i) => <Chip key={d} label={d} selected={days.includes(i + 1)} onPress={() => toggleDay(i + 1)} />)}
            </View>

            <Pressable accessibilityRole="button" style={[styles.save, busy && { opacity: 0.6 }]}
              onPress={() => void save()} disabled={busy}>
              <Text style={styles.saveText}>{busy ? 'Saving…' : 'Save habit'}</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.void },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  title: { color: colors.text, fontSize: 20, fontWeight: '600' },
  cancel: { color: colors.muted, fontSize: 16 },
  body: { padding: 16, gap: 10, paddingBottom: 48 },
  label: { color: colors.muted, fontSize: 13, marginTop: 8 },
  input: { backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: 10, color: colors.text, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  note: { color: colors.warn, fontSize: 12, lineHeight: 17 },
  save: { backgroundColor: colors.signal, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  saveText: { color: '#062330', fontSize: 16, fontWeight: '600' },
});
