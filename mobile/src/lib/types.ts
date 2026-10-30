export type Method = 'rfid' | 'ultrasonic' | 'manual';
export type EventMethod = 'rfid_tap' | 'ultrasonic_presence' | 'manual';
export type Category = 'medication' | 'exercise' | 'hydration' | 'recovery' | 'focus' | 'custom';

export const CATEGORIES: Category[] = ['medication', 'exercise', 'hydration', 'recovery', 'focus', 'custom'];
export const METHODS: { value: Method; label: string }[] = [
  { value: 'rfid', label: 'RFID tag' },
  { value: 'ultrasonic', label: 'Presence' },
  { value: 'manual', label: 'Manual' },
];

// Shapes returned by the SQL helpers in supabase/migrations (my_today, my_stats, my_week).
export interface TodayRow {
  habit_id: string;
  name: string;
  category: Category;
  logging_method: Method;
  window_start: string; // "HH:MM:SS"
  window_end: string;
  gamified: boolean;
  status: 'done' | 'due' | 'missed' | 'upcoming';
  logged_at: string | null;
  logged_method: EventMethod | null;
}

export interface Stats {
  total_xp: number;
  level: number;
  level_start_xp: number;
  next_level_xp: number;
  current_streak: number;
  longest_streak: number;
  shields: number;
  total_completions: number;
  hands_free_completions: number;
  active_today: boolean;
}

export interface WeekRow {
  day: string; // "YYYY-MM-DD"
  completed: number;
  hands_free: number;
}

export interface Habit {
  id: string;
  name: string;
  category: Category;
  logging_method: Method;
  tag_uid: string | null;
  window_start: string;
  window_end: string;
  days: number[];
  gamified: boolean;
  active: boolean;
}

export interface Device {
  id: string;
  label: string;
  location: string | null;
  last_seen_at: string | null;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  xp_reward: number;
  sort_order: number;
  metric: 'total_completions' | 'hands_free_completions' | 'current_streak' | 'longest_streak' | 'total_xp';
  threshold: number;
}
