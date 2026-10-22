import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { DashboardProvider } from '@/lib/dashboard';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
const icon = (name: IconName) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color} size={size} />;
  };

export default function TabsLayout() {
  const { session, loading } = useSession();
  if (loading) return null;
  if (!session) return <Redirect href="/login" />;

  return (
    <DashboardProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.signal,
          tabBarInactiveTintColor: colors.dim,
          tabBarStyle: { backgroundColor: colors.panel, borderTopColor: colors.line },
          sceneStyle: { backgroundColor: colors.void },
        }}>
        <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('today') }} />
        <Tabs.Screen name="habits" options={{ title: 'Habits', tabBarIcon: icon('list') }} />
        <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: icon('trophy') }} />
        <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: icon('person') }} />
      </Tabs>
    </DashboardProvider>
  );
}
