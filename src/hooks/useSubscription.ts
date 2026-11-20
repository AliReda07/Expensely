import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getPlanState, type PlanState } from '../lib/plan';
import type { Subscription } from '../types';

/** The signed-in user's plan. Read-only: only the server can change a subscription. */
export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('subscriptions')
      .select('user_id, plan, status, current_period_end, trial_messages_used')
      .eq('user_id', user.id)
      .maybeSingle();
    setSubscription(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const planState: PlanState = getPlanState(subscription);
  return { subscription, ...planState, loading, refetch };
}
