import { useEffect, useState, type ReactNode } from 'react';

export function Sheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const [closing, setClosing] = useState(false);

  const close = () => setClosing(true);

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(onClose, 190);
    return () => clearTimeout(timer);
  }, [closing, onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-40 flex items-end justify-center bg-black/40 ${
        closing ? 'animate-sheet-backdrop-out' : 'animate-sheet-backdrop-in'
      }`}
      onClick={close}
    >
      <div
        className={`max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] dark:bg-stone-800 ${
          closing ? 'animate-sheet-panel-out' : 'animate-sheet-panel-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {children(close)}
      </div>
    </div>
  );
}
