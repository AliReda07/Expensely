import { createClient } from 'jsr:@supabase/supabase-js@2';

const N8N_WEBHOOK_URL = Deno.env.get('N8N_ASK_WEBHOOK_URL');
const N8N_WEBHOOK_SECRET = Deno.env.get('N8N_ASK_WEBHOOK_SECRET');

interface AskRequestBody {
  message?: string;
  currency?: string;
  categories?: { id: string; name: string }[];
}

// Pinned to the app's own origin rather than '*'. Not exploitable either way -- auth here
// is a bearer token, not a cookie, so a hostile origin has no ambient credential to ride --
// but there is no reason for any other origin to be able to call this at all. Falls back to
// '*' only when the secret is unset, so a project that hasn't run `supabase secrets set
// APP_ORIGIN=...` yet keeps working instead of failing in a way that looks like a bug.
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') ?? '*';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': APP_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};

// This message is forwarded verbatim into an LLM prompt, and the categories list lands in
// the same prompt. Both are client-supplied, so without a ceiling any signed-in user can
// run up the OpenRouter bill by sending megabytes.
const MAX_MESSAGE_LENGTH = 500;
const MAX_CATEGORIES = 50;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!N8N_WEBHOOK_URL || !N8N_WEBHOOK_SECRET) {
    return jsonResponse({ error: 'Assistant is not configured.' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body: AskRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return jsonResponse({ error: 'Message is required' }, 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse({ error: 'Message is too long.' }, 400);
  }

  // The user's identity comes from the verified session above, not from the client body —
  // n8n never sees the user's access token, only this already-authenticated user_id.
  const n8nRes = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': N8N_WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      message,
      user_id: user.id,
      currency: typeof body.currency === 'string' ? body.currency : 'EGP',
      categories: Array.isArray(body.categories) ? body.categories.slice(0, MAX_CATEGORIES) : [],
    }),
  });

  if (!n8nRes.ok) {
    return jsonResponse({ error: 'Assistant is unavailable.' }, 502);
  }

  const data = await n8nRes.json().catch(() => ({}));
  return jsonResponse({ reply: typeof data?.reply === 'string' ? data.reply : null });
});
