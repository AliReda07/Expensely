import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Category } from '../types';

export function useCategories() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('categories')
      .select('id, user_id, name, icon, color, is_preset')
      .order('is_preset', { ascending: false })
      .order('name');
    setCategories(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const addCategory = async (input: { name: string; icon: string; color: string }) => {
    if (!user) return { error: 'Not signed in' };
    const { error } = await supabase.from('categories').insert({
      user_id: user.id,
      name: input.name,
      icon: input.icon,
      color: input.color,
      is_preset: false,
    });
    if (!error) await refetch();
    return { error: error?.message ?? null };
  };

  const deleteCategory = async (id: string) => {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (!error) await refetch();
    return { error: error?.message ?? null };
  };

  return { categories, loading, addCategory, deleteCategory, refetch };
}
