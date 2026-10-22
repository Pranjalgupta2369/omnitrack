import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/lib/theme';

type Props = { children: ReactNode; onRefresh?: () => Promise<void> | void; refreshing?: boolean };

export function Screen({ children, onRefresh, refreshing = false }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.signal} />
          ) : undefined
        }>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export const card = {
  backgroundColor: colors.panel,
  borderColor: colors.line,
  borderWidth: 1,
  borderRadius: 14,
  padding: 16,
} as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.void },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
});
