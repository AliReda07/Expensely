import { createClient } from 'jsr:@supabase/supabase-js@2.112.3';
import {
  computePromotedPhrases,
  detectDirection,
  extractTransferParty,
  instantTransferFee,
  looksLikeInstantTransfer,
  looksLikeTransfer,
  matchCardByPhrase,
  matchesPromotedPhrase,
  matchesTrustedSender,
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

// Web Push notification bodies are plain text -- there's no markup for bold. Swapping
// ASCII letters/digits for their Unicode "Mathematical Bold" lookalikes is a common
// plain-text trick to make the amount visually pop without any rendering support.
const BOLD_DIGIT_OFFSET = 0x1d7ce - 0x30;
const BOLD_UPPER_OFFSET = 0x1d400 - 0x41;
const BOLD_LOWER_OFFSET = 0x1d41a - 0x61;

function toBoldUnicode(text: string): string {
  return Array.from(text)
    .map((ch) => {
      const code = ch.codePointAt(0)!;
      if (code >= 0x30 && code <= 0x39) return String.fromCodePoint(code + BOLD_DIGIT_OFFSET);
      if (code >= 0x41 && code <= 0x5a) return String.fromCodePoint(code + BOLD_UPPER_OFFSET);
      if (code >= 0x61 && code <= 0x7a) return String.fromCodePoint(code + BOLD_LOWER_OFFSET);
      return ch;
    })
    .join('');
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

  // Fetched before parsing rather than after: a saved phrase does double duty -- it
  // resolves the card, and it is also the user's own declaration that this wording is a
  // real transaction template, which parseTransaction needs to know before it decides
  // whether to reject the message outright.
  const { data: cardRows } = await supabaseAdmin
    .from('cards')
    .select('id, name, last4, bank_sender, sms_match_phrases')
    .eq('user_id', profile.id);
  const userCards = cardRows ?? [];
  const phraseCardId = matchCardByPhrase(message, userCards);

  // Cross-user counterpart to the phrase check above: when several different users have
  // each typed the same wording into their own card's phrase field, that agreement is
  // itself a signal (see computePromotedPhrases) -- so it also waives the gate for a user
  // who never typed it themselves. Only the phrase label and who added it are read here
  // (`select` below is deliberately narrow) -- never anyone's SMS message content, and a
  // promoted phrase still never resolves *which* card a message belongs to for someone
  // who didn't add it; that stays exactly as narrow as matchCardByPhrase above.
  const { data: allPhraseRows } = await supabaseAdmin.from('cards').select('user_id, sms_match_phrases');
  const promotedPhrases = computePromotedPhrases(allPhraseRows ?? []);
  const isPromotedPhraseMatch = matchesPromotedPhrase(message, promotedPhrases);

  // Third trust signal, same job as the two above but via the sender label instead of
  // message wording: bank_sender is only ever set by the user themselves (see
  // AddCardForm), specifically to declare "messages labeled this way are from a real
  // bank" -- previously that declaration was only ever used to pick a card, never
  // consulted for whether to log the message at all, so a genuinely bank-sourced message
  // in unrecognized wording was rejected exactly like an unverified one would be.
  const hasTrustedSender = matchesTrustedSender(sender, userCards);

  // Strict mode: reject a message unless it has both a currency-adjacent amount and
  // (an actual transaction verb/direction, a phrase this user or enough other users have
  // saved, or a sender this user has already vouched for) -- not just any number next to
  // a currency code. A promo SMS quoting a discount cap ("capped at EGP 5,000") has none
  // of those and would otherwise be booked as a real expense.
  const parsed = parseTransaction(message, categoryRows ?? [], {
    strict: true,
    bypassVerbGate: phraseCardId !== null || isPromotedPhraseMatch || hasTrustedSender,
  });
  if (!parsed) {
    return textResponse("Doesn't look like a real transaction — nothing logged.");
  }

  // Resolution order: the card's own digits are the most specific signal (bank SMS
  // usually name the card, e.g. "ending 1234", and last four digits are unique per
  // user); then the SMS sender, for banks that never print the card digits at all, if
  // the client sent who the SMS was from and the user has exactly one card registered to
  // that sender; then the phrase matched above, for banks where neither of those is
  // available. The sender and phrase paths never guess between multiple candidates. An
  // unrecognised or absent card reference simply books the transaction as unassigned.
  let card: { id: string; name: string; last4: string | null } | null =
    parsed.cardLast4 ? (userCards.find((c) => c.last4 === parsed.cardLast4) ?? null) : null;
  if (!card && sender) {
    const senderMatches = userCards.filter((c) => c.bank_sender?.toLowerCase() === sender.toLowerCase());
    if (senderMatches.length === 1) {
      card = senderMatches[0];
    }
  }
  if (!card && phraseCardId) {
    card = userCards.find((c) => c.id === phraseCardId) ?? null;
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

  // Egyptian instant transfers carry a flat fee the bank never prints in the SMS and never
  // sends a separate message for (see instantTransferFee in categorize.ts), so the recorded
  // amount has to be the transfer plus the fee or the app's balance drifts by that fee on
  // every transfer. The note discloses it explicitly -- a stored amount that doesn't match
  // the SMS the user can still see in their inbox is otherwise just confusing.
  const fee = instantTransferFee(message);
  const amount = fee > 0 ? Math.round((parsed.amount + fee) * 100) / 100 : parsed.amount;
  if (fee > 0) {
    note += ` (incl. ${fee.toFixed(2)} fee)`;
  }

  const { error: insertError } = await supabaseAdmin.from('transactions').insert({
    user_id: profile.id,
    type: parsed.type,
    amount,
    category_id: parsed.category?.id ?? null,
    card_id: card?.id ?? null,
    date: new Date().toISOString().slice(0, 10),
    note,
  });

  if (insertError) {
    return textResponse('Could not log that transaction.', 500);
  }

  const amountText = formatAmount(amount, profile.currency);
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
    const sign = parsed.type === 'income' ? '+' : '-';
    const directionEmoji = parsed.type === 'income' ? '💰' : '💸';
    // `note` is the transfer party ("To X" / "From X") when detected, otherwise the
    // raw SMS -- either way it reads better as the notification's headline than a
    // bare amount, with the amount and category moved into the body line instead.
    const noteText = note.length > 60 ? `${note.slice(0, 57)}…` : note;
    const notifTitle = `${directionEmoji} ${noteText}`;
    const boldAmount = toBoldUnicode(`${sign}${amountText}`);
    const categoryLabel = parsed.category ? parsed.category.name : 'Uncategorized';
    await sendPushNotification(supabaseAdmin, subscriptions, {
      title: notifTitle,
      body: `${boldAmount} · 🏷️ ${categoryLabel}`,
      url: '/',
    });
  }

  return textResponse(`Logged ${amountText} ${parsed.type}${categoryText}${cardText}.`);
});
