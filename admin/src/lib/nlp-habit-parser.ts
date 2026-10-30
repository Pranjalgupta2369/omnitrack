export type ParsedHabit = {
  name: string;
  category: 'hydration' | 'focus' | 'medication' | 'exercise' | 'recovery' | 'custom';
  logging_method: 'rfid' | 'ultrasonic' | 'manual';
  tag_uid: string | null;
  window_start: string | null;
  window_end: string | null;
  days: number[];
};

const dayNumbers: Record<string, number> = {
  mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5,
  sat: 6, saturday: 6, sun: 7, sunday: 7,
};

function parseTime(value: string, meridiem?: string): string | null {
  const match = value.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? '0');
  const suffix = meridiem?.toLowerCase();
  if (minute > 59 || (suffix ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (suffix) hour = (hour % 12) + (suffix === 'pm' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function parseWindow(input: string) {
  const match = input.match(/\b(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s*(?:-|to|–|—)\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)?\b/i);
  if (!match) return { start: null, end: null };
  return { start: parseTime(match[1], match[2] ?? match[4]), end: parseTime(match[3], match[4] ?? match[2]) };
}

function parseDays(input: string): number[] {
  const normalized = input.toLowerCase();
  if (/\b(daily|every day|everyday)\b/.test(normalized)) return [1, 2, 3, 4, 5, 6, 7];
  if (/\b(weekdays|mon\s*(?:-|to)\s*fri)\b/.test(normalized)) return [1, 2, 3, 4, 5];
  if (/\b(weekends|sat\s*(?:-|to)\s*sun)\b/.test(normalized)) return [6, 7];
  const found = new Set<number>();
  for (const match of normalized.matchAll(/\b(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/g)) {
    const day = dayNumbers[match[1]];
    if (day) found.add(day);
  }
  return found.size ? [...found].sort((a, b) => a - b) : [1, 2, 3, 4, 5, 6, 7];
}

export function parseHabitText(input: string): ParsedHabit {
  const uid = input.match(/\b(?:tag\s*)?([0-9a-f]{8,16})\b/i)?.[1]?.toUpperCase() ?? null;
  const method = /\b(rfid|tag)\b/i.test(input) ? 'rfid' : /\b(presence|ultrasonic|sensor)\b/i.test(input) ? 'ultrasonic' : 'manual';
  const lower = input.toLowerCase();
  const category: ParsedHabit['category'] = /\b(medication|medicine|tablet|pill|dose|blood pressure)\b/.test(lower) ? 'medication'
    : /\b(water|drink|hydration)\b/.test(lower) ? 'hydration'
    : /\b(study|work|focus|reading|session)\b/.test(lower) ? 'focus'
    : /\b(walk|run|exercise|workout|gym)\b/.test(lower) ? 'exercise'
    : /\b(sleep|rest|recovery|stretch|breath)\b/.test(lower) ? 'recovery' : 'custom';
  const window = parseWindow(input);
  const name = input.replace(/\b(?:every day|everyday|daily|weekdays|weekends|mon(?:day)?\s*(?:-|to)\s*fri|sat(?:urday)?\s*(?:-|to)\s*sun)\b/gi, '')
    .replace(/\b(?:from|between|at)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:(?:-|to|–|—)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/gi, '')
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|to|–|—)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, '')
    .replace(/\b(?:using|with)\s+(?:an?\s+)?(?:rfid\s*)?(?:tag|presence\s+sensor|ultrasonic\s+sensor)(?:\s+[0-9a-f]{8,16})?\b/gi, '')
    .replace(/\b(?:rfid|presence|ultrasonic|sensor)\b/gi, '').replace(/\b(?:tag\s*)?[0-9a-f]{8,16}\b/gi, '')
    .replace(/\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?\b/gi, '')
    .replace(/[,.]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { name, category, logging_method: method, tag_uid: uid, window_start: window.start, window_end: window.end, days: parseDays(input) };
}
