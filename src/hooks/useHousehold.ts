import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { buildInviteLink, familyErrorMessage, type HouseholdRole, type ShareMode } from '../lib/family';

export interface Membership {
  household_id: string;
  role: HouseholdRole;
  share_mode: ShareMode;
  shared_card_ids: string[];
}

export interface HouseholdMember {
  user_id: string;
  email: string;
  role: HouseholdRole;
  share_mode: ShareMode;
  joined_at: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: 'adult' | 'child';
  expires_at: string;
}

type Result = { error: string | null };

/**
 * The signed-in user's family, if any. Everything that changes state goes through a database
 * function (the tables are read-only to the client), so this hook is mostly thin wrappers that
 * turn a function's error code into a message a person can read.
 */
export function useHousehold() {
  const { user } = useAuth();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [householdName, setHouseholdName] = useState<string | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) return;
    const { data: row } = await supabase
      .from('household_members')
      .select('household_id, role, share_mode, shared_card_ids')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!row) {
      setMembership(null);
      setHouseholdName(null);
      setMembers([]);
      setInvites([]);
      setLoading(false);
      return;
    }

    setMembership(row as Membership);
    const { data: household } = await supabase.from('households').select('name').eq('id', row.household_id).maybeSingle();
    setHouseholdName(household?.name ?? null);

    if (row.role === 'owner') {
      const [membersRes, invitesRes] = await Promise.all([supabase.rpc('list_household_members'), supabase.rpc('list_invites')]);
      setMembers((membersRes.data as HouseholdMember[] | null) ?? []);
      setInvites((invitesRes.data as PendingInvite[] | null) ?? []);
    } else {
      setMembers([]);
      setInvites([]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  /** Runs a database function, refreshes on success, and maps any error to readable text. */
  const call = async (fn: string, args?: Record<string, unknown>): Promise<Result & { data: unknown }> => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return { error: familyErrorMessage(error.message), data: null };
    await refetch();
    return { error: null, data };
  };

  const createHousehold = async (name: string): Promise<Result> => {
    const { error } = await call('create_household', { p_name: name });
    return { error };
  };

  const deleteHousehold = async (): Promise<Result> => {
    const { error } = await call('delete_household');
    return { error };
  };

  const leaveHousehold = async (): Promise<Result> => {
    const { error } = await call('leave_household');
    return { error };
  };

  const removeMember = async (userId: string): Promise<Result> => {
    const { error } = await call('remove_member', { p_user: userId });
    return { error };
  };

  const updateSharing = async (mode: ShareMode, cardIds: string[]): Promise<Result> => {
    const { error } = await call('update_my_sharing', { p_share_mode: mode, p_shared_card_ids: cardIds });
    return { error };
  };

  /** Creates an invite and returns the link to send. The token is shown once and never stored. */
  const createInvite = async (email: string, role: 'adult' | 'child'): Promise<Result & { link: string | null; expiresAt: string | null }> => {
    const { error, data } = await call('create_invite', { p_email: email, p_role: role });
    if (error) return { error, link: null, expiresAt: null };
    const invite = data as { token: string; expires_at: string };
    return { error: null, link: buildInviteLink(window.location.origin, invite.token), expiresAt: invite.expires_at };
  };

  const revokeInvite = async (id: string): Promise<Result> => {
    const { error } = await call('revoke_invite', { p_id: id });
    return { error };
  };

  return {
    membership,
    householdName,
    members,
    invites,
    loading,
    refetch,
    createHousehold,
    deleteHousehold,
    leaveHousehold,
    removeMember,
    updateSharing,
    createInvite,
    revokeInvite,
  };
}

/** What an invite would grant, for the join screen. Null when it isn't valid for this account. */
export async function previewInvite(token: string): Promise<{ household: string; role: 'adult' | 'child' } | null> {
  const { data, error } = await supabase.rpc('preview_invite', { p_token: token });
  if (error || !data) return null;
  return data as { household: string; role: 'adult' | 'child' };
}

export async function acceptInvite(
  token: string,
  mode: ShareMode,
  cardIds: string[],
): Promise<Result> {
  const { error } = await supabase.rpc('accept_invite', {
    p_token: token,
    p_share_mode: mode,
    p_shared_card_ids: cardIds,
    p_consent: true,
  });
  return { error: error ? familyErrorMessage(error.message) : null };
}

/**
 * Just the caller's role, for places that only need to know whether to offer a family-only
 * control (like hiding a transaction). Cheaper than the full hook.
 */
export function useHouseholdRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<HouseholdRole | null>(null);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from('household_members')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setRole((data?.role as HouseholdRole | undefined) ?? null));
  }, [user]);

  return role;
}
