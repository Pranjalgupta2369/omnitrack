import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export default function Login() {
  const { session, loading } = useSession();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (loading) return null;
  if (session) return <Redirect href="/" />;

  async function submit() {
    setBusy(true);
    setMessage(null);
    if (mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setMessage(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: name.trim() || undefined } },
      });
      if (error) setMessage(error.message);
      else if (!data.session) setMessage('Check your inbox to confirm your email, then sign in.');
    }
    setBusy(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <Text style={styles.brand}>
          Omni<Text style={{ color: colors.signal }}>Track</Text>
        </Text>
        <Text style={styles.tag}>Habits that log themselves.</Text>

        {mode === 'up' && (
          <TextInput style={styles.input} placeholder="Your name" placeholderTextColor={colors.dim}
            value={name} onChangeText={setName} />
        )}
        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.dim}
          autoCapitalize="none" autoComplete="email" keyboardType="email-address"
          value={email} onChangeText={setEmail} />
        <TextInput style={styles.input} placeholder="Password (6+ characters)" placeholderTextColor={colors.dim}
          secureTextEntry value={password} onChangeText={setPassword} />

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Pressable accessibilityRole="button" style={[styles.primary, busy && { opacity: 0.6 }]}
          onPress={() => void submit()} disabled={busy}>
          {busy ? <ActivityIndicator color="#062330" /> : <Text style={styles.primaryText}>{mode === 'in' ? 'Sign in' : 'Create account'}</Text>}
        </Pressable>

        <Pressable onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setMessage(null); }}>
          <Text style={styles.switch}>{mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.void },
  wrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  brand: { color: colors.text, fontSize: 38, fontWeight: '600', letterSpacing: -0.5 },
  tag: { color: colors.muted, marginBottom: 18, fontSize: 15 },
  input: {
    backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: 10,
    color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
  },
  message: { color: colors.warn, fontSize: 13 },
  primary: { backgroundColor: colors.signal, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryText: { color: '#062330', fontSize: 16, fontWeight: '600' },
  switch: { color: colors.muted, textAlign: 'center', marginTop: 8, fontSize: 14 },
});
