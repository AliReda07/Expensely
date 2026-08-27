import { createClient } from 'jsr:@supabase/supabase-js@2.112.3';
import {
  detectDirection,
  extractTransferParty,
  looksLikeInstantTransfer,
  looksLikeTransfer,
  matchCardByPhrase,
  parseSmsPayload,
  parseTransaction,
} from '../_shared/categorize.ts';
import { sendPushNotification } from '../_shared/push.ts';

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

function formatAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Called by a phone-side automation (e.g. an iOS Shortcut triggered on an
// incoming bank SMS), not by the app itself, so there is no Supabase session
// to verify -- the random token in the URL path is what identifies the user.
//
// Parsing and categorization happen locally here (see ../_shared/categorize.ts)
// rather than round-tripping through an external LLM workflow, so behavior is
// deterministic and the same message always produces the same result.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return textResponse('Method not allowed', 405);
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

  const { message, sender } = parseSmsPayload(await req.text());
  if (!message) {
    return textResponse('Empty message body.', 400);
  }

  const { data: categoryRows } = await supabaseAdmin
    .from('categories')
    .select('id, name')
    .or(`user_id.eq.${profile.id},is_preset.eq.true`);

  // Strict mode: reject a message unless it has both a currency-adjacent amount and an
  // actual transaction verb/direction, not just any number next to a currency code --
  // a promo SMS quoting a discount cap ("capped at EGP 5,000") has the latter without
  // the former and would otherwise be booked as a real expense.
  const parsed = parseTransaction(message, categoryRows ?? [], { strict: true });
  if (!parsed) {
    return textResponse("Doesn't look like a real transaction — nothing logged.");
  }

  // Bank SMS usually name the card ("ending 1234"). Last four digits are unique
  // per user, so this resolves to at most one card; an unrecognised or absent
  // number simply books the transaction as unassigned rather than guessing.
  let card: { id: string; name: string; last4: string | null } | null = null;
  if (parsed.cardLast4) {
    const { data: cardRow } = await supabaseAdmin
      .from('cards')
      .select('id, name, last4')
      .eq('user_id', profile.id)
      .eq('last4', parsed.cardLast4)
      .maybeSingle();
    card = cardRow ?? null;
  }

  // Fallback for banks that never mention the card digits at all: if the client sent
  // who the SMS was from and the user has exactly one card registered to that sender,
  // use it. Never guess between multiple candidates.
  if (!card && sender) {
    const { data: senderMatches } = await supabaseAdmin
      .from('cards')
      .select('id, name, last4')
      .eq('user_id', profile.id)
      .ilike('bank_sender', sender);
    if (senderMatches && senderMatches.length === 1) {
      card = senderMatches[0];
    }
  }

  // Second fallback, for the same problem, that needs no cooperation from the phone
  // side at all: a phrase unique to this bank's SMS template, matched against the
  // message body itself. Useful when bank_sender can't be resolved because the phone's
  // SMS automation has no way to filter by this bank as a sender in the first place.
  // Fetches every card rather than filtering for a non-empty phrase list server-side --
  // a user has at most a handful of cards, and matchCardByPhrase already skips any card
  // with no phrases (an empty array never satisfies its `.some(...)` check).
  if (!card) {
    const { data: phraseCandidates } = await supabaseAdmin
      .from('cards')
      .select('id, name, last4, sms_match_phrases')
      .eq('user_id', profile.id);
    const matchedId = matchCardByPhrase(message, phraseCandidates ?? []);
    if (matchedId) {
      card = (phraseCandidates ?? []).find((c) => c.id === matchedId) ?? null;
    }
  }

  // Visible marker for "this was a transfer", separate from getting income/expense
  // right (that's parsed.type, driven by detectDirection in categorize.ts). "Instant"
  // is the more specific tag when the message says so; plain "Transfer" otherwise.
  const transferTag = looksLikeInstantTransfer(message) ? ' (Instant transfer)' : looksLikeTransfer(message) ? ' (Transfer)' : '';

  // For a transfer, who the money actually went to/came from is more useful than the
  // raw SMS text as the note -- e.g. "To ALI A**** M******" instead of a truncated
  // Arabic sentence. Falls back to the raw message (as before) when the bank's SMS
  // doesn't name the other party in a recognizable position; see extractTransferParty.
  let note = message.slice(0, 300) + transferTag;
  if (transferTag) {
    const direction = detectDirection(message);
    const party = extractTransferParty(message, direction);
    if (party) {
      note = direction === 'out' ? `To ${party}` : `From ${party}`;
    }
  }

  const { error: insertError } = await supabaseAdmin.from('transactions').insert({
    user_id: profile.id,
    type: parsed.type,
    amount: parsed.amount,
    category_id: parsed.category?.id ?? null,
    card_id: card?.id ?? null,
    date: new Date().toISOString().slice(0, 10),
    note,
  });

  if (insertError) {
    return textResponse('Could not log that transaction.', 500);
  }

  const amountText = formatAmount(parsed.amount, profile.currency);
  const categoryText = parsed.category ? ` under ${parsed.category.name}` : ' (uncategorized)';
  const cardText = card
    ? ` on ${card.name}`
    : parsed.cardLast4
      ? ` (no card saved ending ${parsed.cardLast4})`
      : '';

  // Runs from a phone-side automation, not the app itself, so the user isn't
  // necessarily looking at the app when this happens -- a real push is what
  // actually reaches them, not an in-app toast they'd have to be present for.
  const { data: subscriptions } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', profile.id);

  if (subscriptions && subscriptions.length > 0) {
    await sendPushNotification(supabaseAdmin, subscriptions, {
      title: `${parsed.type === 'income' ? '+' : '-'}${amountText}`,
      body: `${card ? card.name : 'Transaction'}${categoryText}`,
      url: '/',
    });
  }

  return textResponse(`Logged ${amountText} ${parsed.type}${categoryText}${cardText}.`);
});
