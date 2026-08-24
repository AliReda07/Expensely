import { createClient } from 'jsr:@supabase/supabase-js@2';

const N8N_WEBHOOK_URL = Deno.env.get('N8N_ASK_WEBHOOK_URL');
const N8N_WEBHOOK_SECRET = Deno.env.get('N8N_ASK_WEBHOOK_SECRET');

interface AskRequestBody {
  message?: string;
  currency?: string;
  categories?: { id: string; name: string }[];
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
      categories: Array.isArray(body.categories) ? body.categories : [],
    }),
  });

  if (!n8nRes.ok) {
    return jsonResponse({ error: 'Assistant is unavailable.' }, 502);
  }

  const data = await n8nRes.json().catch(() => ({}));
  return jsonResponse({ reply: typeof data?.reply === 'string' ? data.reply : null });
});
