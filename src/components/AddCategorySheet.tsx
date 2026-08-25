import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { Sheet } from './Sheet';
import { ICON_NAMES, getIcon } from '../lib/icons';

const SWATCHES = ['#f97316', '#3b82f6', '#ec4899', '#ef4444', '#a855f7', '#22c55e', '#14b8a6', '#64748b', '#eab308', '#06b6d4'];

export function AddCategorySheet({
  onAdd,
  onClose,
}: {
  onAdd: (input: { name: string; icon: string; color: string }) => Promise<{ error: string | null }>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICON_NAMES[0]);
  const [color, setColor] = useState(SWATCHES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Give the category a name.');
      return;
    }
    setError(null);
    setSaving(true);
    const result = await onAdd({ name: name.trim(), icon, color });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  };

  return (
    <Sheet onClose={onClose}>
      {(close) => (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Add a category</h2>
            <button
              onClick={close}
              aria-label="Close"
              className="rounded-full p-1.5 text-stone-500 transition-colors hover:bg-stone-100 active:scale-90 dark:text-stone-400 dark:hover:bg-stone-700"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Category name"
              aria-label="Category name"
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
            />
            <div className="flex flex-wrap gap-2">
              {ICON_NAMES.map((n) => {
                const Icon = getIcon(n);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setIcon(n)}
                    aria-label={n}
                    aria-pressed={icon === n}
                    className={`rounded-lg p-2 transition-all active:scale-90 ${icon === n ? 'bg-brand/10 ring-2 ring-brand' : 'bg-stone-50 dark:bg-stone-700'}`}
                  >
                    <Icon size={18} className="text-stone-600 dark:text-stone-300" />
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              {SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  aria-label={`Use colour ${swatch}`}
                  className={`h-7 w-7 rounded-full transition-all active:scale-90 ${color === swatch ? 'ring-2 ring-offset-2 ring-stone-400 dark:ring-offset-stone-800' : ''}`}
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
              {saving ? 'Adding…' : 'Add category'}
            </button>
          </form>
        </>
      )}
    </Sheet>
  );
}
