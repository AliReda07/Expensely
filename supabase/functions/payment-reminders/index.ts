import { createClient } from 'jsr:@supabase/supabase-js@2.112.3';
import { daysUntilDue, isPaidThisCycle, nextDueDate, type MinimalTransaction } from '../../../src/lib/dueDate.ts';
import { sendPushNotification } from '../_shared/push.ts';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function formatAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Constant-time over the shared cron secret. A plain `!==` short-circuits at the first
// differing byte, which leaks the matching prefix through response timing -- barely
// measurable across a network, but the whole comparison is four lines either way.
function secretsMatch(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

interface EmailCard {
  card: { name: string; last4: string | null; color: string };
  owed: number;
  dueDate: string;
}

// Inline-styled and table-based rather than flexbox/grid -- email clients (Outlook in
// particular) strip <style> blocks and don't reliably support modern CSS layout, so
// the same conventions the rest of the web ignores still matter here. Colors mirror
// the app's own tokens (src/index.css's --color-brand* trio) and the amber/red
// severity split already used for the badge and banner in the UI. The Google Fonts
// <link> loads Sora for the wordmark only, matching --font-brand -- everything else
// stays system sans, same split the app itself makes (see PRODUCT.md).
function buildEmailHtml(offsetDays: 7 | 1, survivors: EmailCard[], currency: string): string {
  const label = offsetDays === 7 ? 'in 7 days' : 'tomorrow';
  const severity = offsetDays === 1 ? { fg: '#b91c1c', bg: '#fef2f2', border: '#fecaca' } : { fg: '#b45309', bg: '#fffbeb', border: '#fde68a' };
  const heading = survivors.length > 1 ? `${survivors.length} card payments due ${label}` : `Payment due ${label}`;
  const total = survivors.reduce((sum, d) => sum + d.owed, 0);

  const intro =
    offsetDays === 7
      ? `Here's a heads-up a week out so there's time to plan${survivors.length > 1 ? ' for these' : ''}.`
      : `Last call -- ${survivors.length > 1 ? 'these are' : 'this is'} due tomorrow.`;

  const rows = survivors
    .map(
      (d) => `
        <tr>
          <td style="padding:16px 20px;border-bottom:1px solid #e7e5e4;">
            <table role="presentation" style="border-collapse:collapse;">
              <tr>
                <td style="width:10px;padding:0 10px 0 0;vertical-align:middle;">
                  <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background-color:${d.card.color};"></span>
                </td>
                <td style="vertical-align:middle;">
                  <div style="font-size:14px;font-weight:600;color:#1c1917;">
                    ${escapeHtml(d.card.name)}${d.card.last4 ? ` <span style="font-weight:400;color:#78716c;">••${d.card.last4}</span>` : ''}
                  </div>
                  <div style="font-size:12px;color:#78716c;margin-top:3px;">Due ${d.dueDate}</div>
                </td>
              </tr>
            </table>
          </td>
          <td style="padding:16px 20px;border-bottom:1px solid #e7e5e4;text-align:right;font-size:15px;font-weight:600;color:#1c1917;white-space:nowrap;vertical-align:top;">
            ${formatAmount(d.owed, currency)}
          </td>
        </tr>`,
    )
    .join('');

  const totalRow =
    survivors.length > 1
      ? `
        <tr>
          <td style="padding:14px 20px;font-size:13px;font-weight:600;color:#57534e;">Total</td>
          <td style="padding:14px 20px;text-align:right;font-size:15px;font-weight:700;color:#1c1917;">${formatAmount(total, currency)}</td>
        </tr>`
      : '';

  const nextStep =
    offsetDays === 7
      ? "You'll get one more reminder the day it's due."
      : "This is the last reminder for this billing cycle.";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Sora:wght@700&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0;padding:0;background-color:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" style="background-color:#f5f5f4;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background-color:#1a3a8f;background-image:linear-gradient(135deg,#3568f0,#0a1230);padding:28px 24px;">
                <p style="margin:0;font-family:'Sora',ui-sans-serif,system-ui,sans-serif;font-size:20px;font-weight:700;color:#ffffff;">£xpensely</p>
                <p style="margin:14px 0 0;font-size:21px;font-weight:700;color:#ffffff;line-height:1.35;">${escapeHtml(heading)}</p>
                <p style="margin:8px 0 0;font-size:14px;font-weight:${offsetDays === 1 ? '700' : '400'};color:${offsetDays === 1 ? '#ff6b6b' : '#c7d6fb'};line-height:1.5;">${escapeHtml(intro)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px 0;">
                ${
                  offsetDays === 1
                    ? `<p style="margin:0;font-size:14px;font-weight:700;color:${severity.fg};">Due tomorrow</p>`
                    : `<span style="display:inline-block;font-size:12px;font-weight:600;color:${severity.fg};background-color:${severity.bg};border:1px solid ${severity.border};border-radius:999px;padding:4px 12px;">Due in 7 days</span>`
                }
              </td>
            </tr>
            <tr>
              <td>
                <table role="presentation" width="100%" style="border-collapse:collapse;margin-top:8px;">
                  ${rows}
                  ${totalRow}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 20px 4px;">
                <p style="margin:0;font-size:13px;color:#57534e;line-height:1.6;">${escapeHtml(nextStep)} Already paid? This clears itself once the payment shows up in Expensely -- no need to do anything here.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 20px 22px;text-align:center;border-top:1px solid #e7e5e4;margin-top:16px;">
                <p style="margin:16px 0 0;font-size:12px;color:#a8a29e;">Sent automatically by Expensely's payment reminders. Manage due days from the card's edit screen in the app.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

interface CardRow {
  id: string;
  user_id: string;
  name: string;
  last4: string | null;
  color: string;
  starting_balance: number;
  payment_due_day: number;
}

interface DueCard {
  card: CardRow;
  offsetDays: 7 | 1;
  owed: number;
  dueDate: string;
}

// Triggered daily by pg_cron/pg_net (see Step 5 of PAYMENT_REMINDERS_PLAN.md), not by a
// user session -- the shared secret in X-Reminder-Secret is the auth, not a Supabase JWT.
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const expectedSecret = Deno.env.get('REMINDER_CRON_SECRET');
  if (!expectedSecret || !secretsMatch(req.headers.get('X-Reminder-Secret') ?? '', expectedSecret)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body: { date?: string; dryRun?: boolean } = {};
  const rawBody = await req.text();
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }
  }

  // `date` lets a test invocation pin "today" (e.g. to exercise the February clamp
  // on a date that only exists as a due-day-31 edge case); a real cron run omits it.
  const today = body.date ? new Date(`${body.date}T00:00:00Z`) : new Date();
  const dryRun = body.dryRun === true;

  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: cards, error: cardsError } = await supabaseAdmin
    .from('cards')
    .select('id, user_id, name, last4, color, starting_balance, payment_due_day')
    .eq('type', 'credit')
    .not('payment_due_day', 'is', null);

  if (cardsError) {
    return jsonResponse({ error: cardsError.message }, 500);
  }
  if (!cards || cards.length === 0) {
    return jsonResponse({ dryRun, due: 0, sent: [], skipped: [] });
  }

  const { data: allTx } = await supabaseAdmin
    .from('transactions')
    .select('card_id, type, amount, date')
    .in(
      'card_id',
      cards.map((c) => c.id),
    );

  const txByCard = new Map<string, (MinimalTransaction & { amount: number })[]>();
  for (const t of allTx ?? []) {
    if (!t.card_id) continue;
    const list = txByCard.get(t.card_id) ?? [];
    list.push(t);
    txByCard.set(t.card_id, list);
  }

  const due: DueCard[] = [];
  const skipped: { cardId: string; reason: string }[] = [];

  for (const card of cards as CardRow[]) {
    const dueDay = card.payment_due_day;
    const days = daysUntilDue(dueDay, today);
    if (days !== 7 && days !== 1) continue;

    const tx = txByCard.get(card.id) ?? [];
    // Mirrors the credit branch of src/hooks/useBalance.ts exactly: starting_balance +
    // expenses - income. The client (badge) and this function (email/push) must agree
    // on the figure quoted, or the two channels will contradict each other.
    const owed = tx.reduce(
      (sum, t) => sum + (t.type === 'expense' ? Number(t.amount) : -Number(t.amount)),
      Number(card.starting_balance),
    );

    if (owed <= 0) {
      skipped.push({ cardId: card.id, reason: 'zero-or-negative-balance' });
      continue;
    }
    if (isPaidThisCycle(dueDay, today, card.id, tx)) {
      skipped.push({ cardId: card.id, reason: 'already-paid-this-cycle' });
      continue;
    }

    due.push({
      card,
      offsetDays: days as 7 | 1,
      owed,
      dueDate: nextDueDate(dueDay, today).toISOString().slice(0, 10),
    });
  }

  const byUser = new Map<string, DueCard[]>();
  for (const d of due) {
    const list = byUser.get(d.card.user_id) ?? [];
    list.push(d);
    byUser.set(d.card.user_id, list);
  }

  const sent: { userId: string; offsetDays: number; cards: string[]; emailed: boolean; pushed: boolean }[] = [];

  for (const [userId, userCards] of byUser) {
    for (const offsetDays of [7, 1] as const) {
      const group = userCards.filter((d) => d.offsetDays === offsetDays);
      if (group.length === 0) continue;

      if (dryRun) {
        sent.push({ userId, offsetDays, cards: group.map((d) => d.card.name), emailed: false, pushed: false });
        continue;
      }

      // Insert-before-send: a unique-violation on (card_id, due_date, offset_days)
      // means this exact reminder already went out on a previous run, so that card
      // is dropped here rather than re-sent. If every card for this user/offset is a
      // duplicate, nothing further happens for this group.
      const survivors: DueCard[] = [];
      for (const d of group) {
        const { error } = await supabaseAdmin.from('payment_reminders').insert({
          user_id: userId,
          card_id: d.card.id,
          due_date: d.dueDate,
          offset_days: offsetDays,
          amount_owed: d.owed,
        });
        if (!error) survivors.push(d);
      }
      if (survivors.length === 0) continue;

      const label = offsetDays === 7 ? 'in 7 days' : 'tomorrow';

      const { data: profileRow } = await supabaseAdmin.from('profiles').select('currency').eq('id', userId).maybeSingle();
      const currency = profileRow?.currency ?? 'EGP';

      let emailed = false;
      const resendKey = Deno.env.get('RESEND_API_KEY');
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
      const email = userData?.user?.email;
      if (email && resendKey) {
        const lines = survivors.map((d) => `${d.card.name}: ${formatAmount(d.owed, currency)} (due ${d.dueDate})`).join('\n');
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'onboarding@resend.dev',
            to: email,
            subject: survivors.length > 1 ? `${survivors.length} card payments due ${label}` : `Payment due ${label}`,
            // `text` is the fallback for clients that don't render HTML; `html` is what
            // actually gets shown in the vast majority of inboxes.
            text: `The following card${survivors.length > 1 ? 's are' : ' is'} due ${label}:\n\n${lines}`,
            html: buildEmailHtml(offsetDays, survivors, currency),
          }),
        });
        emailed = res.ok;
      }

      let pushed = false;
      const { data: subscriptions } = await supabaseAdmin
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', userId);
      if (subscriptions && subscriptions.length > 0) {
        const title = survivors.length > 1 ? `${survivors.length} card payments due ${label}` : `${survivors[0].card.name} due ${label}`;
        await sendPushNotification(supabaseAdmin, subscriptions, {
          title,
          body: survivors.map((d) => `${d.card.name}: ${formatAmount(d.owed, currency)}`).join(' · '),
          url: '/',
        });
        pushed = true;
      }

      sent.push({ userId, offsetDays, cards: survivors.map((d) => d.card.name), emailed, pushed });
    }
  }

  return jsonResponse({ dryRun, due: due.length, sent, skipped });
});
