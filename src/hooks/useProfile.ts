import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Profile } from '../types';

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, starting_balance, overall_budget, currency')
      .eq('id', user.id)
      .single();
    setProfile(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const updateProfile = async (
    patch: Partial<Pick<Profile, 'starting_balance' | 'overall_budget' | 'currency'>>
  ) => {
    if (!user) return { error: 'Not signed in' };
    const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
    if (!error) await refetch();
    return { error: error?.message ?? null };
  };

  return { profile, loading, updateProfile, refetch };
}
