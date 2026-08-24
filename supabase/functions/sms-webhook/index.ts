import { createClient } from 'jsr:@supabase/supabase-js@2';

const N8N_WEBHOOK_URL = Deno.env.get('N8N_ASK_WEBHOOK_URL');
const N8N_WEBHOOK_SECRET = Deno.env.get('N8N_ASK_WEBHOOK_SECRET');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function textResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS_HEADERS },
  });
}

// Called by a phone-side automation (e.g. an iOS Shortcut triggered on an
// incoming bank SMS), not by the app itself, so there is no Supabase session
// to verify -- the random token in the URL path is what identifies the user.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return textResponse('Method not allowed', 405);
  }

  if (!N8N_WEBHOOK_URL || !N8N_WEBHOOK_SECRET) {
    return textResponse('Assistant is not configured.', 500);
  }

  const token = new URL(req.url).pathname.split('/').filter(Boolean).pop();
  if (!token || token === 'sms-webhook') {
    return textResponse('Missing token in URL.', 400);
  }

  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, currency')
    .eq('sms_token', token)
    .maybeSingle();

  if (profileError || !profile) {
    return textResponse('Unknown token.', 401);
  }

  const message = (await req.text()).trim();
  if (!message) {
    return textResponse('Empty message body.', 400);
  }

  const { data: categoryRows } = await supabaseAdmin
    .from('categories')
    .select('id, name')
    .or(`user_id.eq.${profile.id},is_preset.eq.true`);

  const n8nRes = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': N8N_WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      message,
      user_id: profile.id,
      currency: profile.currency,
      categories: categoryRows ?? [],
    }),
  });

  if (!n8nRes.ok) {
    return textResponse('Assistant is unavailable.', 502);
  }

  const data = await n8nRes.json().catch(() => ({}));
  return textResponse(typeof data?.reply === 'string' ? data.reply : 'Logged.');
});
