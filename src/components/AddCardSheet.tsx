import { X } from 'lucide-react';
import { AddCardForm } from './AddCardForm';
import { Sheet } from './Sheet';
import type { CardInput } from '../hooks/useCards';
import type { Card } from '../types';

export function AddCardSheet({
  cards,
  currency,
  onAdd,
  onClose,
}: {
  cards: Card[];
  currency: string;
  onAdd: (input: CardInput) => Promise<{ error: string | null }>;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose}>
      {(close) => (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Add a card</h2>
            <button
              onClick={close}
              className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 active:scale-90 dark:text-slate-400 dark:hover:bg-slate-700"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
          <AddCardForm cards={cards} currency={currency} onAdd={onAdd} onDone={close} />
        </>
      )}
    </Sheet>
  );
}
