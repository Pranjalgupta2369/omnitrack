// Pretends to be an ESP32 so you can test the whole backend before touching hardware.
//   export SUPABASE_URL=https://xxxx.supabase.co DEVICE_ID=<uuid> DEVICE_KEY=<key shown once in the app>
//   node scripts/simulate-hub.mjs rfid 04A21B7C
//   node scripts/simulate-hub.mjs presence
//   node scripts/simulate-hub.mjs rfid 04A21B7C 2026-10-12T08:31:00Z     # optional occurred_at
const { SUPABASE_URL, DEVICE_ID, DEVICE_KEY } = process.env;
const [kind, tag, occurredAt] = process.argv.slice(2);

if (!SUPABASE_URL || !DEVICE_ID || !DEVICE_KEY || !['rfid', 'presence'].includes(kind)) {
  console.error('usage: SUPABASE_URL=… DEVICE_ID=… DEVICE_KEY=… node scripts/simulate-hub.mjs <rfid TAG_UID | presence> [occurred_at]');
  process.exit(1);
}

const body = {
  device_id: DEVICE_ID,
  method: kind === 'rfid' ? 'rfid_tap' : 'ultrasonic_presence',
  event_id: `sim-${Date.now()}`,
  ...(kind === 'rfid' ? { tag_uid: tag } : {}),
  ...(occurredAt ? { occurred_at: occurredAt } : {}),
};

const res = await fetch(`${SUPABASE_URL}/functions/v1/ingest-log`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-device-key': DEVICE_KEY },
  body: JSON.stringify(body),
});
console.log(res.status, JSON.stringify(await res.json(), null, 2));
