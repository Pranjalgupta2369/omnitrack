import { Link, Redirect, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export default function AuthScreen({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register';
  const { session, loading } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (loading) return null;
  if (session) return <Redirect href="/" />;

  async function submit() {
    setMessage(null);
    if (isRegister && name.trim().length < 2) return setMessage('Enter a name with at least 2 characters.');
    if (isRegister && password.length < 8) return setMessage('Use a password with at least 8 characters.');
    if (isRegister && password !== confirmation) return setMessage('The passwords do not match.');
    setBusy(true);
    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(), password,
          options: { data: { display_name: name.trim() } },
        });
        if (error) setMessage(error.message);
        else if (!data.session) setMessage('Account created. Check your email to confirm it, then sign in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (error) setMessage(error.message);
      }
    } catch {
      setMessage('Could not reach the sign-in service. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <Text style={styles.brand}>Omni<Text style={styles.accent}>Track</Text></Text>
        <Text style={styles.tag}>{isRegister ? 'Build a routine that fits your life.' : 'Habits that log themselves.'}</Text>
        {isRegister ? <TextInput style={styles.input} placeholder="Your name" placeholderTextColor={colors.dim}
          autoComplete="name" textContentType="name" maxLength={80} value={name} onChangeText={setName} /> : null}
        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.dim}
          autoCapitalize="none" autoComplete="email" textContentType="emailAddress"
          keyboardType="email-address" autoCorrect={false} value={email} onChangeText={setEmail} />
        <TextInput style={styles.input} placeholder={isRegister ? 'Password (8+ characters)' : 'Password'}
          placeholderTextColor={colors.dim} secureTextEntry autoComplete={isRegister ? 'new-password' : 'current-password'}
          textContentType={isRegister ? 'newPassword' : 'password'} value={password} onChangeText={setPassword} />
        {isRegister ? <TextInput style={styles.input} placeholder="Confirm password" placeholderTextColor={colors.dim}
          secureTextEntry autoComplete="new-password" textContentType="newPassword"
          value={confirmation} onChangeText={setConfirmation} /> : null}
        {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
        <Pressable accessibilityRole="button" style={[styles.primary, busy && { opacity: 0.6 }]}
          onPress={() => void submit()} disabled={busy}>
          {busy ? <ActivityIndicator color="#062330" /> : <Text style={styles.primaryText}>{isRegister ? 'Create account' : 'Sign in'}</Text>}
        </Pressable>
        <Text style={styles.switchText}>{isRegister ? 'Already have an account? ' : 'New here? '}
          <Link href={(isRegister ? '/login' : '/register') as Href} style={styles.link}>
            {isRegister ? 'Sign in' : 'Create an account'}
          </Link>
        </Text>
        {isRegister ? <Text style={styles.note}>Administrator access is granted separately.</Text> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.void },
  wrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' },
  brand: { color: colors.text, fontSize: 38, fontWeight: '600', letterSpacing: -0.5 },
  accent: { color: colors.signal },
  tag: { color: colors.muted, marginBottom: 12, fontSize: 15 },
  input: { backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: 10, color: colors.text, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  message: { color: colors.warn, fontSize: 13 },
  primary: { backgroundColor: colors.signal, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryText: { color: '#062330', fontSize: 16, fontWeight: '600' },
  switchText: { color: colors.muted, textAlign: 'center', marginTop: 8, fontSize: 14 },
  link: { color: colors.signal, fontWeight: '600' },
  note: { color: colors.dim, textAlign: 'center', fontSize: 12 },
});
