import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { familyErrorMessage } from '../lib/family';
import { toMonthStart, type FamilyAlert, type FamilySummary, type RecentRow } from '../lib/familySummary';

/** The owner's family dashboard numbers for a month. Shows only what members have chosen to share. */
export function useFamilySummary(month: Date, refreshKey = 0) {
  const [summary, setSummary] = useState<FamilySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const monthStart = toMonthStart(month);

  useEffect(() => {
    let cancelled = false;
    void supabase.rpc('household_summary', { p_month: monthStart }).then(({ data, error: rpcError }) => {
      if (cancelled) return;
      setLoading(false);
      if (rpcError) {
        setSummary(null);
        setError(familyErrorMessage(rpcError.message));
        return;
      }
      setError(null);
      setSummary(data as FamilySummary);
    });
    return () => {
      cancelled = true;
    };
  }, [monthStart, refreshKey]);

  return { summary, error, loading };
}

/** Recent shared transactions for one member. Refused for members who share totals only. */
export async function fetchMemberRecent(memberId: string, limit = 20): Promise<{ rows: RecentRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('household_recent', { p_member: memberId, p_limit: limit });
  if (error) {
    return {
      rows: [],
      error: error.message.includes('not_shared') ? 'This member shares totals only.' : familyErrorMessage(error.message),
    };
  }
  return { rows: (data as RecentRow[] | null) ?? [], error: null };
}

/** Budget alerts (80% / over) and large purchases for the owner. Refetches when `refreshKey` changes. */
export function useFamilyAlerts(refreshKey = 0) {
  const [alerts, setAlerts] = useState<FamilyAlert[]>([]);

  useEffect(() => {
    let cancelled = false;
    void supabase.rpc('household_alerts').then(({ data, error }) => {
      if (!cancelled) setAlerts(error ? [] : ((data as FamilyAlert[] | null) ?? []));
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return alerts;
}

/** The parent sets a member's budget; amount null removes it. categoryId null is the overall budget. */
export async function setMemberBudget(memberId: string, categoryId: string | null, amount: number | null): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_member_budget', { p_member: memberId, p_category: categoryId, p_amount: amount });
  return { error: error ? familyErrorMessage(error.message) : null };
}

/** Purchases at or above this are flagged; null turns the flag off. */
export async function setLargePurchaseThreshold(amount: number | null): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_large_purchase_threshold', { p_amount: amount });
  return { error: error ? familyErrorMessage(error.message) : null };
}
