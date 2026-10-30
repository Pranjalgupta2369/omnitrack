import type { Stats, TodayRow, WeekRow } from './types';

function supportStage(handsFree: number, completed: number) {
  if (completed < 3) return 'Building a baseline';
  const share = handsFree / completed;
  if (share >= 0.7) return 'Strong hub support';
  if (share >= 0.25) return 'Some hub support';
  return 'Mostly manual support';
}

export type BehavioralInsight = {
  frictionReductionPercent: number;
  weeklyConsistencyPercent: number;
  observedLogs: number;
  handsFreeLogs: number;
  activeDays: number;
  automationSupport: string;
  foggPrompt: string;
  foggAbility: string;
  foggMotivation: string;
  evidence: string;
  shieldMessage: string;
  nudgeTitle: string;
  nudge: string;
};

export function buildBehavioralInsight(today: TodayRow[], stats: Stats | null, week: WeekRow[]): BehavioralInsight {
  const completed = week.reduce((sum, day) => sum + day.completed, 0);
  const handsFree = week.reduce((sum, day) => sum + day.hands_free, 0);
  const activeDays = week.filter((day) => day.completed > 0).length;
  const streak = stats?.current_streak ?? 0;
  const shields = stats?.shields ?? 0;
  const nextShield = 7 - (streak % 7);
  const shieldMessage = shields >= 2 ? 'Shield capacity is full.' : `${nextShield} ${nextShield === 1 ? 'day' : 'days'} until the next streak shield.`;
  const nextHabit = today.find((habit) => habit.status === 'due') ?? today.find((habit) => habit.status === 'upcoming');
  const automationSupport = supportStage(handsFree, completed);
  const foggPrompt = !nextHabit ? 'Prompt: no scheduled cue is coming up right now.'
    : `Prompt: ${nextHabit.name} ${nextHabit.status === 'due' ? `is due until ${nextHabit.window_end.slice(0, 5)}` : `is scheduled for ${nextHabit.window_start.slice(0, 5)}`}.`;
  const foggAbility = !nextHabit ? 'Ability: choose a small, easy next action when your next routine appears.'
    : `Ability: ${nextHabit.logging_method === 'manual' ? 'a quick manual check-in is available' : `your ${nextHabit.logging_method === 'rfid' ? 'RFID cue' : 'presence hub'} can reduce phone steps`}.`;
  const evidence = `Last 7 days: ${handsFree} of ${completed} logged events used a hub across ${activeDays} active ${activeDays === 1 ? 'day' : 'days'}.`;

  if (!nextHabit) {
    return {
      frictionReductionPercent: completed ? Math.round((handsFree / completed) * 100) : 0,
      weeklyConsistencyPercent: Math.round((activeDays / 7) * 100),
      observedLogs: completed,
      handsFreeLogs: handsFree,
      activeDays,
      automationSupport,
      foggPrompt,
      foggAbility,
      foggMotivation: 'Motivation is not measured, so OmniTrack does not guess it.',
      evidence,
      shieldMessage,
      nudgeTitle: 'Today’s next step',
      nudge: 'You have no upcoming scheduled habits today. Keep your next cue visible so it is easy to act when the time comes.',
    };
  }

  const time = nextHabit.window_start.slice(0, 5);
  const nudge = nextHabit.category === 'medication'
    ? nextHabit.status === 'due'
      ? `Your ${nextHabit.name} window is open until ${nextHabit.window_end.slice(0, 5)}. If you take it, log it afterward; this habit is tracked and reminded, never gamified.`
      : `Your ${nextHabit.name} window starts at ${time}. If you take it, log it afterward; this habit is tracked and reminded, never gamified.`
    : nextHabit.status === 'due'
      ? `Your ${nextHabit.name} window is open until ${nextHabit.window_end.slice(0, 5)}. Put the cue where you will see it, and let ${nextHabit.logging_method === 'manual' ? 'a quick check-in' : 'the hub'} make the next step easier.`
      : `Your ${nextHabit.name} window starts at ${time}. Put the cue where you will see it, and let ${nextHabit.logging_method === 'manual' ? 'a quick check-in' : 'the hub'} make the next step easier.`;

  return {
    frictionReductionPercent: completed ? Math.round((handsFree / completed) * 100) : 0,
    weeklyConsistencyPercent: Math.round((activeDays / 7) * 100),
    observedLogs: completed,
    handsFreeLogs: handsFree,
    activeDays,
    automationSupport,
    foggPrompt,
    foggAbility,
    foggMotivation: 'Motivation is not measured, so OmniTrack does not guess it.',
    evidence,
    shieldMessage,
    nudgeTitle: nextHabit.status === 'due' ? 'A habit is due now' : 'Coming up next',
    nudge,
  };
}
