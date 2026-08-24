import { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
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
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">SMS auto-logging</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-600">
          Forward your bank's transaction SMS to a private link and it'll log the expense automatically — no app
          needed, just a Shortcut on your phone that watches for the message and sends its text here.
        </p>

        {webhookUrl ? (
          <>
            <label className="mb-1 block text-xs font-medium text-slate-500">Your private webhook link</label>
            <div className="mb-2 flex items-center gap-2">
              <input
                readOnly
                value={webhookUrl}
                onFocus={(e) => e.target.select()}
                className="w-full min-w-0 truncate rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 outline-none"
              />
              <button
                onClick={copy}
                aria-label="Copy link"
                className="shrink-0 rounded-xl bg-brand p-2.5 text-white"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            <button
              onClick={generate}
              disabled={saving}
              className="mb-5 text-xs font-medium text-red-600 disabled:opacity-60"
            >
              Regenerate link (breaks the old one)
            </button>

            <p className="mb-2 text-xs font-medium text-slate-500">Set up in iOS Shortcuts</p>
            <ol className="mb-2 list-decimal space-y-1.5 pl-4 text-xs text-slate-600">
              <li>Open the Shortcuts app → Automation → New Automation → Message.</li>
              <li>Set "Sender" to your bank's SMS number/name, turn off "Ask Before Running".</li>
              <li>Add action "Get Contents of URL" → paste the link above, Method: POST.</li>
              <li>Request Body: Text → set it to "Shortcut Input" (the message text).</li>
              <li>Optionally add "Show Notification" with the URL's response to see the confirmation.</li>
            </ol>
          </>
        ) : (
          <button
            onClick={generate}
            disabled={saving}
            className="w-full rounded-xl bg-brand py-2.5 font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Generating…' : 'Enable SMS auto-logging'}
          </button>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
