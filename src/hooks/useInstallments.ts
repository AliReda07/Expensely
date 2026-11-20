import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { InstallmentPlan } from '../lib/installments';

const COLUMNS = 'id, name, monthly_amount, months_total, first_due_date, paid_count, cash_price';

export interface InstallmentInput {
  name: string;
  monthly_amount: number;
  months_total: number;
  first_due_date: string;
  paid_count: number;
  cash_price: number | null;
}

/** Turns a database error into something a person can act on. */
function friendlyError(message: string): string {
  if (message.includes('installment_limit_reached')) {
    return 'Free accounts can track 2 active installment plans. Premium removes the limit.';
  }
  return message;
}

export function useInstallments() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<InstallmentPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('installment_plans')
      .select(COLUMNS)
      .eq('user_id', user.id)
      .order('first_due_date', { ascending: true });
    // numeric columns can arrive as strings; the schedule math needs real numbers.
    setPlans(
      (data ?? []).map((p) => ({
        ...p,
        monthly_amount: Number(p.monthly_amount),
        cash_price: p.cash_price == null ? null : Number(p.cash_price),
      })),
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const addPlan = async (input: InstallmentInput) => {
    if (!user) return { error: 'Not signed in' };
    const { error } = await supabase.from('installment_plans').insert({ ...input, user_id: user.id });
    if (!error) await refetch();
    return { error: error ? friendlyError(error.message) : null };
  };

  const updatePlan = async (id: string, input: InstallmentInput) => {
    const { error } = await supabase.from('installment_plans').update(input).eq('id', id);
    if (!error) await refetch();
    return { error: error ? friendlyError(error.message) : null };
  };

  const deletePlan = async (id: string) => {
    const { error } = await supabase.from('installment_plans').delete().eq('id', id);
    if (!error) await refetch();
    return { error: error?.message ?? null };
  };

  /** Mark the next installment paid (+1) or undo a mis-tap (-1). */
  const adjustPaid = async (plan: InstallmentPlan, delta: 1 | -1) => {
    const paid = Math.min(plan.months_total, Math.max(0, plan.paid_count + delta));
    if (paid === plan.paid_count) return { error: null };
    const { error } = await supabase.from('installment_plans').update({ paid_count: paid }).eq('id', plan.id);
    if (!error) await refetch();
    return { error: error ? friendlyError(error.message) : null };
  };

  return { plans, loading, addPlan, updatePlan, deletePlan, adjustPaid, refetch };
}

/**
 * Average monthly income over the last 90 days, for the premium "share of income" insight.
 * Only fetches when `enabled`, so free users don't pay for a query they can't see.
 */
export function useAverageMonthlyIncome(enabled: boolean) {
  const { user } = useAuth();
  const [income, setIncome] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || !user) return;
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;
    void supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', user.id)
      .eq('type', 'income')
      .gte('date', sinceStr)
      .then(({ data }) => {
        const total = (data ?? []).reduce((sum, t) => sum + Number(t.amount), 0);
        setIncome(total / 3);
      });
  }, [enabled, user]);

  return income;
}
