import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { colors, mono } from '@/lib/theme';

// Flashes "+15 XP" for a moment. Pass a new `id` each time to replay it.
export function XpToast({ text, id }: { text: string | null; id: number }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!text) return;
    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1100),
      Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [text, id, opacity]);

  if (!text) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.toast, { opacity }]}>
      <Text style={styles.text}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: colors.panel2,
    borderColor: colors.signal,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  text: { color: colors.signal, fontSize: 15, fontWeight: '600', fontFamily: mono },
});
