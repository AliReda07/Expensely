import { SHARE_MODE_OPTIONS, type ShareMode } from '../lib/family';
import type { Card } from '../types';

/** Choose what an adult family member shares: everything, some cards, or totals only. */
export function SharingPicker({
  mode,
  cardIds,
  cards,
  onChange,
}: {
  mode: ShareMode;
  cardIds: string[];
  cards: Card[];
  onChange: (mode: ShareMode, cardIds: string[]) => void;
}) {
  const toggleCard = (id: string) =>
    onChange(mode, cardIds.includes(id) ? cardIds.filter((c) => c !== id) : [...cardIds, id]);

  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">What to share</legend>
      {SHARE_MODE_OPTIONS.map((opt) => {
        const selected = mode === opt.value;
        return (
          <div key={opt.value}>
            <label
              className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                selected
                  ? 'border-brand bg-brand/5'
                  : 'border-stone-200 dark:border-stone-700'
              }`}
            >
              <input
                type="radio"
                name="share-mode"
                checked={selected}
                onChange={() => onChange(opt.value, opt.value === 'cards' ? cardIds : [])}
                className="mt-1 accent-[var(--color-brand)]"
              />
              <span>
                <span className="block text-sm font-semibold text-stone-800 dark:text-stone-100">{opt.label}</span>
                <span className="block text-xs text-stone-600 dark:text-stone-400">{opt.description}</span>
              </span>
            </label>

            {opt.value === 'cards' && selected && (
              <div className="ml-4 mt-2 space-y-1.5 border-l-2 border-brand/30 pl-3">
                {cards.length === 0 ? (
                  <p className="text-xs text-stone-600 dark:text-stone-400">
                    You don&apos;t have any cards yet. Add one in Settings, or pick another option.
                  </p>
                ) : (
                  cards.map((card) => (
                    <label key={card.id} className="flex cursor-pointer items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
                      <input
                        type="checkbox"
                        checked={cardIds.includes(card.id)}
                        onChange={() => toggleCard(card.id)}
                        className="accent-[var(--color-brand)]"
                      />
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: card.color }} aria-hidden="true" />
                      {card.name}
                      {card.last4 ? <span className="text-stone-500 dark:text-stone-400">••{card.last4}</span> : null}
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
