import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Card } from '../types';

interface NetRow {
  type: string;
  amount: number;
  card_id: string | null;
}

/**
 * Total balance is the cash/unassigned bucket (profiles.starting_balance) plus every
 * debit card's own balance, MINUS every credit card's owed amount -- a credit card is
 * a liability, so what you owe on it reduces your net total rather than adding to it.
 *
 * Debit balance:  starting_balance + income - expenses  (money available)
 * Credit balance: starting_balance + expenses - income  (amount owed)
 *
 * Transactions with card_id = null belong to the cash bucket.
 */
export function useBalance(startingBalance: number | undefined, cards: Card[] = []) {
  const { user } = useAuth();
  const [rows, setRows] = useState<NetRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('transactions').select('type, amount, card_id').eq('user_id', user.id);
    setRows(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const netByCard = new Map<string, number>();
  let netUnassigned = 0;
  for (const row of rows) {
    // Income moves cash and debit balances up but pays a credit balance down --
    // so "signed toward more debt" for a credit card is the mirror of a debit card.
    const signed = row.type === 'income' ? Number(row.amount) : -Number(row.amount);
    if (row.card_id) {
      netByCard.set(row.card_id, (netByCard.get(row.card_id) ?? 0) + signed);
    } else {
      netUnassigned += signed;
    }
  }

  const cashBalance = (startingBalance ?? 0) + netUnassigned;

  const balanceByCard = new Map<string, number>();
  for (const card of cards) {
    const net = netByCard.get(card.id) ?? 0;
    const cardNet = card.type === 'credit' ? -net : net;
    balanceByCard.set(card.id, Number(card.starting_balance) + cardNet);
  }

  const debitTotal = cards
    .filter((c) => c.type === 'debit')
    .reduce((sum, c) => sum + (balanceByCard.get(c.id) ?? 0), 0);
  const creditOwedTotal = cards
    .filter((c) => c.type === 'credit')
    .reduce((sum, c) => sum + (balanceByCard.get(c.id) ?? 0), 0);

  const balance = cashBalance + debitTotal - creditOwedTotal;

  return { balance, cashBalance, balanceByCard, loading, refetch };
}
