import { Sheet } from './Sheet';

/**
 * An in-app confirmation, styled as a bottom sheet, in place of window.confirm().
 * The native confirm() dialog is unreliable inside an iOS home-screen-installed PWA
 * and can silently no-op instead of showing anything, which looks identical to the
 * triggering button doing nothing at all.
 */
export function ConfirmSheet({
  message,
  confirmLabel = 'Confirm',
  destructive = true,
  onConfirm,
  onClose,
}: {
  message: string;
  confirmLabel?: string;
  /** Styles the confirm button red (default) for a destructive action, or brand-colored otherwise. */
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose}>
      {(close) => (
        <>
          <p className="mb-5 text-sm text-stone-700 dark:text-stone-300">{message}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              className="flex-1 rounded-xl border border-stone-200 py-2.5 font-semibold text-stone-700 transition-transform active:scale-[0.98] dark:border-stone-600 dark:text-stone-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                close();
              }}
              className={`flex-1 rounded-xl py-2.5 font-semibold text-white transition-transform active:scale-[0.98] ${
                destructive ? 'bg-red-600' : 'bg-brand'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
