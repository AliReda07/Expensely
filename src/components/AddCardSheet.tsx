import { X } from 'lucide-react';
import { AddCardForm } from './AddCardForm';
import { Sheet } from './Sheet';
import type { CardInput } from '../hooks/useCards';
import type { Card } from '../types';

export function AddCardSheet({
  cards,
  currency,
  card,
  onSubmit,
  onClose,
}: {
  cards: Card[];
  currency: string;
  /** When set, the sheet edits this card in place instead of creating a new one. */
  card?: Card;
  onSubmit: (input: CardInput) => Promise<{ error: string | null }>;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose}>
      {(close) => (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">{card ? 'Edit card' : 'Add a card'}</h2>
            <button
              onClick={close}
              className="rounded-full p-1.5 text-stone-500 transition-colors hover:bg-stone-100 active:scale-90 dark:text-stone-400 dark:hover:bg-stone-700"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
          <AddCardForm cards={cards} currency={currency} card={card} onSubmit={onSubmit} onDone={close} />
        </>
      )}
    </Sheet>
  );
}
