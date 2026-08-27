import webPush from 'npm:web-push@3.6.7';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.112.3';

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Sends a Web Push notification to every subscription a user has enabled
 * (one per browser/device). Silently no-ops if the VAPID secrets haven't been
 * configured yet, rather than failing the SMS webhook over an optional
 * feature -- the transaction itself is already logged by the time this runs.
 *
 * A subscription the push service reports as gone (410) or unknown (404) is
 * stale -- the user uninstalled the app or cleared site data -- and is
 * deleted so it stops being retried on every future transaction.
 */
export async function sendPushNotification(
  supabaseAdmin: SupabaseClient,
  subscriptions: PushSubscriptionRow[],
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject || subscriptions.length === 0) return;

  webPush.setVapidDetails(subject, publicKey, privateKey);

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      ),
    ),
  );

  const staleEndpoints = subscriptions
    .filter((_, i) => {
      const result = results[i];
      return result.status === 'rejected' && [404, 410].includes((result.reason as { statusCode?: number })?.statusCode ?? 0);
    })
    .map((sub) => sub.endpoint);

  if (staleEndpoints.length > 0) {
    await supabaseAdmin.from('push_subscriptions').delete().in('endpoint', staleEndpoints);
  }
}
