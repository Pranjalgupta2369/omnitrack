import { Platform } from 'react-native';

// Same palette as the pitch deck and the web prototype.
// cyan = "a sensor did this", indigo = "a person (or the AI) did this".
export const colors = {
  void: '#070B14',
  panel: '#0F1626',
  panel2: '#131C30',
  line: '#1E2A44',
  lineSoft: '#161F33',
  signal: '#22D3EE',
  relay: '#6366F1',
  text: '#E2E8F5',
  muted: '#7E8CA8',
  dim: '#55627C',
  ok: '#34D399',
  warn: '#FBBF24',
  miss: '#F87171',
} as const;

export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
