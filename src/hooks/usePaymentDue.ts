import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { daysUntilDue, isPaidThisCycle, nextDueDate } from '../lib/dueDate';
import type { Card, Transaction } from '../types';

export interface CardDue {
  card: Card;
  daysUntilDue: number;
  owed: number;
  severity: 'amber' | 'red';
  dueDate: string;
}

interface ReminderRow {
  id: string;
  card_id: string;
  due_date: string;
  offset_days: number;
  dismissed_at: string | null;
}

/**
 * Computed client-side from data the app already has (useCards + useBalance), rather
 * than read from the payment_reminders log -- the badge stays correct even if the
 * cron job never runs, which is the whole point of not depending on n8n for this
 * (see decision 16 in PAYMENT_REMINDERS_PLAN.md). The reminders table is only
 * consulted for its dismissed_at flag.
 */
export function usePaymentDue(cards: Card[], balanceByCard: Map<string, number>, transactions: Transaction[]) {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<ReminderRow[]>([]);

  const refetch = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('payment_reminders')
      .select('id, card_id, due_date, offset_days, dismissed_at')
      .eq('user_id', user.id);
    setReminders(data ?? []);
  }, [user]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const now = new Date();
  const dueCards: CardDue[] = [];
  for (const card of cards) {
    if (card.type !== 'credit' || card.payment_due_day == null) continue;
    const days = daysUntilDue(card.payment_due_day, now);
    if (days > 7) continue;
    const owed = balanceByCard.get(card.id) ?? 0;
    if (owed <= 0) continue;
    if (isPaidThisCycle(card.payment_due_day, now, card.id, transactions)) continue;
    dueCards.push({
      card,
      daysUntilDue: days,
      owed,
      severity: days <= 1 ? 'red' : 'amber',
      dueDate: nextDueDate(card.payment_due_day, now).toISOString().slice(0, 10),
    });
  }

  const bannerCards = dueCards.filter((d) => {
    if (d.daysUntilDue !== 1) return false;
    const row = reminders.find((r) => r.card_id === d.card.id && r.due_date === d.dueDate && r.offset_days === 1);
    return !row?.dismissed_at;
  });

  const dismiss = async (cardDue: CardDue) => {
    if (!user) return;
    const existing = reminders.find(
      (r) => r.card_id === cardDue.card.id && r.due_date === cardDue.dueDate && r.offset_days === 1,
    );
    if (existing) {
      await supabase
        .from('payment_reminders')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      // The cron job hasn't logged today's reminder yet -- create it pre-dismissed
      // rather than leaving the banner with no row to mark as seen.
      await supabase.from('payment_reminders').insert({
        user_id: user.id,
        card_id: cardDue.card.id,
        due_date: cardDue.dueDate,
        offset_days: 1,
        amount_owed: cardDue.owed,
        dismissed_at: new Date().toISOString(),
      });
    }
    await refetch();
  };

  return { dueCards, bannerCards, dismiss };
}
