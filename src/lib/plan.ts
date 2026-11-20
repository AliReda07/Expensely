import type { Subscription } from '../types';

/** Free AI messages every account gets once. The server is the authority (AI_TRIAL_MESSAGES);
 *  this only drives the counter shown before the first reply carries the real number. */
export const AI_TRIAL_MESSAGES = 10;

const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export interface PlanState {
  isPremium: boolean;
  /** Free trial messages remaining; 0 for premium users (the trial no longer applies). */
  trialLeft: number;
}

/**
 * Mirrors the database's is_premium(): a paid-up (or hand-granted) subscription, with a
 * 3-day grace after the period ends. Purely cosmetic -- it decides what the UI shows, while
 * the real check happens server-side on every AI request.
 */
export function getPlanState(sub: Subscription | null, now: Date = new Date()): PlanState {
  if (!sub) return { isPremium: false, trialLeft: AI_TRIAL_MESSAGES };

  const end = sub.current_period_end ? new Date(sub.current_period_end).getTime() : null;
  const isPremium =
    sub.plan === 'premium' &&
    ((end === null && sub.status === 'active') || (end !== null && end + GRACE_MS > now.getTime()));

  return {
    isPremium,
    trialLeft: isPremium ? 0 : Math.max(0, AI_TRIAL_MESSAGES - sub.trial_messages_used),
  };
}
