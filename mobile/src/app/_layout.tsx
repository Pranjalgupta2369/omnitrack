import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import '@/lib/push'; // registers the foreground-notification handler
import { SessionProvider } from '@/lib/session';
import { colors } from '@/lib/theme';

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.void } }} />
    </SessionProvider>
  );
}
