import { createClient } from 'jsr:@supabase/supabase-js@2';

// Permanently deletes the signed-in user's account. Every table that holds user data references
// auth.users with ON DELETE CASCADE (verified in the export/delete migration tests), so deleting
// the auth user removes it all in one step: transactions, cards, budgets, installments, push
// devices, plan and usage rows, and any family they own. Members of a deleted family keep their
// own data.
//
// Safeguards: the caller must be signed in, and must send their own email address as a typed
// confirmation, so a stray or forged request cannot delete anything on its own.

const APP_ORIGIN = Deno.env.get('APP_ORIGIN') ?? '*';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': APP_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
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

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await asUser.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body: { confirm_email?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }

  const typed = typeof body.confirm_email === 'string' ? body.confirm_email.trim().toLowerCase() : '';
  if (!user.email || typed !== user.email.toLowerCase()) {
    return jsonResponse({ error: 'confirmation_mismatch' }, 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('delete-account failed', deleteError.message);
    return jsonResponse({ error: 'Could not delete the account. Please try again.' }, 500);
  }

  return jsonResponse({ deleted: true });
});
