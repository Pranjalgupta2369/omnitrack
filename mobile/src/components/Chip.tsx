import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '@/lib/theme';

type Props = { label: string; selected: boolean; onPress: () => void };

export function Chip({ label, selected, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.on]}>
      <Text style={[styles.text, selected && styles.textOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.void,
  },
  on: { borderColor: colors.signal, backgroundColor: 'rgba(34,211,238,0.12)' },
  text: { color: colors.muted, fontSize: 13 },
  textOn: { color: colors.signal, fontWeight: '600' },
});
