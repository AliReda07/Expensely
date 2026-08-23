import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Budget } from '../types';

export function useBudgets() {
  const { user } = useAuth();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('budgets').select('id, user_id, category_id, amount').eq('user_id', user.id);
    setBudgets(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const setBudget = async (categoryId: string, amount: number) => {
    if (!user) return { error: 'Not signed in' };
    const { error } = await supabase
      .from('budgets')
      .upsert({ user_id: user.id, category_id: categoryId, amount }, { onConflict: 'user_id,category_id' });
    if (!error) await refetch();
    return { error: error?.message ?? null };
  };

  const removeBudget = async (id: string) => {
    const { error } = await supabase.from('budgets').delete().eq('id', id);
    if (!error) await refetch();
    return { error: error?.message ?? null };
  };

  return { budgets, loading, setBudget, removeBudget, refetch };
}
