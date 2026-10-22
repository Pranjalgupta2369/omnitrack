import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, mono } from '@/lib/theme';

type Props = { streak: number; shields: number };

// Duolingo has hearts; for habits the useful protection is a streak shield (earn 1 per 7-day streak, max 2).
export function StreakBadge({ streak, shields }: Props) {
  return (
    <View style={styles.wrap}>
      <Ionicons name="flame" size={22} color={streak > 0 ? colors.warn : colors.dim} />
      <Text style={styles.num}>{streak}</Text>
      <Text style={styles.unit}>day streak</Text>
      <View style={styles.shields}>
        {[0, 1].map((i) => (
          <Ionicons
            key={i}
            name={i < shields ? 'shield-checkmark' : 'shield-outline'}
            size={16}
            color={i < shields ? colors.signal : colors.dim}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  num: { color: colors.text, fontSize: 20, fontWeight: '600', fontFamily: mono },
  unit: { color: colors.muted, fontSize: 12 },
  shields: { flexDirection: 'row', gap: 3, marginLeft: 6 },
});
