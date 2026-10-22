# Firmware notes (ESP32, Arduino IDE)

The hub talks to **one** endpoint now: `POST /functions/v1/ingest-log`. Contract, status codes and what to do on each:
see `docs/ARCHITECTURE.md`. Test the backend first with `node scripts/simulate-hub.mjs` so firmware bugs and backend
bugs never get mixed up.

Wiring (unchanged): HC-SR04 TRIG 27 / ECHO 26 (via a 1k+2k divider, ECHO is 5 V), MFRC522 3.3 V only on SS 5, SCK 18,
MOSI 23, MISO 19, RST 4, SSD1306 I2C on SDA 21 / SCL 22.

## Minimal POST (not compiled here: verify on your board)
```cpp
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>

const char* SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const char* DEVICE_ID    = "00000000-0000-0000-0000-000000000000";  // shown in the app when you add the hub
const char* DEVICE_KEY   = "PASTE-THE-64-CHAR-KEY";                // shown once

Preferences prefs;
uint32_t bootId = 0, counter = 0;

void initEventIds() {                    // call once in setup(): unique event ids across reboots
  prefs.begin("omnitrack", false);
  bootId = prefs.getUInt("boot", 0) + 1;
  prefs.putUInt("boot", bootId);
}
String nextEventId() { return String("b") + bootId + "-" + (++counter); }

String uidToHex(const byte* buf, byte len) {
  String s;
  for (byte i = 0; i < len; i++) { if (buf[i] < 0x10) s += "0"; s += String(buf[i], HEX); }
  s.toUpperCase();
  return s;
}

// Returns the HTTP status (0 = no network). 200 and 4xx: drop the event. 0 or 5xx: keep it queued and retry.
int postEvent(const char* method, const String& tagUid, const String& eventId) {
  WiFiClientSecure client;
  client.setInsecure();                  // DEV ONLY: skips certificate checks. Pin the root CA before you ship.
  HTTPClient http;
  if (!http.begin(client, String(SUPABASE_URL) + "/functions/v1/ingest-log")) return 0;
  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", DEVICE_KEY);

  String body = String("{\"device_id\":\"") + DEVICE_ID + "\",\"method\":\"" + method +
                "\",\"event_id\":\"" + eventId + "\"";
  if (tagUid.length()) body += String(",\"tag_uid\":\"") + tagUid + "\"";
  body += "}";

  int status = http.POST(body);
  if (status > 0) Serial.println(http.getString());   // e.g. {"ok":true,"logged":true,"xp":20,"streak":4,...}
  http.end();
  return status;
}
// RFID:     postEvent("rfid_tap", uidToHex(rfid.uid.uidByte, rfid.uid.size), nextEventId());
// Presence: postEvent("ultrasonic_presence", "", nextEventId());   // after sustained presence only
```

Offline: queue `{method, tag, eventId, millis}`; on reconnect, resend with the **same** `event_id` (the backend
dedupes). If you have NTP time, add `occurred_at` (ISO 8601 UTC) to queued events so XP and streaks land on the right
day. Events older than 7 days are rejected with 422.

Use the response for the OLED/LED: `xp`, `streak`, `level`, and `gamified:false` (medication) -> show a plain "Logged".
