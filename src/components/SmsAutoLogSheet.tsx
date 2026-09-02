import { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { Sheet } from './Sheet';
import type { Profile } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type Platform = 'ios' | 'android';

const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: 'ios', label: 'iPhone' },
  { value: 'android', label: 'Android' },
];

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
  // Opens on whichever platform the user is reading this on, so most people never have to
  // touch the switch. Same user-agent sniffing as useInstallPrompt -- the cost of guessing
  // wrong is one tap, so a rough check is enough.
  const [platform, setPlatform] = useState<Platform>(() => (/Android/i.test(navigator.userAgent) ? 'android' : 'ios'));

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
            Forward your bank's transaction SMS to a private link and it'll log the expense automatically — just a
            small automation on your phone that watches for the message and sends its text here.
          </p>

          {webhookUrl ? (
            <>
              <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Your private webhook link</label>
              <div className="mb-2 flex items-center gap-2">
                <input
                  readOnly
                  aria-label="Your private webhook link"
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

              <div className="relative mb-3 flex rounded-xl bg-stone-100 p-1 dark:bg-stone-700">
                <div
                  className="absolute rounded-lg bg-white shadow transition-transform duration-200 ease-out dark:bg-stone-600"
                  style={{
                    top: 4,
                    bottom: 4,
                    left: 4,
                    width: 'calc(50% - 4px)',
                    transform: `translateX(${platform === 'android' ? '100%' : '0%'})`,
                  }}
                />
                {PLATFORM_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPlatform(opt.value)}
                    aria-pressed={platform === opt.value}
                    className={`relative z-10 flex-1 rounded-lg py-2 text-sm font-semibold transition-colors active:scale-95 ${
                      platform === opt.value ? 'text-stone-800 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {platform === 'ios' ? (
                <>
                  <p className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">Set up in iOS Shortcuts</p>
                  <ol className="mb-2 list-decimal space-y-1.5 pl-4 text-xs text-stone-600 dark:text-stone-400">
                    <li>Open the Shortcuts app → Automation → New Automation → Message.</li>
                    <li>
                      Set "Message Contains" to a word every bank text has, e.g. your currency code. One automation
                      like this can cover every bank you have.
                    </li>
                    <li>Turn off "Ask Before Running".</li>
                    <li>Add action "Get Contents of URL" → paste the link above, Method: POST.</li>
                    <li>Request Body: Text → set it to "Shortcut Input" (the message text).</li>
                    <li>Optionally add "Show Notification" with the URL's response to see the confirmation.</li>
                  </ol>
                </>
              ) : (
                <>
                  <p className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">Set up in MacroDroid</p>
                  <ol className="mb-2 list-decimal space-y-1.5 pl-4 text-xs text-stone-600 dark:text-stone-400">
                    <li>Install MacroDroid from the Play Store and give it SMS permission.</li>
                    <li>
                      New macro → Trigger → SMS/Call → "SMS Received". Leave the sender as "Any Sender", turn on the
                      message-content filter and set it to <em>contains</em> a word every bank text has, e.g. your
                      currency code. One macro like this can cover every bank you have.
                    </li>
                    <li>Action → Connectivity → "HTTP Request". Method: POST, URL: the link above.</li>
                    <li>
                      Content type: text/plain, and set the body to the magic text{' '}
                      <code className="rounded bg-stone-100 px-1 py-0.5 dark:bg-stone-700">{'{sms_message}'}</code>.
                    </li>
                    <li>
                      Save the macro, then exclude MacroDroid from battery optimization — otherwise Android
                      eventually kills it in the background and messages quietly stop logging.
                    </li>
                  </ol>
                  <p className="mb-2 text-xs text-stone-600 dark:text-stone-400">
                    Prefer an app that does only this? "Incoming SMS to URL forwarder"{' '}
                    <code className="break-all rounded bg-stone-100 px-1 py-0.5 dark:bg-stone-700">
                      github.com/bogkonstantin/android_income_sms_gateway_webhook
                    </code>{' '}
                    (free and open source) works too — point it at the link above and set its JSON template to{' '}
                    <code className="rounded bg-stone-100 px-1 py-0.5 dark:bg-stone-700">
                      {'{"message":"%text%","sender":"%from%"}'}
                    </code>
                    . It isn't on the Play Store, since Google restricts SMS permissions, so you install it from
                    F-Droid or its GitHub releases.
                  </p>
                </>
              )}

              <p className="mb-1.5 mt-4 text-xs font-medium text-stone-500 dark:text-stone-400">
                If your bank never mentions the card's last 4 digits
              </p>
              <p className="mb-2 text-xs text-stone-600 dark:text-stone-400">
                Go to Settings → Cards, edit that card, and fill in "Phrase unique to this bank's SMS" — a short
                piece of wording that appears in every text from this bank but no other. No changes to your phone's
                automation needed for this — it's matched against the message text on our end. It resolves the card when
                it's the one card you have with that phrase, and it also tells us to log the message even if it
                doesn't use wording we already recognize as a transaction. Because of that second part, make sure
                the phrase only appears in this bank's transaction messages — if it also shows up in their
                marketing texts, those will get logged too.
              </p>

              <p className="mb-1.5 mt-4 text-xs font-medium text-stone-500 dark:text-stone-400">
                {platform === 'ios'
                  ? 'Advanced: matching by sender instead of a phrase'
                  : 'Matching by sender instead of a phrase'}
              </p>
              {platform === 'ios' ? (
                <p className="mb-2 text-xs text-stone-600 dark:text-stone-400">
                  Only works if your phone's Message automation can actually filter by that bank as a sender — many
                  banks send from an alphanumeric ID rather than a real contact, which iOS often can't filter by at
                  all. If yours can: give that bank its own automation with Sender set to it, use Request Body: JSON
                  with two fields — <code className="rounded bg-stone-100 px-1 py-0.5 dark:bg-stone-700">message</code>{' '}
                  set to the message text and <code className="rounded bg-stone-100 px-1 py-0.5 dark:bg-stone-700">sender</code>{' '}
                  set to any label you type in yourself, e.g. <code className="rounded bg-stone-100 px-1 py-0.5 dark:bg-stone-700">HSBC</code> —
                  then enter that same label as the card's "Bank SMS sender" in Settings → Cards.
                </p>
              ) : (
                <p className="mb-2 text-xs text-stone-600 dark:text-stone-400">
                  On Android this is usually the better option when your bank never prints the card's last 4 digits,
                  because Android automations can filter on the bank's sender ID directly — including the
                  alphanumeric ones that aren't real contacts, which is exactly what iOS can't do. Give that bank its
                  own macro with the trigger's sender set to it, switch the HTTP Request's content type to
                  application/json, and set the body to{' '}
                  <code className="rounded bg-stone-100 px-1 py-0.5 dark:bg-stone-700">
                    {'{"message":"{sms_message}","sender":"HSBC"}'}
                  </code>{' '}
                  — where <code className="rounded bg-stone-100 px-1 py-0.5 dark:bg-stone-700">HSBC</code> is any label
                  you type in yourself. Then enter that same label as the card's "Bank SMS sender" in Settings →
                  Cards. With the forwarder app instead, set its sender filter to the bank and its template's{' '}
                  <code className="rounded bg-stone-100 px-1 py-0.5 dark:bg-stone-700">sender</code> to that label.
                </p>
              )}
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
