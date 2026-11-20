import { describe, expect, it } from 'vitest';
import { AI_TRIAL_MESSAGES, getPlanState } from './plan';
import type { Subscription } from '../types';

const NOW = new Date('2026-11-20T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function sub(patch: Partial<Subscription> = {}): Subscription {
  return {
    user_id: 'u1',
    plan: 'free',
    status: 'active',
    current_period_end: null,
    trial_messages_used: 0,
    ...patch,
  };
}

const endIn = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

describe('getPlanState', () => {
  it('treats a user with no row as free with the full trial', () => {
    expect(getPlanState(null, NOW)).toEqual({ isPremium: false, trialLeft: AI_TRIAL_MESSAGES });
  });

  it('counts down the trial and never goes below zero', () => {
    expect(getPlanState(sub({ trial_messages_used: 4 }), NOW).trialLeft).toBe(AI_TRIAL_MESSAGES - 4);
    expect(getPlanState(sub({ trial_messages_used: 99 }), NOW).trialLeft).toBe(0);
  });

  it('treats a hand-granted premium with no period end as premium', () => {
    expect(getPlanState(sub({ plan: 'premium' }), NOW)).toEqual({ isPremium: true, trialLeft: 0 });
  });

  it('keeps a canceled subscription premium until its period ends', () => {
    expect(getPlanState(sub({ plan: 'premium', status: 'canceled', current_period_end: endIn(DAY) }), NOW).isPremium).toBe(true);
  });

  it('allows a 3-day grace after the period ends, then locks', () => {
    expect(getPlanState(sub({ plan: 'premium', current_period_end: endIn(-2 * DAY) }), NOW).isPremium).toBe(true);
    expect(getPlanState(sub({ plan: 'premium', current_period_end: endIn(-4 * DAY) }), NOW).isPremium).toBe(false);
  });

  it('does not treat a canceled subscription with no end date as premium', () => {
    expect(getPlanState(sub({ plan: 'premium', status: 'canceled' }), NOW).isPremium).toBe(false);
  });

  it('ignores a free plan even with a future period end', () => {
    expect(getPlanState(sub({ plan: 'free', current_period_end: endIn(DAY) }), NOW).isPremium).toBe(false);
  });
});
