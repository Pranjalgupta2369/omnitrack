'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

type Device = { id: string; label: string; last_seen_at: string | null };
type IngestResult = { ok?: boolean; logged?: boolean; error?: string; reason?: string; habit?: string; xp?: number; total_xp?: number; level?: number; streak?: number };

export default function Simulator() {
  const supabase = useMemo(() => createClient(), []);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [deviceKey, setDeviceKey] = useState('');
  const [tagUid, setTagUid] = useState('');
  const [hubLabel, setHubLabel] = useState('My Desk Hub');
  const [location, setLocation] = useState('Desk');
  const [oneTimeKey, setOneTimeKey] = useState('');
  const [result, setResult] = useState<{ status: number; body: IngestResult } | null>(null);
  const [display, setDisplay] = useState(['OMNITRACK HUB', 'Ready to connect', 'Register a hub below']);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadDevices = useCallback(async (preferredId?: string) => {
    const { data, error: loadError } = await supabase.from('devices').select('id,label,last_seen_at').order('created_at', { ascending: false });
    if (loadError) { setError(loadError.message); return; }
    const rows = (data ?? []) as Device[];
    setDevices(rows);
    setDeviceId((current) => preferredId ?? (rows.some((device) => device.id === current) ? current : rows[0]?.id ?? ''));
  }, [supabase]);

  useEffect(() => { void loadDevices(); }, [loadDevices]);

  async function registerHub() {
    const label = hubLabel.trim();
    if (!label) return setError('Give the hub a name first.');
    setBusy(true); setError(''); setResult(null); setOneTimeKey('');
    const { data, error: registerError } = await supabase.rpc('register_device', {
      p_label: label,
      p_location: location.trim() || null,
    });
    if (registerError) {
      setError(registerError.message);
      setBusy(false);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as { device_id?: string; api_key?: string } | null;
    if (!row?.device_id || !row.api_key) {
      setError('The hub was not returned by the registration function.');
      setBusy(false);
      return;
    }
    setDeviceId(row.device_id);
    setDeviceKey(row.api_key);
    setOneTimeKey(row.api_key);
    setDisplay(['HUB REGISTERED', 'Key ready · save it', 'Tap a sensor to test']);
    await loadDevices(row.device_id);
    setBusy(false);
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(oneTimeKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Clipboard access is unavailable. Select and copy the key manually.');
    }
  }

  async function send(method: 'rfid_tap' | 'ultrasonic_presence') {
    if (!deviceId || !deviceKey.trim()) return setError('Select a hub and enter its device key.');
    if (method === 'rfid_tap' && !tagUid.trim()) return setError('Enter the RFID tag UID.');
    setBusy(true); setError(''); setResult(null);
    setDisplay(['SENDING EVENT…', method === 'rfid_tap' ? 'RFID · ' + tagUid.trim().toUpperCase() : 'Presence sensor', 'POST · ingest-log']);
    try {
      const payload = { device_id: deviceId, method, ...(method === 'rfid_tap' ? { tag_uid: tagUid.trim().toUpperCase() } : {}), event_id: `sim-${Date.now()}` };
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ingest-log`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-device-key': deviceKey.trim() },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({ ok: false, error: 'invalid_response' })) as IngestResult;
      setResult({ status: response.status, body });
      if (!response.ok || body.ok === false) {
        setError(`Hub rejected the event: ${body.error ?? `HTTP ${response.status}`}.`);
        setDisplay(['EVENT REJECTED', (body.error ?? 'Check the request').slice(0, 20), `HTTP ${response.status}`]);
      } else if (body.logged) {
        setDisplay([`LOGGED · ${body.habit ?? 'Habit'}`.slice(0, 21), `${body.xp ?? 0} XP · total ${body.total_xp ?? '—'}`, `Streak ${body.streak ?? '—'} · Lv ${body.level ?? '—'}`]);
      } else {
        const reason = body.reason ?? 'not_logged';
        setDisplay([reason === 'duplicate' ? 'DUPLICATE EVENT' : 'NO HABIT MATCH', reason === 'no_active_habit' ? 'No presence habit now' : 'No new log created', 'Inspect response below']);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reach the Supabase function.');
      setDisplay(['NETWORK ERROR', 'Event not confirmed', 'Check connection']);
    } finally {
      setBusy(false);
      await loadDevices(deviceId);
    }
  }

  return (
    <>
      <h1>Desk Hub Simulator</h1>
      <p className="sub">Register a test hub, then send RFID or presence events through the real Supabase ingest function. Keys stay in this page’s memory only.</p>
      {error ? <p className="err" role="alert">{error}</p> : null}
      <section className="card stack simulator-card">
        <div><span className="eyebrow">Step 1 · Your device</span><h2>Register or select a hub</h2></div>
        <div className="simulator-grid">
          <label>New hub name<input value={hubLabel} onChange={(event) => setHubLabel(event.target.value)} maxLength={60} /></label>
          <label>Location (optional)<input value={location} onChange={(event) => setLocation(event.target.value)} /></label>
        </div>
        <button className="primary fit" disabled={busy || !hubLabel.trim()} onClick={() => void registerHub()}>{busy ? 'Working…' : '＋ Register a test hub'}</button>
        {oneTimeKey ? <div className="key-notice" role="status">
          <strong>Save this one-time key now</strong>
          <p>Supabase stores only its hash. This raw value is shown only here and is not persisted by OmniTrack.</p>
          <code>{oneTimeKey}</code>
          <button className="ghost" onClick={() => void copyKey()}>{copied ? 'Copied' : 'Copy key'}</button>
        </div> : null}
        <label>Registered hub
          <select value={deviceId} onChange={(event) => { setDeviceId(event.target.value); setDeviceKey(''); setOneTimeKey(''); }}>
            {devices.length ? devices.map((device) => <option value={device.id} key={device.id}>{device.label} · {device.id.slice(0, 8)}</option>) : <option value="">No hubs found</option>}
          </select>
        </label>
        <label>Device key (shown once when the hub was created)
          <input type="password" autoComplete="off" value={deviceKey} onChange={(event) => setDeviceKey(event.target.value)} />
        </label>
      </section>
      <div className="simulator-grid simulator-main">
        <section className="card stack">
          <div><span className="eyebrow">Step 2 · Sensor event</span><h2>Try a virtual tap</h2></div>
          <label>RFID tag UID<input value={tagUid} onChange={(event) => setTagUid(event.target.value.toUpperCase())} placeholder="04A21B7C" autoCapitalize="characters" /></label>
          <div className="row">
            <button className="primary" disabled={busy || !deviceId || !deviceKey.trim() || !tagUid.trim()} onClick={() => void send('rfid_tap')}>{busy ? 'Sending…' : 'Tap RFID tag'}</button>
            <button className="ghost" disabled={busy || !deviceId || !deviceKey.trim()} onClick={() => void send('ultrasonic_presence')}>Trigger presence</button>
          </div>
          <p className="dim">Presence logs only when an active ultrasonic habit matches the current user, weekday and time window.</p>
        </section>
        <section className="card oled-card" aria-label="Virtual OLED display">
          <span className="eyebrow">Virtual SSD1306 · 128×64</span>
          <div className="oled-screen">{display.map((line, index) => <span key={index}>{line}</span>)}</div>
          <small>Preview of hub feedback; no physical device is connected.</small>
        </section>
      </div>
      {result ? <section className="card section"><div className="section-heading"><h2>Ingest response</h2><span className="dim">HTTP {result.status}</span></div><pre>{JSON.stringify(result.body, null, 2)}</pre><p className="dim">XP, level, and streak values come from the database response. The simulator does not calculate rewards.</p></section> : null}
    </>
  );
}
