// POST /functions/v1/ingest-log   — called by the ESP32 hub.
//
// Auth is a per-device key in `x-device-key` (a microcontroller can't hold a user session), so this function
// is deployed with verify_jwt = false (see supabase/config.toml). All real logic lives in the Postgres function
// ingest_device_event(): this file only validates the HTTP shape, hashes the key and maps errors to status codes.
//
// Body: { "device_id": "<uuid>", "method": "rfid_tap" | "ultrasonic_presence",
//         "tag_uid": "04A21B7C",        // required for rfid_tap
//         "event_id": "boot17-0042",    // unique per event on this device -> safe retries
//         "occurred_at": "2026-10-12T08:31:02Z" }   // optional; omit if the hub has no reliable clock
import { admin, json } from '../_shared/admin.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS = new Set(['rfid_tap', 'ultrasonic_presence']);
const STATUS: Record<string, number> = {
  unauthorized: 401,
  invalid_method: 400,
  unknown_tag: 404,
  event_too_old: 422,
};

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const key = req.headers.get('x-device-key');
  if (!key) return json({ ok: false, error: 'unauthorized' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const { device_id, method, tag_uid, event_id, occurred_at } = body;
  if (typeof device_id !== 'string' || !UUID.test(device_id)) {
    return json({ ok: false, error: 'invalid_device_id' }, 400);
  }
  if (typeof method !== 'string' || !METHODS.has(method)) {
    return json({ ok: false, error: 'invalid_method' }, 400);
  }
  if (method === 'rfid_tap' && typeof tag_uid !== 'string') {
    return json({ ok: false, error: 'tag_uid_required' }, 400);
  }

  let occurredAt: string | null = null;
  if (occurred_at !== undefined && occurred_at !== null) {
    const ms = Date.parse(String(occurred_at));
    if (Number.isNaN(ms)) return json({ ok: false, error: 'invalid_occurred_at' }, 400);
    occurredAt = new Date(ms).toISOString();
  }

  const { data, error } = await admin.rpc('ingest_device_event', {
    p_device_id: device_id,
    p_key_hash: await sha256Hex(key),
    p_method: method,
    p_event_id: typeof event_id === 'string' ? event_id.slice(0, 64) : null,
    p_tag_uid: typeof tag_uid === 'string' ? tag_uid.slice(0, 64) : null,
    p_occurred_at: occurredAt,
  });

  if (error) {
    console.error('ingest_device_event failed', error);
    return json({ ok: false, error: 'server_error' }, 500);
  }
  const status = data?.ok === false ? (STATUS[data.error as string] ?? 400) : 200;
  return json(data, status);
});
