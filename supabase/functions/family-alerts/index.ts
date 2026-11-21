import { createClient } from 'jsr:@supabase/supabase-js@2.112.3';
import { composePush, type DigestRow } from '../../../src/lib/familyAlertPush.ts';
import { sendPushNotification } from '../_shared/push.ts';

// Triggered daily by pg_cron/pg_net (see supabase/family-alerts-cron.sql), not by a user session:
// the shared secret in X-Reminder-Secret is the auth, the same one the other reminder jobs use.
// Tells each premium household owner about members at 80% / over a budget and about large
// purchases, once per alert (family_alert_log), with no amounts in the notification.

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

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const expectedSecret = Deno.env.get('REMINDER_CRON_SECRET');
  if (!expectedSecret || !secretsMatch(req.headers.get('X-Reminder-Secret') ?? '', expectedSecret)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body: { dryRun?: boolean } = {};
  const rawBody = await req.text();
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }
  }
  const dryRun = body.dryRun === true;

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: rows, error: digestError } = await admin.rpc('family_alerts_digest');
  if (digestError) {
    return jsonResponse({ error: digestError.message }, 500);
  }

  const byOwner = new Map<string, DigestRow[]>();
  for (const row of (rows ?? []) as DigestRow[]) {
    const list = byOwner.get(row.owner_id) ?? [];
    list.push(row);
    byOwner.set(row.owner_id, list);
  }

  const results: { ownerId: string; alerts: number; newAlerts: number; pushed: boolean; reason?: string }[] = [];

  for (const [ownerId, ownerRows] of byOwner) {
    // No device with push enabled: the dashboard still shows the alerts, and nothing is logged,
    // so turning push on later doesn't leave these marked as already sent.
    const { data: subscriptions } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', ownerId);
    if (!subscriptions || subscriptions.length === 0) {
      results.push({ ownerId, alerts: ownerRows.length, newAlerts: 0, pushed: false, reason: 'no-push-devices' });
      continue;
    }

    // Insert-before-send: a unique violation on (owner_id, alert_key) means this alert already
    // went out, so it is dropped. A dry run only reads, to report what would be sent.
    const fresh: DigestRow[] = [];
    if (dryRun) {
      const { data: logged } = await admin.from('family_alert_log').select('alert_key').eq('owner_id', ownerId);
      const seen = new Set((logged ?? []).map((l) => l.alert_key as string));
      fresh.push(...ownerRows.filter((r) => !seen.has(r.a_key)));
    } else {
      for (const row of ownerRows) {
        const { error } = await admin.from('family_alert_log').insert({ owner_id: ownerId, alert_key: row.a_key });
        if (!error) fresh.push(row);
      }
    }
    if (fresh.length === 0) {
      results.push({ ownerId, alerts: ownerRows.length, newAlerts: 0, pushed: false, reason: 'already-sent' });
      continue;
    }

    let pushed = false;
    if (!dryRun) {
      const { title, body: text } = composePush(fresh);
      await sendPushNotification(admin, subscriptions, { title, body: text, url: '/family' });
      pushed = true;
    }
    results.push({ ownerId, alerts: ownerRows.length, newAlerts: fresh.length, pushed });
  }

  return jsonResponse({ dryRun, owners: byOwner.size, results });
});
