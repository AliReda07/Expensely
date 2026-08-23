import { useRef, useState, type FormEvent } from 'react';
import { Mic, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCategories } from '../hooks/useCategories';
import { useProfile } from '../hooks/useProfile';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

const WEBHOOK_URL = import.meta.env.VITE_N8N_ASK_WEBHOOK_URL as string | undefined;
const WEBHOOK_SECRET = import.meta.env.VITE_N8N_ASK_WEBHOOK_SECRET as string | undefined;

export function Ask() {
  const { categories } = useCategories();
  const { profile } = useProfile();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text: "Hi! Tell me things like \"spent 50 on food\", \"add 8000 income\", or \"set my balance to 1000\" and I'll update your account.",
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const configured = Boolean(WEBHOOK_URL);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setError(null);
    setSending(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError('You need to be signed in.');
        setSending(false);
        return;
      }

      const res = await fetch(WEBHOOK_URL!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(WEBHOOK_SECRET ? { 'X-Webhook-Secret': WEBHOOK_SECRET } : {}),
        },
        body: JSON.stringify({
          message: text,
          access_token: session.access_token,
          currency: profile?.currency ?? 'EGP',
          categories: categories.map((c) => ({ id: c.id, name: c.name })),
        }),
      });

      if (!res.ok) throw new Error(`Assistant is unavailable (${res.status}).`);

      const data = await res.json();
      const reply = typeof data?.reply === 'string' ? data.reply : "Done, but I didn't get a reply message.";
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSending(false);
      requestAnimationFrame(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
    }
  };

  return (
    <div className="flex h-full flex-col pb-16">
      <div className="px-4 pb-2 pt-6">
        <h1 className="text-xl font-bold text-slate-800">Ask</h1>
        <p className="text-sm text-slate-500">Tell it what happened, it updates your account.</p>
      </div>

      {!configured ? (
        <div className="mx-4 mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          The assistant isn't connected yet — set VITE_N8N_ASK_WEBHOOK_URL to your n8n workflow's webhook URL.
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    m.role === 'user' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl bg-slate-100 px-3.5 py-2.5 text-sm text-slate-400">Thinking…</div>
              </div>
            )}
            {error && <p className="text-center text-xs text-red-600">{error}</p>}
            <div ref={listEndRef} />
          </div>

          <form onSubmit={send} className="flex items-center gap-2 border-t border-slate-100 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              disabled
              title="Voice input coming soon"
              aria-label="Voice input (coming soon)"
              className="shrink-0 rounded-full p-2.5 text-slate-300"
            >
              <Mic size={20} />
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. spent 50 on food"
              className="min-w-0 flex-1 rounded-full border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-brand"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send"
              className="shrink-0 rounded-full bg-brand p-2.5 text-white disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
