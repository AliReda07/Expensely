import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

/**
 * A tag-style input: typed text becomes its own removable chip on Enter or on
 * losing focus, rather than one flat string. Deliberately does not commit on space --
 * callers here store multi-word phrases (e.g. Arabic phrases with spaces in them),
 * and splitting on space would silently break a phrase into unrelated single-word chips.
 */
export function ChipInput({
  values,
  onChange,
  placeholder,
  ariaLabel,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setDraft('');
  };

  const removeAt = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
    // Backspace never removes a chip -- only its own X button does.
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-1.5 rounded-xl border border-stone-200 px-2 py-2 transition-colors focus-within:border-brand dark:border-stone-700 dark:bg-stone-900">
      {values.map((v, i) => (
        <span
          key={`${v}-${i}`}
          className="flex items-center gap-1 rounded-full bg-stone-100 py-1 pl-2.5 pr-1.5 text-xs text-stone-700 dark:bg-stone-700 dark:text-stone-200"
        >
          {v}
          <button
            type="button"
            onClick={() => removeAt(i)}
            aria-label={`Remove "${v}"`}
            className="rounded-full p-0.5 text-stone-400 transition-colors hover:text-red-500 active:scale-90 dark:text-stone-500"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        type="text"
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder={values.length === 0 ? placeholder : undefined}
        className="min-w-[8ch] flex-1 bg-transparent px-1 py-1 text-sm outline-none dark:text-stone-100 dark:placeholder:text-stone-500"
      />
    </div>
  );
}
