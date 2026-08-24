import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Category, Transaction, TransactionType } from '../types';

export interface TransactionInput {
  type: TransactionType;
  amount: number;
  category_id: string | null;
  card_id: string | null;
  date: string;
  note: string | null;
}

interface Options {
  start?: string;
  end?: string;
  limit?: number;
}

export function useTransactions(categories: Category[], options: Options = {}) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const { start, end, limit } = options;

  const refetch = useCallback(async () => {
    if (!user) return;
    let query = supabase
      .from('transactions')
      .select('id, user_id, type, amount, category_id, card_id, date, note, created_at')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (start) query = query.gte('date', start);
    if (end) query = query.lte('date', end);
    if (limit) query = query.limit(limit);

    const { data } = await query;
    setTransactions(data ?? []);
    setLoading(false);
  }, [user, start, end, limit]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const withCategory = transactions.map((t) => ({
    ...t,
    category: t.category_id ? (categoryById.get(t.category_id) ?? null) : null,
  }));

  const addTransaction = async (input: TransactionInput) => {
    if (!user) return { error: 'Not signed in' };
    const { error } = await supabase.from('transactions').insert({ ...input, user_id: user.id });
    if (!error) await refetch();
    return { error: error?.message ?? null };
  };

  const updateTransaction = async (id: string, patch: Partial<TransactionInput>) => {
    const { error } = await supabase.from('transactions').update(patch).eq('id', id);
    if (!error) await refetch();
    return { error: error?.message ?? null };
  };

  const deleteTransaction = async (id: string) => {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (!error) await refetch();
    return { error: error?.message ?? null };
  };

  return { transactions: withCategory, loading, addTransaction, updateTransaction, deleteTransaction, refetch };
}
