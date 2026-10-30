export type TodayHabit = {
  habit_id: string;
  name: string;
  category: string;
  logging_method: 'rfid' | 'ultrasonic' | 'manual';
  window_start: string;
  window_end: string;
  status: 'done' | 'due' | 'missed' | 'upcoming';
};

export type UserStats = { current_streak: number; shields: number };
export type WeekDay = { completed: number; hands_free: number };

function supportStage(handsFree: number, completed: number) {
  if (completed < 3) return 'Building a baseline';
  const share = handsFree / completed;
  if (share >= 0.7) return 'Strong hub support';
  if (share >= 0.25) return 'Some hub support';
  return 'Mostly manual support';
}

export function buildBehavioralInsight(today: TodayHabit[], stats: UserStats | null, week: WeekDay[]) {
  const completions = week.reduce((total, day) => total + day.completed, 0);
  const automatic = week.reduce((total, day) => total + day.hands_free, 0);
  const activeDays = week.filter((day) => day.completed > 0).length;
  const streak = stats?.current_streak ?? 0;
  const shields = stats?.shields ?? 0;
  const shieldDays = 7 - (streak % 7);
  const next = today.find((habit) => habit.status === 'due') ?? today.find((habit) => habit.status === 'upcoming');
  const automationSupport = supportStage(automatic, completions);
  const foggPrompt = !next ? 'Prompt: no scheduled cue is coming up right now.'
    : `Prompt: ${next.name} ${next.status === 'due' ? `is due until ${next.window_end.slice(0, 5)}` : `is scheduled for ${next.window_start.slice(0, 5)}`}.`;
  const foggAbility = !next ? 'Ability: choose a small, easy next action when your next routine appears.'
    : `Ability: ${next.logging_method === 'manual' ? 'a quick manual check-in is available' : `your ${next.logging_method === 'rfid' ? 'RFID cue' : 'presence hub'} can reduce phone steps`}.`;
  const evidence = `Last 7 days: ${automatic} of ${completions} logged events used a hub across ${activeDays} active ${activeDays === 1 ? 'day' : 'days'}.`;
  const nudge = !next
    ? 'You have no more scheduled habits today. Keep your next cue visible so it is easy to act when the time comes.'
    : next.category === 'medication'
      ? next.status === 'due'
        ? `Your ${next.name} window is open until ${next.window_end.slice(0, 5)}. If you take it, log it afterward; it is tracked and reminded, never gamified.`
        : `Your ${next.name} window starts at ${next.window_start.slice(0, 5)}. If you take it, log it afterward; it is tracked and reminded, never gamified.`
      : next.status === 'due'
        ? `Your ${next.name} window is open until ${next.window_end.slice(0, 5)}. Put the cue where you will see it, and let ${next.logging_method === 'manual' ? 'a quick check-in' : 'the hub'} make the next step easier.`
        : `Your ${next.name} window starts at ${next.window_start.slice(0, 5)}. Put the cue where you will see it, and let ${next.logging_method === 'manual' ? 'a quick check-in' : 'the hub'} make the next step easier.`;

  return {
    frictionReductionPercent: completions ? Math.round((automatic / completions) * 100) : 0,
    consistencyPercent: Math.round((activeDays / 7) * 100),
    observedLogs: completions,
    handsFreeLogs: automatic,
    activeDays,
    automationSupport,
    foggPrompt,
    foggAbility,
    foggMotivation: 'Motivation is not measured, so OmniTrack does not guess it.',
    evidence,
    shieldMessage: shields >= 2 ? 'Shield capacity is full.' : `${shieldDays} ${shieldDays === 1 ? 'day' : 'days'} until the next streak shield.`,
    nudge,
  };
}
