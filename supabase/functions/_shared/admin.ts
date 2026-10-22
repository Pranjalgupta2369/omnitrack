// Shared helpers for Edge Functions. The secret key bypasses RLS: it must only ever live in function secrets.
import { createClient } from 'npm:@supabase/supabase-js@2';

function secretKey(): string {
  // New-style keys: SUPABASE_SECRET_KEYS is a JSON object keyed by name; legacy: SUPABASE_SERVICE_ROLE_KEY.
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const key = (JSON.parse(raw) as Record<string, string>)['default'];
      if (key) return key;
    } catch { /* fall through to the legacy variable */ }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  throw new Error('No secret key found in the Edge Function environment');
}

export const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
