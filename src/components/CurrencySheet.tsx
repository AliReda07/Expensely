import { Check, X } from 'lucide-react';
import { Sheet } from './Sheet';

const CURRENCIES = [
  { code: 'EGP', name: 'Egyptian Pound' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'KWD', name: 'Kuwaiti Dinar' },
  { code: 'QAR', name: 'Qatari Riyal' },
];

export function CurrencySheet({
  currency,
  onSelect,
  onClose,
}: {
  currency: string;
  onSelect: (code: string) => Promise<{ error: string | null }>;
  onClose: () => void;
}) {
  const select = async (code: string, close: () => void) => {
    if (code === currency) {
      close();
      return;
    }
    await onSelect(code);
    close();
  };

  return (
    <Sheet onClose={onClose}>
      {(close) => (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Currency</h2>
            <button
              onClick={close}
              aria-label="Close"
              className="rounded-full p-1.5 text-stone-500 transition-colors hover:bg-stone-100 active:scale-90 dark:text-stone-400 dark:hover:bg-stone-700"
            >
              <X size={20} />
            </button>
          </div>

          <ul className="divide-y divide-stone-100 dark:divide-stone-700">
            {CURRENCIES.map((c) => {
              const isSelected = c.code === currency;
              return (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => select(c.code, close)}
                    className="flex w-full items-center gap-3 py-3 text-left transition-colors active:bg-stone-50 dark:active:bg-stone-700/60"
                  >
                    <Check size={16} className={isSelected ? 'text-brand' : 'text-transparent'} />
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-stone-800 dark:text-stone-100">{c.code}</span>
                      <span className="block text-xs text-stone-500 dark:text-stone-400">{c.name}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Sheet>
  );
}
