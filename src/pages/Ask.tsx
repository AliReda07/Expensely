import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, Mic, Send, Sparkles, Square, Trash2 } from 'lucide-react';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import { useCategories } from '../hooks/useCategories';
import { useProfile } from '../hooks/useProfile';
import { useTransactions } from '../hooks/useTransactions';
import { useBalance } from '../hooks/useBalance';
import { useBudgets } from '../hooks/useBudgets';
import { useCards } from '../hooks/useCards';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useTheme } from '../contexts/ThemeContext';
import { formatCurrency, monthRange } from '../lib/format';
import { NEUTRAL_FALLBACK_COLOR } from '../lib/color';

interface CategoryChartDatum {
  name: string;
  value: number;
  color: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  chart?: CategoryChartDatum[];
  /** Set on assistant replies that came from a message which looked like it logged a
   *  transaction, so a reply that just changed your data reads differently from one
   *  that only answered a question. */
  kind?: 'log';
}

const TOP_CATEGORIES_PATTERN = /top\s+categor/i;
const AFFORD_PATTERN = /\bafford\b/i;
// A message mentioning a spending/income verb alongside an amount is treated as a
// logging command even if it also contains "afford" or "top categories" -- otherwise
// a compound message like "I can't afford to forget: spent 200 on rent" gets fully
// answered by the affordability shortcut and the rent expense never reaches the
// backend at all, silently.
const LOG_INTENT_PATTERN = /\b(spent|spend|paid|pay(?:ing)?|bought|buy|purchase[ds]?|add(?:ed)?\s+income|earned|received|got paid)\b/i;

function looksLikeLogCommand(text: string) {
  return LOG_INTENT_PATTERN.test(text) && parseFirstAmount(text) !== null;
}

const NUMBER_PATTERN = /\d+(?:,\d{3})*(?:\.\d+)?/g;

function parseFirstAmount(text: string): number | null {
  const match = text.match(NUMBER_PATTERN);
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Bars get a couple of distinct timings so the waveform reads as organic motion
// rather than one shape pulsing uniformly -- there's no real audio amplitude behind
// it (Web Speech API exposes transcripts, not levels), so this is deliberately just
// a rhythm, not a visualization.
const WAVEFORM_BARS = Array.from({ length: 24 }, (_, i) => ({
  delayMs: (i % 6) * 80,
  durationMs: 700 + (i % 3) * 140,
}));

function renderWithBoldNumbers(text: string) {
  const parts = text.split(NUMBER_PATTERN);
  const numbers = text.match(NUMBER_PATTERN) ?? [];
  const nodes: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part) nodes.push(part);
    if (i < numbers.length) nodes.push(<strong key={i} className="font-semibold tabular-nums text-stone-900 dark:text-stone-100">{numbers[i]}</strong>);
  });
  return nodes;
}

export function Ask() {
  const { categories } = useCategories();
  const { profile } = useProfile();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  // Matches Insights' stone dark-mode scale instead of Recharts' default slate --
  // otherwise the tooltip renders visibly blue-tinted on top of its own stone-800 card.
  const chartTooltipStyle = {
    background: isDark ? '#292524' : '#ffffff',
    border: `1px solid ${isDark ? '#44403c' : '#e7e5e4'}`,
    borderRadius: 8,
    color: isDark ? '#f5f5f4' : '#1c1917',
    fontSize: 13,
  };
  const currency = profile?.currency ?? 'EGP';

  const { start: monthStart, end: monthEnd } = monthRange(new Date());
  const { transactions, refetch: refetchTransactions } = useTransactions(categories, { start: monthStart, end: monthEnd });
  const { cards } = useCards();
  const { balance, refetch: refetchBalance } = useBalance(profile?.starting_balance, cards);
  const { budgets } = useBudgets();

  const monthExpenseTotal = useMemo(
    () => transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0),
    [transactions],
  );

  const topCategories = useMemo(() => {
    const totals = new Map<string, CategoryChartDatum>();
    for (const t of transactions) {
      if (t.type !== 'expense') continue;
      const name = t.category?.name ?? 'Other';
      const color = t.category?.color ?? NEUTRAL_FALLBACK_COLOR;
      const existing = totals.get(name);
      totals.set(name, { name, color, value: (existing?.value ?? 0) + Number(t.amount) });
    }
    return Array.from(totals.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [transactions]);

  const topCategoriesReply = (): ChatMessage => {
    if (topCategories.length === 0) {
      return { role: 'assistant', text: "No expenses logged this month yet." };
    }
    const [top, ...rest] = topCategories;
    const restText = rest.length
      ? `, followed by ${rest.map((d) => `${d.name} (${formatCurrency(d.value, currency)})`).join(', ')}`
      : '';
    return {
      role: 'assistant',
      text: `Your top category this month is ${top.name} at ${formatCurrency(top.value, currency)}${restText}.`,
      chart: topCategories,
    };
  };

  const affordabilityReply = (amount: number, rawText: string): ChatMessage => {
    const canAfford = balance >= amount;

    if (!canAfford) {
      return {
        role: 'assistant',
        text: `Not quite — that's ${formatCurrency(amount, currency)} but you only have ${formatCurrency(balance, currency)} available right now, so you'd be short by ${formatCurrency(amount - balance, currency)}.`,
      };
    }

    let text = `Yes, you can afford that — you'd have ${formatCurrency(balance - amount, currency)} left afterward.`;

    const overallBudget = profile?.overall_budget ?? null;
    if (overallBudget && monthExpenseTotal + amount > overallBudget) {
      const over = monthExpenseTotal + amount - overallBudget;
      text += ` Heads up though: that would put you ${formatCurrency(over, currency)} over your ${formatCurrency(overallBudget, currency)} monthly budget (you've already spent ${formatCurrency(monthExpenseTotal, currency)} this month).`;
    }

    const mentionedCategory = categories.find((c) => new RegExp(`\\b${escapeRegExp(c.name)}\\b`, 'i').test(rawText));
    const categoryBudget = mentionedCategory && budgets.find((b) => b.category_id === mentionedCategory.id);
    if (mentionedCategory && categoryBudget) {
      const categorySpent = transactions
        .filter((t) => t.type === 'expense' && t.category_id === mentionedCategory.id)
        .reduce((sum, t) => sum + Number(t.amount), 0);
      if (categorySpent + amount > categoryBudget.amount) {
        const over = categorySpent + amount - categoryBudget.amount;
        text += ` It'd also push your ${mentionedCategory.name} budget over by ${formatCurrency(over, currency)}.`;
      }
    }

    return { role: 'assistant', text };
  };

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text: 'Hi! Tell or say things like "spent 50 on food" or "add 8000 income" and I\'ll log it for you.',
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceUnsupportedNotice, setVoiceUnsupportedNotice] = useState(false);
  const voiceNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceBaseInputRef = useRef('');
  const listEndRef = useRef<HTMLDivElement>(null);

  const handleTranscript = (text: string) => {
    const base = voiceBaseInputRef.current;
    setInput(text ? (base ? `${base} ${text}` : text) : base);
  };

  const {
    listening,
    recordingMs,
    voiceError,
    voiceSupported,
    startListening,
    stopListening,
    cancelRecording,
  } = useVoiceInput({ onTranscript: handleTranscript });

  const quickReplies = [
    'How much did I spend this month?',
    'Can I afford a 5000 trip this weekend?',
    'Find expenses over 1000',
    'Show top categories',
  ];

  useEffect(() => {
    return () => {
      if (voiceNoticeTimeoutRef.current) clearTimeout(voiceNoticeTimeoutRef.current);
    };
  }, []);

  const toggleListening = () => {
    if (listening) {
      stopListening();
      return;
    }
    if (!voiceSupported) {
      // A disabled button can't receive a tap at all, so a browser without
      // SpeechRecognition (most iOS Safari versions, notably) got a permanently
      // dead-looking mic with only a `title` tooltip that never fires on touch.
      // This stays tappable and explains itself instead.
      setVoiceUnsupportedNotice(true);
      if (voiceNoticeTimeoutRef.current) clearTimeout(voiceNoticeTimeoutRef.current);
      voiceNoticeTimeoutRef.current = setTimeout(() => setVoiceUnsupportedNotice(false), 3000);
      return;
    }
    voiceBaseInputRef.current = input.trim();
    setError(null);
    startListening();
  };

  const sendMessage = async (text: string) => {
    if (!text || sending) return;

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setError(null);

    // A message that also looks like a logging command skips the client-side
    // shortcuts entirely and goes to the backend, even if it happens to contain
    // "afford" or "top categories" -- see LOG_INTENT_PATTERN above.
    const isLogCommand = looksLikeLogCommand(text);

    if (!isLogCommand && TOP_CATEGORIES_PATTERN.test(text)) {
      setMessages((prev) => [...prev, topCategoriesReply()]);
      requestAnimationFrame(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
      return;
    }

    if (!isLogCommand && AFFORD_PATTERN.test(text)) {
      const amount = parseFirstAmount(text);
      if (amount !== null) {
        setMessages((prev) => [...prev, affordabilityReply(amount, text)]);
        requestAnimationFrame(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
        return;
      }
    }

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

      const { data, error: invokeError } = await supabase.functions.invoke('ask-proxy', {
        body: {
          message: text,
          currency: profile?.currency ?? 'EGP',
          categories: categories.map((c) => ({ id: c.id, name: c.name })),
        },
      });

      if (invokeError) throw new Error('Assistant is unavailable right now.');

      const reply = typeof data?.reply === 'string' ? data.reply : "Done, but I didn't get a reply message.";
      setMessages((prev) => [...prev, { role: 'assistant', text: reply, kind: isLogCommand ? 'log' : undefined }]);
      // The backend may have just written a transaction -- refetch rather than trust
      // stale numbers fetched on mount, since a later "can I afford X" in the same
      // conversation needs the post-write balance, not the one from before this send.
      await Promise.all([refetchTransactions(), refetchBalance()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSending(false);
      requestAnimationFrame(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
    }
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    void sendMessage(input.trim());
  };

  const displayError = error ?? voiceError;

  return (
    <div className="flex h-full flex-col pb-16">
      <div className="px-4 pb-2 pt-6">
        <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">Ask</h1>
        <p className="text-sm text-stone-500 dark:text-stone-400">Tell it what happened, it updates your account.</p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4" role="log" aria-live="polite" aria-atomic="false">
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="animate-row-in flex justify-end">
              <div className="max-w-[80%] rounded-2xl bg-brand px-3.5 py-2.5 text-sm text-white">{m.text}</div>
            </div>
          ) : (
            <div key={i} className="animate-row-in flex gap-2.5">
              <div
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  m.kind === 'log'
                    ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                    : 'bg-brand/10 text-brand'
                }`}
              >
                {m.kind === 'log' ? <CheckCircle2 size={15} /> : <Sparkles size={15} />}
              </div>
              <div className="min-w-0 flex-1 pt-1">
                {m.kind === 'log' && (
                  <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                    Logged
                  </p>
                )}
                {m.chart && m.chart.length > 0 && (
                  <div className="mb-2 h-44 w-full max-w-[min(320px,80vw)] rounded-xl border border-stone-100 bg-white p-2 shadow-sm shadow-stone-200/60 dark:border-stone-700 dark:bg-stone-800 dark:shadow-black/30">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={m.chart} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
                        <XAxis type="number" hide />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={72}
                          tick={{ fontSize: 11, fill: isDark ? '#a8a29e' : '#78716c' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip formatter={(value) => formatCurrency(Number(value), currency)} contentStyle={chartTooltipStyle} />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]} animationDuration={450} animationEasing="ease-out">
                          {m.chart.map((d) => (
                            <Cell key={d.name} fill={d.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                  {renderWithBoldNumbers(m.text)}
                </p>
              </div>
            </div>
          ),
        )}
        {sending && (
          <div className="flex gap-2.5">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Sparkles size={15} />
            </div>
            <div className="flex items-center gap-1 pt-3.5">
              <span className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-stone-400 dark:bg-stone-600 [animation-delay:0s]" />
              <span className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-stone-400 dark:bg-stone-600 [animation-delay:0.15s]" />
              <span className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-stone-400 dark:bg-stone-600 [animation-delay:0.3s]" />
            </div>
          </div>
        )}
        {displayError && <p className="text-center text-xs text-red-600 dark:text-red-400">{displayError}</p>}
        <div ref={listEndRef} />
      </div>

      <div className="flex gap-2 overflow-x-auto border-t border-stone-100 px-4 pt-2.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-stone-800">
        {quickReplies.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => void sendMessage(q)}
            disabled={sending}
            className="shrink-0 whitespace-nowrap rounded-full border border-stone-200 px-3 py-1.5 text-xs text-stone-600 transition-all hover:border-brand hover:text-brand active:scale-95 disabled:opacity-50 dark:border-stone-700 dark:text-stone-400"
          >
            {q}
          </button>
        ))}
      </div>

      {voiceUnsupportedNotice && (
        <p className="animate-row-in px-4 pt-1.5 text-center text-xs text-stone-500 dark:text-stone-400">
          Voice input isn't available in this browser.
        </p>
      )}

      <form onSubmit={send} className="flex items-center gap-2 px-4 pt-1.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {listening ? (
          <>
            <button
              type="button"
              onClick={cancelRecording}
              aria-label="Cancel recording"
              className="shrink-0 rounded-full p-2.5 text-stone-500 transition-all active:scale-90 dark:text-stone-400"
            >
              <Trash2 size={20} />
            </button>
            <div
              role="status"
              aria-label={`Recording, ${formatDuration(recordingMs)} elapsed`}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3.5 py-2.5 dark:border-red-500/30 dark:bg-red-500/10"
            >
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
              <div className="flex h-5 flex-1 items-center justify-center gap-[3px] overflow-hidden" aria-hidden="true">
                {WAVEFORM_BARS.map((bar, i) => (
                  <span
                    key={i}
                    className="w-[3px] shrink-0 rounded-full bg-red-400 dark:bg-red-500"
                    style={{ animation: `voice-bar ${bar.durationMs}ms ease-in-out ${bar.delayMs}ms infinite` }}
                  />
                ))}
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-red-600 dark:text-red-400">
                {formatDuration(recordingMs)}
              </span>
            </div>
            <button
              type="button"
              onClick={toggleListening}
              aria-label="Stop recording"
              className="shrink-0 rounded-full bg-red-500 p-2.5 text-white transition-transform active:scale-90"
            >
              <Square size={16} fill="currentColor" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleListening}
              aria-label={voiceSupported ? 'Start voice input' : 'Voice input not supported'}
              className={`shrink-0 rounded-full p-2.5 transition-all active:scale-90 ${
                voiceSupported
                  ? 'text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800'
                  : 'text-stone-300 dark:text-stone-700'
              }`}
            >
              <Mic size={20} />
            </button>
            <input
              type="text"
              aria-label="Message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. spent 50 on food"
              className="min-w-0 flex-1 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-800 outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send"
              className="shrink-0 rounded-full bg-brand p-2.5 text-white transition-transform active:scale-90 disabled:opacity-50 disabled:active:scale-100"
            >
              <Send size={18} />
            </button>
          </>
        )}
      </form>
    </div>
  );
}
