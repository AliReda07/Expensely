import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Card, CardType } from '../types';

export interface CardInput {
  name: string;
  last4: string | null;
  color: string;
  type: CardType;
  starting_balance: number;
  credit_limit: number | null;
  bank_sender: string | null;
}

export function useCards() {
  const { user } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('cards')
      .select('id, user_id, name, last4, color, type, starting_balance, credit_limit, bank_sender')
      .eq('user_id', user.id)
      .order('created_at');
    setCards(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const addCard = async (input: CardInput) => {
    if (!user) return { error: 'Not signed in' };
    const { error } = await supabase.from('cards').insert({ ...input, user_id: user.id });
    if (!error) await refetch();
    return { error: error?.message ?? null };
  };

  const updateCard = async (id: string, patch: Partial<CardInput>) => {
    const { error } = await supabase.from('cards').update(patch).eq('id', id);
    if (!error) await refetch();
    return { error: error?.message ?? null };
  };

  const deleteCard = async (id: string) => {
    const { error } = await supabase.from('cards').delete().eq('id', id);
    if (!error) await refetch();
    return { error: error?.message ?? null };
  };

  return { cards, loading, addCard, updateCard, deleteCard, refetch };
}
