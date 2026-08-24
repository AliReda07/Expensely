import { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { Sheet } from './Sheet';
import type { Profile } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function SmsAutoLogSheet({
  profile,
  onClose,
  onSaveToken,
}: {
  profile: Profile | null;
  onClose: () => void;
  onSaveToken: (token: string) => Promise<{ error: string | null }>;
}) {
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const webhookUrl = profile?.sms_token ? `${SUPABASE_URL}/functions/v1/sms-webhook/${profile.sms_token}` : null;

  const generate = async () => {
    setSaving(true);
    setError(null);
    const result = await onSaveToken(generateToken());
    setSaving(false);
    if (result.error) setError(result.error);
  };

  const copy = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet onClose={onClose}>
      {(close) => (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">SMS auto-logging</h2>
            <button
              onClick={close}
              className="rounded-full p-1.5 text-stone-500 transition-colors hover:bg-stone-100 active:scale-90 dark:text-stone-400 dark:hover:bg-stone-700"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          <p className="mb-4 text-sm text-stone-600 dark:text-stone-400">
            Forward your bank's transaction SMS to a private link and it'll log the expense automatically — no app
            needed, just a Shortcut on your phone that watches for the message and sends its text here.
          </p>

          {webhookUrl ? (
            <>
              <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Your private webhook link</label>
              <div className="mb-2 flex items-center gap-2">
                <input
                  readOnly
                  value={webhookUrl}
                  onFocus={(e) => e.target.select()}
                  className="w-full min-w-0 truncate rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-xs text-stone-600 outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
                />
                <button
                  onClick={copy}
                  aria-label="Copy link"
                  className="shrink-0 rounded-xl bg-brand p-2.5 text-white transition-transform active:scale-90"
                >
                  {copied ? <Check size={18} className="animate-value-pop" /> : <Copy size={18} />}
                </button>
              </div>
              <button
                onClick={generate}
                disabled={saving}
                className="mb-5 text-xs font-medium text-red-600 transition-opacity active:opacity-60 disabled:opacity-60 dark:text-red-400"
              >
                Regenerate link (breaks the old one)
              </button>

              <p className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">Set up in iOS Shortcuts</p>
              <ol className="mb-2 list-decimal space-y-1.5 pl-4 text-xs text-stone-600 dark:text-stone-400">
                <li>Open the Shortcuts app → Automation → New Automation → Message.</li>
                <li>Set "Sender" to your bank's SMS number/name, turn off "Ask Before Running".</li>
                <li>Add action "Get Contents of URL" → paste the link above, Method: POST.</li>
                <li>Request Body: Text → set it to "Shortcut Input" (the message text).</li>
                <li>Optionally add "Show Notification" with the URL's response to see the confirmation.</li>
              </ol>

              <p className="mb-1.5 mt-4 text-xs font-medium text-stone-500 dark:text-stone-400">
                If your bank never mentions the card's last 4 digits
              </p>
              <p className="mb-2 text-xs text-stone-600 dark:text-stone-400">
                In step 4, use Request Body: JSON instead of Text, with two fields — <code className="rounded bg-stone-100 px-1 py-0.5 dark:bg-stone-700">message</code> set
                to the message text and <code className="rounded bg-stone-100 px-1 py-0.5 dark:bg-stone-700">sender</code> set to the trigger's Sender
                variable. Then set that same sender name on the card in Settings → Cards. This only resolves the
                card when it's the one card you have from that bank.
              </p>
            </>
          ) : (
            <button
              onClick={generate}
              disabled={saving}
              className="w-full rounded-xl bg-brand py-2.5 font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {saving ? 'Generating…' : 'Enable SMS auto-logging'}
            </button>
          )}

          {error && <p className="animate-shake mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </>
      )}
    </Sheet>
  );
}
