import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, mono } from '@/lib/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = { value: number; label: string; sub?: string; size?: number; stroke?: number };

export function ProgressRing({ value, label, sub, size = 132, stroke = 12 }: Props) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: Math.max(0, Math.min(1, value)),
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // SVG props can't use the native driver
    }).start();
  }, [value, progress]);

  const dashOffset = progress.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.line} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.signal}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={styles.label}>{label}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.text, fontSize: 30, fontWeight: '600', fontFamily: mono },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
