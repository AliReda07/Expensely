import { useState, type FormEvent, type ReactNode } from 'react';
import { LogOut, Lock, Plus, Trash2, UserMinus, Users, X } from 'lucide-react';
import { useHousehold, type HouseholdMember } from '../hooks/useHousehold';
import { useSubscription } from '../hooks/useSubscription';
import { useCards } from '../hooks/useCards';
import { useAuth } from '../contexts/AuthContext';
import { InviteSheet } from '../components/InviteSheet';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { SharingPicker } from '../components/SharingPicker';
import { MAX_HOUSEHOLD_MEMBERS, SHARE_MODE_OPTIONS, type ShareMode } from '../lib/family';
import { formatDate } from '../lib/format';

const CARD = 'rounded-2xl bg-white p-4 shadow-sm shadow-stone-200/60 dark:bg-stone-900 dark:shadow-black/40';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-stone-600 dark:text-stone-400">{title}</h2>
      {children}
    </section>
  );
}

export function Family() {
  const { user } = useAuth();
  const { isPremium, loading: planLoading } = useSubscription();
  const { cards } = useCards();
  const h = useHousehold();

  const [showInvite, setShowInvite] = useState(false);
  const [removing, setRemoving] = useState<HouseholdMember | null>(null);
  const [confirm, setConfirm] = useState<'leave' | 'delete' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (action: Promise<{ error: string | null }>) => {
    setActionError(null);
    const { error } = await action;
    if (error) setActionError(error);
  };

  const page = (children: ReactNode) => (
    <div className="mesh-bg h-full space-y-5 overflow-y-auto px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <h1 className="text-xl font-bold text-white dark:text-stone-100">Family</h1>
      {children}
    </div>
  );

  if (h.loading || planLoading) {
    return page(<div className="h-24 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800" aria-hidden="true" />);
  }

  // ---- Not in a family ----
  if (!h.membership) {
    return page(
      <>
        {isPremium ? (
          <CreateFamilyCard onCreate={h.createHousehold} />
        ) : (
          <div className={`${CARD} flex gap-3`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Lock size={17} />
            </span>
            <div>
              <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">Family is a Premium feature</p>
              <p className="mt-0.5 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
                One person subscribes and tracks the whole family&apos;s spending. Everyone else joins free. Premium is launching soon.
              </p>
            </div>
          </div>
        )}
        <p className="px-1 text-xs text-stone-100/80 dark:text-stone-400">
          Got an invite link? Open it on this device and sign in with the email it was sent to.
        </p>
      </>,
    );
  }

  const isOwner = h.membership.role === 'owner';

  // ---- Member (adult or child) ----
  if (!isOwner) {
    return page(
      <>
        <div className={CARD}>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Users size={18} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-stone-800 dark:text-stone-100">{h.householdName ?? 'Your family'}</p>
              <p className="text-xs text-stone-600 dark:text-stone-400">
                You&apos;re a {h.membership.role === 'child' ? 'child' : 'family'} member
              </p>
            </div>
          </div>
        </div>

        {h.membership.role === 'child' ? (
          <p className={`${CARD} text-sm text-stone-700 dark:text-stone-300`}>
            Everything you log here, including notes, is visible to the family owner. Your own app works as usual.
          </p>
        ) : (
          <Section title="What you share">
            <MemberSharing
              key={`${h.membership.share_mode}:${h.membership.shared_card_ids.join(',')}`}
              mode={h.membership.share_mode}
              cardIds={h.membership.shared_card_ids}
              cards={cards}
              onSave={(mode, ids) => run(h.updateSharing(mode, ids))}
            />
          </Section>
        )}

        {actionError && <p className="text-center text-xs text-red-200 dark:text-red-400">{actionError}</p>}
        <button
          onClick={() => setConfirm('leave')}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/30 py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98] dark:border-stone-700 dark:text-stone-200"
        >
          <LogOut size={16} />
          Leave family
        </button>

        {confirm === 'leave' && (
          <ConfirmSheet
            message="Leave this family? The owner stops seeing your spending straight away. You keep all your own data."
            confirmLabel="Leave"
            onConfirm={() => void run(h.leaveHousehold())}
            onClose={() => setConfirm(null)}
          />
        )}
      </>,
    );
  }

  // ---- Owner ----
  const memberCount = h.members.length;
  const full = memberCount + h.invites.length >= MAX_HOUSEHOLD_MEMBERS;

  return page(
    <>
      {!isPremium && (
        <div className={`${CARD} flex gap-3`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            <Lock size={17} />
          </span>
          <p className="text-xs leading-relaxed text-stone-700 dark:text-stone-300">
            Your Premium has ended, so you can&apos;t invite people or see family spending. Everyone keeps their own data, and you can still
            manage who is in the family.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="min-w-0 truncate text-base font-semibold text-white dark:text-stone-100">{h.householdName}</p>
        <button
          onClick={() => setShowInvite(true)}
          disabled={!isPremium || full}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/90 px-3.5 py-2 text-sm font-semibold text-brand transition-transform active:scale-95 disabled:opacity-50 dark:bg-stone-800 dark:text-stone-100"
        >
          <Plus size={16} />
          Invite
        </button>
      </div>
      {isPremium && full && (
        <p className="text-xs text-stone-100/80 dark:text-stone-400">
          A family holds up to {MAX_HOUSEHOLD_MEMBERS} people, counting pending invites.
        </p>
      )}
      {actionError && <p className="text-center text-xs text-red-200 dark:text-red-400">{actionError}</p>}

      <Section title={`Members (${memberCount} of ${MAX_HOUSEHOLD_MEMBERS})`}>
        <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm shadow-stone-200/60 dark:divide-stone-700 dark:bg-stone-900 dark:shadow-black/40">
          {h.members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                  {m.email}
                  {m.user_id === user?.id && <span className="ml-1.5 text-xs text-stone-500 dark:text-stone-400">(you)</span>}
                </p>
                <p className="text-xs text-stone-600 dark:text-stone-400">{memberLine(m)}</p>
              </div>
              {m.role !== 'owner' && (
                <button
                  onClick={() => setRemoving(m)}
                  aria-label={`Remove ${m.email}`}
                  className="shrink-0 rounded-xl border border-stone-200 p-2 text-stone-600 transition-all hover:bg-stone-50 active:scale-90 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                >
                  <UserMinus size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </Section>

      {h.invites.length > 0 && (
        <Section title="Pending invites">
          <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm shadow-stone-200/60 dark:divide-stone-700 dark:bg-stone-900 dark:shadow-black/40">
            {h.invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-stone-800 dark:text-stone-100">{inv.email}</p>
                  <p className="text-xs text-stone-600 dark:text-stone-400">
                    {inv.role === 'child' ? 'Child' : 'Adult'} · expires {formatDate(inv.expires_at.slice(0, 10))}
                  </p>
                </div>
                <button
                  onClick={() => void run(h.revokeInvite(inv.id))}
                  aria-label={`Cancel invite for ${inv.email}`}
                  className="shrink-0 rounded-xl border border-stone-200 p-2 text-stone-600 transition-all hover:bg-stone-50 active:scale-90 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      <p className="px-1 text-xs text-stone-100/80 dark:text-stone-400">
        The family dashboard is coming next. Until then you can set up who is in the family.
      </p>

      <button
        onClick={() => setConfirm('delete')}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/30 py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98] dark:border-stone-700 dark:text-stone-200"
      >
        <Trash2 size={16} />
        Delete family
      </button>

      {showInvite && <InviteSheet onCreate={h.createInvite} onClose={() => setShowInvite(false)} />}
      {removing && (
        <ConfirmSheet
          message={`Remove ${removing.email}? You stop seeing their spending straight away. They keep all their own data.`}
          confirmLabel="Remove"
          onConfirm={() => void run(h.removeMember(removing.user_id))}
          onClose={() => setRemoving(null)}
        />
      )}
      {confirm === 'delete' && (
        <ConfirmSheet
          message="Delete this family? Sharing ends for everyone. Nobody's spending data is deleted."
          confirmLabel="Delete"
          onConfirm={() => void run(h.deleteHousehold())}
          onClose={() => setConfirm(null)}
        />
      )}
    </>,
  );
}

function memberLine(m: HouseholdMember): string {
  if (m.role === 'owner') return 'Owner';
  if (m.role === 'child') return 'Child · shares everything';
  const label = SHARE_MODE_OPTIONS.find((o) => o.value === m.share_mode)?.label ?? m.share_mode;
  return `Adult · shares: ${label.toLowerCase()}`;
}

function CreateFamilyCard({ onCreate }: { onCreate: (name: string) => Promise<{ error: string | null }> }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const { error: err } = await onCreate(name.trim());
    setSaving(false);
    if (err) setError(err);
  };

  return (
    <form onSubmit={(e) => void submit(e)} className={`${CARD} space-y-3`}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
          <Users size={18} />
        </span>
        <div>
          <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">Start a family</p>
          <p className="text-xs text-stone-600 dark:text-stone-400">
            Invite up to {MAX_HOUSEHOLD_MEMBERS - 1} people. They join free, and you track the family&apos;s spending.
          </p>
        </div>
      </div>
      <input
        type="text"
        aria-label="Family name"
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Family name (e.g. Reda Family)"
        className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
      />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="w-full rounded-xl bg-brand py-2.5 font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        {saving ? 'Creating…' : 'Create family'}
      </button>
    </form>
  );
}

function MemberSharing({
  mode,
  cardIds,
  cards,
  onSave,
}: {
  mode: ShareMode;
  cardIds: string[];
  cards: Parameters<typeof SharingPicker>[0]['cards'];
  onSave: (mode: ShareMode, cardIds: string[]) => Promise<void>;
}) {
  const [draftMode, setDraftMode] = useState(mode);
  const [draftCards, setDraftCards] = useState(cardIds);
  const [saving, setSaving] = useState(false);
  const dirty = draftMode !== mode || draftCards.slice().sort().join() !== cardIds.slice().sort().join();

  return (
    <div className={`${CARD} space-y-3`}>
      <SharingPicker
        mode={draftMode}
        cardIds={draftCards}
        cards={cards}
        onChange={(m, ids) => {
          setDraftMode(m);
          setDraftCards(ids);
        }}
      />
      <p className="text-xs text-stone-600 dark:text-stone-400">
        Notes on shared transactions are visible to the owner. You can hide a single transaction when you add or edit it.
      </p>
      <button
        onClick={async () => {
          setSaving(true);
          await onSave(draftMode, draftCards);
          setSaving(false);
        }}
        disabled={!dirty || saving || (draftMode === 'cards' && draftCards.length === 0)}
        className="w-full rounded-xl bg-brand py-2.5 font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
