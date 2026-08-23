import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function useBalance(startingBalance: number | undefined) {
  const { user } = useAuth();
  const [netFromTransactions, setNetFromTransactions] = useState(0);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('transactions').select('type, amount').eq('user_id', user.id);
    const net = (data ?? []).reduce(
      (sum, t) => sum + (t.type === 'income' ? Number(t.amount) : -Number(t.amount)),
      0
    );
    setNetFromTransactions(net);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const balance = (startingBalance ?? 0) + netFromTransactions;

  return { balance, loading, refetch };
}
