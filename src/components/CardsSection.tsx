import { useState, type FormEvent } from 'react';
import { CreditCard, X } from 'lucide-react';
import { formatCurrency } from '../lib/format';
import type { CardInput } from '../hooks/useCards';
import type { Card, CardType } from '../types';

const CARD_SWATCHES = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#64748b'];
const TYPE_OPTIONS: { value: CardType; label: string }[] = [
  { value: 'debit', label: 'Debit' },
  { value: 'credit', label: 'Credit' },
];

export function CardsSection({
  cards,
  currency,
  onAdd,
  onDelete,
}: {
  cards: Card[];
  currency: string;
  onAdd: (input: CardInput) => Promise<{ error: string | null }>;
  onDelete: (id: string) => Promise<{ error: string | null }>;
}) {
  const [name, setName] = useState('');
  const [last4, setLast4] = useState('');
  const [type, setType] = useState<CardType>('debit');
  const [startingBalance, setStartingBalance] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [bankSender, setBankSender] = useState('');
  const [color, setColor] = useState(CARD_SWATCHES[0]);
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
    if (last4 && cards.some((c) => c.last4 === last4)) {
      setError(`You already have a card ending ${last4}.`);
      return;
    }
    if (type === 'credit' && creditLimit.trim() && (Number.isNaN(Number(creditLimit)) || Number(creditLimit) < 0)) {
      setError('Credit limit must be a valid, non-negative number.');
      return;
    }

    setError(null);
    setSaving(true);
    const result = await onAdd({
      name: name.trim(),
      last4: last4 || null,
      color,
      type,
      starting_balance: Number(startingBalance) || 0,
      credit_limit: type === 'credit' && creditLimit.trim() ? Number(creditLimit) : null,
      bank_sender: bankSender.trim() || null,
    });
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setName('');
    setLast4('');
    setStartingBalance('');
    setCreditLimit('');
    setBankSender('');
    setType('debit');
  };

  const remove = async (card: Card) => {
    const label = card.last4 ? `${card.name} ••${card.last4}` : card.name;
    if (!window.confirm(`Remove "${label}"? Its transactions are kept but become unassigned.`)) return;
    await onDelete(card.id);
  };

  return (
    <>
      <form onSubmit={submit} className="space-y-3 p-4">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Add a card</p>
        <input
          type="text"
          aria-label="Card name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Card name (e.g. Main Visa)"
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none transition-colors focus:border-brand dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
        />

        <div className="relative flex rounded-xl bg-slate-100 p-1 dark:bg-slate-700">
          <div
            className="absolute rounded-lg bg-white shadow transition-transform duration-200 ease-out dark:bg-slate-600"
            style={{ top: 4, bottom: 4, left: 4, width: 'calc(50% - 4px)', transform: `translateX(${type === 'credit' ? '100%' : '0%'})` }}
          />
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setType(opt.value)}
              aria-pressed={type === opt.value}
              className={`relative z-10 flex-1 rounded-lg py-2 text-sm font-semibold transition-colors active:scale-95 ${
                type === opt.value ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'
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
            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 tabular-nums outline-none transition-colors focus:border-brand dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <input
            type="text"
            inputMode="decimal"
            aria-label={type === 'credit' ? `Current amount owed in ${currency}` : `Current balance in ${currency}`}
            value={startingBalance}
            onChange={(e) => setStartingBalance(e.target.value)}
            placeholder={type === 'credit' ? `Owed (${currency})` : `Balance (${currency})`}
            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 tabular-nums outline-none transition-colors focus:border-brand dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>

        <div>
          <input
            type="text"
            aria-label="Bank SMS sender, optional"
            value={bankSender}
            onChange={(e) => setBankSender(e.target.value)}
            placeholder="Bank SMS sender (optional, e.g. HSBC)"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none transition-colors focus:border-brand dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Only needed as a fallback for banks whose SMS never mention the card's last 4 digits — and only works
            if this is the one card you have from that bank.
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
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 tabular-nums outline-none transition-colors focus:border-brand dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        )}

        <p className="text-xs text-slate-500 dark:text-slate-400">
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
                color === swatch ? 'ring-2 ring-slate-400 ring-offset-2 dark:ring-offset-slate-800' : ''
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
          {saving ? 'Adding…' : 'Add card'}
        </button>
      </form>

      {cards.length > 0 && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-700 dark:border-slate-700">
          {cards.map((c, i) => (
            <li
              key={c.id}
              className="animate-row-in flex items-center gap-3 px-4 py-3"
              style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${c.color}1a`, color: c.color }}
              >
                <CreditCard size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{c.name}</p>
                  {c.type === 'credit' && (
                    <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                      Credit
                    </span>
                  )}
                </span>
                <p className="truncate text-xs tabular-nums text-slate-600 dark:text-slate-400">
                  {c.last4 ? `•••• ${c.last4}` : 'No digits saved'}
                  {c.type === 'credit' && c.credit_limit != null && (
                    <> · Limit {formatCurrency(c.credit_limit, currency)}</>
                  )}
                  {c.bank_sender && <> · from {c.bank_sender}</>}
                </p>
              </span>
              <button
                onClick={() => remove(c)}
                aria-label={`Remove ${c.name}`}
                className="rounded-full p-1.5 text-red-500 transition-all hover:bg-red-50 active:scale-90 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
