import { useState, type FormEvent } from 'react';
import { ChipInput } from './ChipInput';
import type { CardInput } from '../hooks/useCards';
import type { Card, CardType } from '../types';

const CARD_SWATCHES = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#64748b'];
const TYPE_OPTIONS: { value: CardType; label: string }[] = [
  { value: 'debit', label: 'Debit' },
  { value: 'credit', label: 'Credit' },
];

export function AddCardForm({
  cards,
  currency,
  card,
  onSubmit,
  onDone,
}: {
  cards: Card[];
  currency: string;
  /** When set, the form edits this card in place instead of creating a new one. */
  card?: Card;
  onSubmit: (input: CardInput) => Promise<{ error: string | null }>;
  /** Called after a successful save — e.g. to close the sheet it's shown in. */
  onDone?: () => void;
}) {
  const isEditing = !!card;
  const [name, setName] = useState(card?.name ?? '');
  const [last4, setLast4] = useState(card?.last4 ?? '');
  const [type, setType] = useState<CardType>(card?.type ?? 'debit');
  const [startingBalance, setStartingBalance] = useState(card ? String(card.starting_balance) : '');
  const [creditLimit, setCreditLimit] = useState(card?.credit_limit != null ? String(card.credit_limit) : '');
  const [bankSender, setBankSender] = useState(card?.bank_sender ?? '');
  const [smsMatchPhrases, setSmsMatchPhrases] = useState<string[]>(card?.sms_match_phrases ?? []);
  const [color, setColor] = useState(card?.color ?? CARD_SWATCHES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Give the card a name.');
      return;
    }
    if (last4 && !/^\d{4}$/.test(last4)) {
      setError('Last 4 digits must be exactly 4 numbers.');
      return;
    }
    if (last4 && cards.some((c) => c.last4 === last4 && c.id !== card?.id)) {
      setError(`You already have a card ending ${last4}.`);
      return;
    }
    if (type === 'credit' && creditLimit.trim() && (Number.isNaN(Number(creditLimit)) || Number(creditLimit) < 0)) {
      setError('Credit limit must be a valid, non-negative number.');
      return;
    }

    setError(null);
    setSaving(true);
    const result = await onSubmit({
      name: name.trim(),
      last4: last4 || null,
      color,
      type,
      starting_balance: Number(startingBalance) || 0,
      credit_limit: type === 'credit' && creditLimit.trim() ? Number(creditLimit) : null,
      bank_sender: bankSender.trim() || null,
      sms_match_phrases: smsMatchPhrases,
    });
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (!isEditing) {
      setName('');
      setLast4('');
      setStartingBalance('');
      setCreditLimit('');
      setBankSender('');
      setSmsMatchPhrases([]);
      setType('debit');
    }
    onDone?.();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="text"
        aria-label="Card name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Card name (e.g. Main Visa)"
        className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
      />

      <div className="relative flex rounded-xl bg-stone-100 p-1 dark:bg-stone-700">
        <div
          className="absolute rounded-lg bg-white shadow transition-transform duration-200 ease-out dark:bg-stone-600"
          style={{ top: 4, bottom: 4, left: 4, width: 'calc(50% - 4px)', transform: `translateX(${type === 'credit' ? '100%' : '0%'})` }}
        />
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setType(opt.value)}
            aria-pressed={type === opt.value}
            className={`relative z-10 flex-1 rounded-lg py-2 text-sm font-semibold transition-colors active:scale-95 ${
              type === opt.value ? 'text-stone-800 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          aria-label="Last 4 digits of the card"
          maxLength={4}
          value={last4}
          onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="Last 4 digits"
          className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2.5 tabular-nums outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
        />
        <input
          type="text"
          inputMode="decimal"
          aria-label={type === 'credit' ? `Current amount owed in ${currency}` : `Current balance in ${currency}`}
          value={startingBalance}
          onChange={(e) => setStartingBalance(e.target.value)}
          placeholder={type === 'credit' ? `Owed (${currency})` : `Balance (${currency})`}
          className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2.5 tabular-nums outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
        />
      </div>

      <div>
        <ChipInput
          values={smsMatchPhrases}
          onChange={setSmsMatchPhrases}
          ariaLabel="Distinctive phrases in this bank's SMS, optional"
          placeholder="Phrase unique to this bank's SMS, then Enter (optional)"
        />
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          Only needed as a fallback for banks whose SMS never mention the card's last 4 digits. Type a phrase and
          press Enter to add it as its own tag — a bank often words this differently per message type (e.g.
          "مسبقة الدفع" in a transfer notice vs. "بطاقة المدفوعة مقدما" in a purchase notice for the same prepaid
          card), so add one tag for each wording you've seen. Any tag matching means the card resolves — but only
          when it's the one card you have with that wording.
        </p>
      </div>

      <div>
        <input
          type="text"
          aria-label="Bank SMS sender, optional, advanced"
          value={bankSender}
          onChange={(e) => setBankSender(e.target.value)}
          placeholder="Bank SMS sender (advanced, optional)"
          className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
        />
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          Advanced alternative to the phrase above — only works if your phone's SMS automation can actually filter
          by this bank as a sender (many banks send from an alphanumeric ID that iOS can't filter by), and only
          resolves the card when it's the one card you have from that sender.
        </p>
      </div>

      {type === 'credit' && (
        <input
          type="text"
          inputMode="decimal"
          aria-label={`Credit limit in ${currency}`}
          value={creditLimit}
          onChange={(e) => setCreditLimit(e.target.value)}
          placeholder={`Credit limit (${currency}) — optional`}
          className="w-full rounded-xl border border-stone-200 px-3 py-2.5 tabular-nums outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
        />
      )}

      <p className="text-xs text-stone-500 dark:text-stone-400">
        {type === 'credit'
          ? 'Credit card spending adds to what you owe. Add a limit to see available credit; only the last 4 digits are ever stored.'
          : 'Only the last 4 digits are stored — never your full card number.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {CARD_SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            onClick={() => setColor(swatch)}
            aria-label={`Use colour ${swatch}`}
            className={`h-7 w-7 rounded-full transition-all active:scale-90 ${
              color === swatch ? 'ring-2 ring-stone-400 ring-offset-2 dark:ring-offset-stone-800' : ''
            }`}
            style={{ backgroundColor: swatch }}
          />
        ))}
      </div>
      {error && <p className="animate-shake text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-xl border border-brand py-2.5 font-semibold text-brand transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {isEditing ? (saving ? 'Saving…' : 'Save changes') : saving ? 'Adding…' : 'Add card'}
      </button>
    </form>
  );
}
