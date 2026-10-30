import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen, card } from '@/components/Screen';
import { useSession } from '@/lib/session';
import { registerForPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { colors, mono } from '@/lib/theme';
import type { Device } from '@/lib/types';

type Reveal = { deviceId: string; apiKey: string; label: string };

function ago(iso: string | null) {
  if (!iso) return 'never seen';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return mins < 2 ? 'just now' : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`;
}

export default function You() {
  const { session } = useSession();
  const [name, setName] = useState('');
  const [tz, setTz] = useState('');
  const [quietStart, setQuietStart] = useState('22:30');
  const [quietEnd, setQuietEnd] = useState('07:00');
  const [grace, setGrace] = useState('20');
  const [devices, setDevices] = useState<Device[]>([]);
  const [hubLabel, setHubLabel] = useState('');
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [pushNote, setPushNote] = useState('');
  const [simKey, setSimKey] = useState('');
  const [simTag, setSimTag] = useState('');
  const [simResult, setSimResult] = useState('');
  const [simBusy, setSimBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, d] = await Promise.all([
      supabase.from('profiles').select('display_name,timezone,quiet_start,quiet_end,nudge_grace_min').single(),
      // list columns explicitly: the key hash column is not readable by the app
      supabase.from('devices').select('id,label,location,last_seen_at').order('created_at'),
    ]);
    if (p.data) { setName(p.data.display_name ?? ''); setTz(p.data.timezone); setQuietStart(p.data.quiet_start.slice(0, 5)); setQuietEnd(p.data.quiet_end.slice(0, 5)); setGrace(String(p.data.nudge_grace_min)); }
    if (d.data) setDevices(d.data as Device[]);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function saveTimezone() {
    const graceMinutes = Number(grace);
    if (!Number.isInteger(graceMinutes) || graceMinutes < 0 || graceMinutes > 240) return Alert.alert('Check grace period', 'Use a whole number from 0 to 240 minutes.');
    const { error } = await supabase.from('profiles').update({ timezone: tz.trim(), quiet_start: quietStart, quiet_end: quietEnd, nudge_grace_min: graceMinutes }).eq('id', session?.user.id ?? '');
    Alert.alert(error ? 'Not saved' : 'Saved', error ? error.message : 'Time zone and reminder preferences updated.');
  }

  async function simulate(method: 'rfid_tap' | 'ultrasonic_presence', deviceId: string) {
    if (!simKey.trim()) return Alert.alert('Enter the hub key');
    if (method === 'rfid_tap' && !simTag.trim()) return Alert.alert('Enter the RFID tag UID');
    setSimBusy(true); setSimResult('');
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ingest-log`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-device-key': simKey.trim() },
        body: JSON.stringify({ device_id: deviceId, method, ...(method === 'rfid_tap' ? { tag_uid: simTag.trim() } : {}), event_id: `mobile-demo-${Date.now()}` }),
      });
      const result = await response.json();
      setSimResult(JSON.stringify(result, null, 2));
      if (!response.ok) Alert.alert('Simulator response', `HTTP ${response.status}`);
    } catch (cause) {
      Alert.alert('Simulator failed', cause instanceof Error ? cause.message : 'Could not reach the ingest function.');
    } finally {
      setSimBusy(false);
    }
  }

  async function addHub() {
    if (!hubLabel.trim()) return Alert.alert('Name the hub first, e.g. "Study desk"');
    const { data, error } = await supabase.rpc('register_device', { p_label: hubLabel.trim() });
    if (error) return Alert.alert('Could not add hub', error.message);
    const row = (data as { device_id: string; api_key: string }[])[0];
    setReveal({ deviceId: row.device_id, apiKey: row.api_key, label: hubLabel.trim() });
    setHubLabel('');
    await load();
  }

  function rotate(d: Device) {
    Alert.alert(`Rotate key for ${d.label}?`, 'The old key stops working immediately. Update the hub firmware with the new one.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Rotate',
        style: 'destructive',
        onPress: async () => {
          const { data, error } = await supabase.rpc('rotate_device_key', { p_device: d.id });
          if (error) Alert.alert('Could not rotate', error.message);
          else setReveal({ deviceId: d.id, apiKey: data as string, label: d.label });
        },
      },
    ]);
  }

  return (
    <Screen>
      <Text style={styles.h1}>You</Text>

      <View style={card}>
        <Text style={styles.title}>{name || session?.user.email}</Text>
        <Text style={styles.label}>Time zone (IANA name)</Text>
        <View style={styles.presets}>
          {['Asia/Kolkata', 'UTC', 'Europe/London', 'America/New_York'].map((zone) => (
            <Pressable accessibilityRole="button" key={zone} style={styles.preset} onPress={() => setTz(zone)}><Text style={styles.presetText}>{zone}</Text></Pressable>
          ))}
        </View>
        <View style={styles.row}>
          <TextInput style={[styles.input, { flex: 1, fontFamily: mono }]} value={tz} onChangeText={setTz}
            autoCapitalize="none" placeholder="Asia/Kolkata" placeholderTextColor={colors.dim} />
          <Pressable accessibilityRole="button" style={styles.btn} onPress={() => void saveTimezone()}>
            <Text style={styles.btnText}>Save</Text>
          </Pressable>
        </View>
        <Text style={styles.label}>Quiet hours (24h) · nudge grace (minutes)</Text>
        <View style={styles.row}>
          <TextInput accessibilityLabel="Quiet hours start" style={[styles.input, { flex: 1, fontFamily: mono }]} value={quietStart} onChangeText={setQuietStart} placeholder="22:30" />
          <TextInput accessibilityLabel="Quiet hours end" style={[styles.input, { flex: 1, fontFamily: mono }]} value={quietEnd} onChangeText={setQuietEnd} placeholder="07:00" />
          <TextInput accessibilityLabel="Reminder grace minutes" style={[styles.input, { width: 76, fontFamily: mono }]} value={grace} onChangeText={setGrace} keyboardType="number-pad" />
        </View>
      </View>

      <View style={card}>
        <Text style={styles.title}>Demo simulator</Text>
        <Text style={styles.muted}>The key is sent only to the ingest function and is not stored in the app.</Text>
        <TextInput accessibilityLabel="Hub device key" style={[styles.input, { marginTop: 10, fontFamily: mono }]} value={simKey} onChangeText={setSimKey} placeholder="Paste device key for this demo" placeholderTextColor={colors.dim} secureTextEntry autoCapitalize="none" />
        <TextInput accessibilityLabel="RFID tag UID" style={[styles.input, { marginTop: 8, fontFamily: mono }]} value={simTag} onChangeText={setSimTag} placeholder="RFID tag UID" placeholderTextColor={colors.dim} autoCapitalize="characters" />
        {devices.map((device) => <View key={device.id} style={[styles.row, { marginTop: 8 }]}>
          <Text style={[styles.muted, { flex: 1 }]}>{device.label}</Text>
          <Pressable accessibilityRole="button" disabled={simBusy} style={styles.btn} onPress={() => void simulate('rfid_tap', device.id)}><Text style={styles.btnText}>{simBusy ? 'Sending…' : 'Tap RFID'}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={simBusy} style={styles.btn} onPress={() => void simulate('ultrasonic_presence', device.id)}><Text style={styles.btnText}>Presence</Text></Pressable>
        </View>)}
        {simResult ? <Text selectable style={[styles.mono, { marginTop: 10 }]}>{simResult}</Text> : null}
      </View>

      <View style={card}>
        <Text style={styles.title}>Desk hubs</Text>
        {devices.length === 0 && <Text style={styles.muted}>No hubs yet. Add one to get a device ID and key for the ESP32.</Text>}
        {devices.map((d, i) => (
          <View key={d.id} style={[styles.hub, i > 0 && styles.divider]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.hubName}>{d.label}</Text>
              <Text style={styles.meta}>{d.id.slice(0, 8)}… · {ago(d.last_seen_at)}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => rotate(d)}><Text style={styles.link}>Rotate key</Text></Pressable>
          </View>
        ))}
        <View style={[styles.row, { marginTop: 12 }]}>
          <TextInput style={[styles.input, { flex: 1 }]} value={hubLabel} onChangeText={setHubLabel}
            placeholder="Study desk" placeholderTextColor={colors.dim} />
          <Pressable accessibilityRole="button" style={styles.btn} onPress={() => void addHub()}>
            <Text style={styles.btnText}>Add hub</Text>
          </Pressable>
        </View>
      </View>

      <View style={card}>
        <Text style={styles.title}>Reminders</Text>
        <Text style={styles.muted}>Get a nudge when a habit's window closes with nothing logged.</Text>
        <Pressable accessibilityRole="button" style={[styles.btn, { marginTop: 10, alignSelf: 'flex-start' }]}
          onPress={async () => setPushNote((await registerForPush()).message)}>
          <Text style={styles.btnText}>Enable on this phone</Text>
        </Pressable>
        {pushNote ? <Text style={[styles.muted, { marginTop: 8 }]}>{pushNote}</Text> : null}
      </View>

      <Pressable accessibilityRole="button" style={styles.out} onPress={() => void supabase.auth.signOut()}>
        <Text style={styles.outText}>Sign out</Text>
      </Pressable>

      <Modal visible={reveal !== null} transparent animationType="fade" onRequestClose={() => setReveal(null)}>
        <View style={styles.scrim}>
          <View style={[card, styles.sheet]}>
            <Text style={styles.title}>{reveal?.label}</Text>
            <Text style={styles.warn}>Copy the key now. It is shown once and only its hash is stored.</Text>
            <Text style={styles.label}>Device ID</Text>
            <Text selectable style={styles.mono}>{reveal?.deviceId}</Text>
            <Text style={styles.label}>Device key</Text>
            <Text selectable style={styles.mono}>{reveal?.apiKey}</Text>
            <View style={[styles.row, { marginTop: 14 }]}>
              <Pressable accessibilityRole="button" style={styles.btn}
                onPress={() => void Clipboard.setStringAsync(`DEVICE_ID=${reveal?.deviceId}\nDEVICE_KEY=${reveal?.apiKey}`)}>
                <Text style={styles.btnText}>Copy both</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.btn} onPress={() => setReveal(null)}>
                <Text style={styles.btnText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.text, fontSize: 28, fontWeight: '600' },
  title: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 6 },
  label: { color: colors.muted, fontSize: 12, marginTop: 10, marginBottom: 4 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { backgroundColor: colors.void, borderColor: colors.line, borderWidth: 1, borderRadius: 10, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  btn: { backgroundColor: colors.panel2, borderColor: colors.line, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  btnText: { color: colors.text, fontWeight: '500', fontSize: 14 },
  hub: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.lineSoft },
  hubName: { color: colors.text, fontSize: 15, fontWeight: '500' },
  meta: { color: colors.dim, fontSize: 12, fontFamily: mono },
  link: { color: colors.signal, fontSize: 13 },
  out: { alignItems: 'center', paddingVertical: 14 },
  outText: { color: colors.miss, fontSize: 15 },
  scrim: { flex: 1, backgroundColor: 'rgba(4,7,14,0.8)', justifyContent: 'center', padding: 20 },
  sheet: { gap: 2 },
  warn: { color: colors.warn, fontSize: 12, lineHeight: 17, marginBottom: 6 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  preset: { backgroundColor: colors.panel2, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 5 },
  presetText: { color: colors.signal, fontSize: 10 },
  mono: { color: colors.text, fontFamily: mono, fontSize: 12 },
});
