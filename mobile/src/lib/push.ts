import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// Show nudges even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPush(): Promise<{ ok: boolean; message: string }> {
  if (!Device.isDevice) return { ok: false, message: 'Push needs a physical phone.' };
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('nudges', {
        name: 'Nudges',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    const status = existing.granted ? existing : await Notifications.requestPermissionsAsync();
    if (!status.granted) return { ok: false, message: 'Notification permission was not granted.' };

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return { ok: false, message: 'Missing EAS projectId. Run `eas init` (see README).' };

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: 'Reminders are on for this phone.' };
  } catch (e) {
    // Android remote push does not work inside Expo Go (SDK 53+): a development build is required.
    return { ok: false, message: `Push is unavailable here (${(e as Error).message}). Use a development build.` };
  }
}
