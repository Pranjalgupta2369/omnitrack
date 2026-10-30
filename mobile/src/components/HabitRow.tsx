import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, mono } from '@/lib/theme';
import type { TodayRow } from '@/lib/types';

const hm = (t: string) => t.slice(0, 5);
const METHOD_LABEL = { rfid: 'RFID tag', ultrasonic: 'Presence', manual: 'Manual' } as const;

type Props = { row: TodayRow; onLog: (row: TodayRow) => void };

export function HabitRow({ row, onLog }: Props) {
  const done = row.status === 'done';
  const byHub = done && row.logged_method !== null && row.logged_method !== 'manual';

  let statusText = '';
  let statusColor: string = colors.dim;
  if (done && row.logged_at) {
    const at = new Date(row.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    statusText = `${at} · ${byHub ? 'by hub' : 'by hand'}`;
    statusColor = byHub ? colors.signal : colors.relay;
  } else if (row.status === 'due') {
    statusText = 'Due now';
    statusColor = colors.warn;
  } else if (row.status === 'missed') {
    statusText = 'Window closed';
    statusColor = colors.miss;
  } else {
    statusText = `Opens ${hm(row.window_start)}`;
  }

  return (
    <View style={styles.row}>
      <View style={styles.icon}>
        {done ? (
          <Ionicons name={byHub ? 'hardware-chip' : 'hand-left'} size={22} color={statusColor} />
        ) : (
          <Ionicons name="ellipse-outline" size={22} color={colors.dim} />
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.name}>{row.name}</Text>
        <Text style={styles.meta}>
          {hm(row.window_start)}–{hm(row.window_end)}
        </Text>
        <View style={[styles.methodPill, row.logging_method === 'ultrasonic' ? styles.presencePill : row.logging_method === 'manual' ? styles.manualPill : styles.rfidPill]}>
          <Text style={styles.methodText}>{METHOD_LABEL[row.logging_method]}</Text>
        </View>
        {row.category === 'medication' ? <Text style={styles.safety}>Tracked &amp; reminded · never gamified</Text> : null}
        <Text style={[styles.status, { color: statusColor }]}>{statusText}</Text>
      </View>

      {!done && (
        <Pressable accessibilityRole="button" onPress={() => onLog(row)} style={styles.btn}>
          <Text style={styles.btnText}>Log</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  icon: { width: 28, alignItems: 'center' },
  body: { flex: 1, gap: 2 },
  name: { color: colors.text, fontSize: 15, fontWeight: '500' },
  meta: { color: colors.dim, fontSize: 12, fontFamily: mono },
  status: { fontSize: 12, fontFamily: mono },
  safety: { color: colors.warn, fontSize: 11, marginTop: 2 },
  methodPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 3 },
  rfidPill: { backgroundColor: 'rgba(34,211,238,0.12)' },
  presencePill: { backgroundColor: 'rgba(99,102,241,0.18)' },
  manualPill: { backgroundColor: colors.panel2 },
  methodText: { color: colors.text, fontSize: 10, fontWeight: '600' },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
  },
  btnText: { color: colors.text, fontSize: 13, fontWeight: '500' },
});
