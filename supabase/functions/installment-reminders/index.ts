import { createClient } from 'jsr:@supabase/supabase-js@2.112.3';
import { nextInstallment, reminderOffsetFor, type InstallmentPlan, type ReminderOffset } from '../../../src/lib/installments.ts';
import { sendPushNotification } from '../_shared/push.ts';

// Triggered daily by pg_cron/pg_net (see supabase/installment-reminders-cron.sql), not by a
// user session: the shared secret in X-Reminder-Secret is the auth, the same one the card
// payment-reminders function uses.

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Constant-time comparison, so response timing can't leak how much of the secret matched.
function secretsMatch(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

interface PlanRow extends InstallmentPlan {
  user_id: string;
}

interface DuePlan {
  plan: PlanRow;
  offset: ReminderOffset;
  dueDate: string;
}

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
  if (body.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return jsonResponse({ error: 'date must be YYYY-MM-DD' }, 400);
  }

  // `date` lets a test run pin "today" (e.g. the February clamp); a real cron run omits it.
  // Noon UTC is the same calendar day in Cairo whatever the DST offset.
  const today = body.date ? new Date(`${body.date}T12:00:00Z`) : new Date();
  const dryRun = body.dryRun === true;

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: plans, error: plansError } = await admin
    .from('installment_plans')
    .select('id, user_id, name, monthly_amount, months_total, first_due_date, paid_count, cash_price');
  if (plansError) {
    return jsonResponse({ error: plansError.message }, 500);
  }

  const due: DuePlan[] = [];
  for (const plan of (plans ?? []) as PlanRow[]) {
    const next = nextInstallment(plan, today);
    if (!next) continue; // fully paid
    const offset = reminderOffsetFor(next.daysUntil);
    if (offset === null) continue;
    due.push({ plan, offset, dueDate: next.dueDate });
  }

  const byUser = new Map<string, DuePlan[]>();
  for (const d of due) {
    const list = byUser.get(d.plan.user_id) ?? [];
    list.push(d);
    byUser.set(d.plan.user_id, list);
  }

  const sent: { userId: string; offset: number; plans: number; pushed: boolean }[] = [];

  for (const [userId, userPlans] of byUser) {
    for (const offset of [3, 0] as const) {
      const group = userPlans.filter((d) => d.offset === offset);
      if (group.length === 0) continue;

      if (dryRun) {
        sent.push({ userId, offset, plans: group.length, pushed: false });
        continue;
      }

      // Insert-before-send: a unique violation on (plan_id, due_date, offset_days) means this
      // exact reminder already went out, so the plan is dropped from this run.
      const survivors: DuePlan[] = [];
      for (const d of group) {
        const { error } = await admin.from('installment_reminders').insert({
          user_id: userId,
          plan_id: d.plan.id,
          due_date: d.dueDate,
          offset_days: offset,
        });
        if (!error) survivors.push(d);
      }
      if (survivors.length === 0) continue;

      let pushed = false;
      const { data: subscriptions } = await admin
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', userId);
      if (subscriptions && subscriptions.length > 0) {
        const when = offset === 0 ? 'today' : 'in 3 days';
        // Deliberately no amounts: this text shows on the lock screen.
        await sendPushNotification(admin, subscriptions, {
          title: survivors.length > 1 ? `${survivors.length} installments due ${when}` : `Installment due ${when}`,
          body: survivors.map((d) => d.plan.name).join(' · '),
          url: '/installments',
        });
        pushed = true;
      }

      sent.push({ userId, offset, plans: survivors.length, pushed });
    }
  }

  return jsonResponse({ dryRun, due: due.length, sent });
});
