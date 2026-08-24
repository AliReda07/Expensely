import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Mic, Send, Sparkles } from 'lucide-react';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import { useCategories } from '../hooks/useCategories';
import { useProfile } from '../hooks/useProfile';
import { useTransactions } from '../hooks/useTransactions';
import { useBalance } from '../hooks/useBalance';
import { useBudgets } from '../hooks/useBudgets';
import { formatCurrency, monthRange } from '../lib/format';

interface CategoryChartDatum {
  name: string;
  value: number;
  color: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  chart?: CategoryChartDatum[];
}

const TOP_CATEGORIES_PATTERN = /top\s+categor/i;
const AFFORD_PATTERN = /\bafford\b/i;

const WEBHOOK_URL = import.meta.env.VITE_N8N_ASK_WEBHOOK_URL as string | undefined;
const WEBHOOK_SECRET = import.meta.env.VITE_N8N_ASK_WEBHOOK_SECRET as string | undefined;

interface SpeechRecognitionResultLike {
  transcript: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
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

function renderWithBoldNumbers(text: string) {
  const parts = text.split(NUMBER_PATTERN);
  const numbers = text.match(NUMBER_PATTERN) ?? [];
  const nodes: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part) nodes.push(part);
    if (i < numbers.length) nodes.push(<strong key={i} className="font-semibold text-slate-900">{numbers[i]}</strong>);
  });
  return nodes;
}

export function Ask() {
  const { categories } = useCategories();
  const { profile } = useProfile();
  const currency = profile?.currency ?? 'EGP';

  const { start: monthStart, end: monthEnd } = monthRange(new Date());
  const { transactions } = useTransactions(categories, { start: monthStart, end: monthEnd });
  const { balance } = useBalance(profile?.starting_balance);
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
      const color = t.category?.color ?? '#64748b';
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
  const [listening, setListening] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const configured = Boolean(WEBHOOK_URL);
  const voiceSupported = typeof window !== 'undefined' && Boolean(getSpeechRecognitionCtor());

  const quickReplies = [
    'How much did I spend this month?',
    'Can I afford a 5000 trip this weekend?',
    'Find expenses over 1000',
    'Show top categories',
  ];

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const sendMessage = async (text: string) => {
    if (!text || sending) return;

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setError(null);

    if (TOP_CATEGORIES_PATTERN.test(text)) {
      setMessages((prev) => [...prev, topCategoriesReply()]);
      requestAnimationFrame(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
      return;
    }

    if (AFFORD_PATTERN.test(text)) {
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

  const send = (e: FormEvent) => {
    e.preventDefault();
    void sendMessage(input.trim());
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
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl bg-brand px-3.5 py-2.5 text-sm text-white">{m.text}</div>
                </div>
              ) : (
                <div key={i} className="flex gap-2.5">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <Sparkles size={15} />
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    {m.chart && m.chart.length > 0 && (
                      <div className="mb-2 h-44 w-full max-w-[min(320px,80vw)] rounded-xl border border-slate-100 bg-white p-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={m.chart} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
                            <XAxis type="number" hide />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={72}
                              tick={{ fontSize: 11 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip formatter={(value) => formatCurrency(Number(value), currency)} />
                            <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                              {m.chart.map((d) => (
                                <Cell key={d.name} fill={d.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
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
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300" />
                </div>
              </div>
            )}
            {error && <p className="text-center text-xs text-red-600">{error}</p>}
            <div ref={listEndRef} />
          </div>

          <div className="flex gap-2 overflow-x-auto border-t border-slate-100 px-4 pt-2.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {quickReplies.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void sendMessage(q)}
                disabled={sending}
                className="shrink-0 whitespace-nowrap rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          <form onSubmit={send} className="flex items-center gap-2 px-4 pt-1.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={toggleListening}
              disabled={!voiceSupported}
              title={voiceSupported ? (listening ? 'Stop listening' : 'Voice input') : 'Voice input not supported on this browser'}
              aria-label={listening ? 'Stop voice input' : 'Start voice input'}
              className={`shrink-0 rounded-full p-2.5 transition-colors ${
                listening
                  ? 'animate-pulse bg-red-50 text-red-500'
                  : voiceSupported
                    ? 'text-slate-500 hover:bg-slate-100'
                    : 'text-slate-300'
              }`}
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
