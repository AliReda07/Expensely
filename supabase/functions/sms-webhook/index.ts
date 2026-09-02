import { createClient } from 'jsr:@supabase/supabase-js@2.112.3';
import {
  detectDirection,
  extractTransferParty,
  instantTransferFee,
  looksLikeInstantTransfer,
  looksLikeTransfer,
  matchCardByPhrase,
  matchesTrustedSender,
  normalize,
  parseSmsPayload,
  parseTransaction,
} from '../_shared/categorize.ts';
import { sendPushNotification } from '../_shared/push.ts';

// Left open deliberately, unlike ask-proxy: the caller here is a phone-side automation,
// not a browser, so there is no origin to pin and no ambient credential for a hostile
// origin to ride -- the token in the URL path is the whole auth story.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-sms-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// The token used to live in the URL path, which meant it was written verbatim into every
// request log -- confirmed in this project's own function_edge_logs, where live tokens sat
// in plaintext next to each request. A header keeps the credential out of the URL, which
// is the part of a request that gets logged, proxied and shoulder-surfed.
//
// Path tokens are still accepted while existing phone automations are migrated: rejecting
// them outright would silently stop logging for anyone who hasn't re-done their Shortcut
// or macro yet, and a stopped expense tracker is not obviously broken until you notice
// months of missing transactions. Flip this to false once every automation sends the
// header -- that is the point at which the leak is actually closed, not before.
const ACCEPT_LEGACY_URL_TOKEN = true;

const TOKEN_HEADER = 'x-sms-token';

const MAX_BODY_LENGTH = 2000;
// The discriminating parts of a bank SMS (amount, running balance) are well inside the
// first 500 characters, so truncating here doesn't weaken deduplication.
const MAX_DEDUPE_KEY_LENGTH = 500;

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

  // Header first, so an automation that sends both (mid-migration, or a copy-pasted setup
  // that kept the old URL) is treated as migrated rather than falling back to the path.
  const headerToken = req.headers.get(TOKEN_HEADER)?.trim() || null;
  const lastSegment = new URL(req.url).pathname.split('/').filter(Boolean).pop();
  const pathToken = lastSegment && lastSegment !== 'sms-webhook' ? lastSegment : null;

  const token = headerToken ?? (ACCEPT_LEGACY_URL_TOKEN ? pathToken : null);
  if (!token) {
    return textResponse(`Missing token. Send it in the ${TOKEN_HEADER} header.`, 400);
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

  // A bank SMS is a few hundred characters at most, so anything past this is either a
  // misconfigured automation or someone with a valid token pushing junk into storage --
  // `note` was already capped at 300, but the body itself and the dedupe key below were
  // not, so an unbounded body could be persisted in full.
  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_LENGTH) {
    return textResponse('Message too large.', 413);
  }

  const { message, sender } = parseSmsPayload(rawBody);
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

  // Second trust signal, same job as the one above but via the sender label instead of
  // message wording: bank_sender is only ever set by the user themselves (see
  // AddCardForm), specifically to declare "messages labeled this way are from a real
  // bank" -- previously that declaration was only ever used to pick a card, never
  // consulted for whether to log the message at all, so a genuinely bank-sourced message
  // in unrecognized wording was rejected exactly like an unverified one would be.
  const hasTrustedSender = matchesTrustedSender(sender, userCards);

  // Strict mode: reject a message unless it has both a currency-adjacent amount and
  // (an actual transaction verb/direction, a phrase this user has saved, or a sender this
  // user has already vouched for) -- not just any number next to a currency code. A promo
  // SMS quoting a discount cap ("capped at EGP 5,000") has none of those and would
  // otherwise be booked as a real expense.
  //
  // Both waivers are deliberately scoped to declarations *this* user made about their own
  // cards. An earlier version also honored phrases that two or more different users had
  // independently saved, on the theory that agreement between strangers was evidence -- but
  // signup is open, so two accounts (one extra email address) were enough to promote any
  // phrase and have it waive this gate for every user in the system, which turned promo and
  // OTP messages carrying an amount into real transactions in other people's ledgers.
  const parsed = parseTransaction(message, categoryRows ?? [], {
    strict: true,
    bypassVerbGate: phraseCardId !== null || hasTrustedSender,
  });
  if (!parsed) {
    return textResponse("Doesn't look like a real transaction — nothing logged.");
  }

  // Backstop against logging the same SMS twice for this account -- e.g. a phone-side
  // automation retrying a failed POST, or a stray duplicate Shortcuts automation firing on
  // the same incoming message (confirmed happening in practice: the same bank SMS reached
  // two different accounts 9ms apart from two different webhook tokens -- this can't catch
  // that cross-account case, but it does catch the same thing happening to one account).
  // Keyed on the normalized message text, not the stored `note` -- `note` is rewritten to
  // "To X"/"From X" for a transfer and loses the raw text, so two genuinely different
  // transfers to the same person for the same amount would otherwise collide. A five-minute
  // window is generous for a retry/duplicate delivery without risking suppressing a later,
  // separately-caused transaction that happens to read identically -- which Egyptian bank
  // SMS make vanishingly unlikely anyway, since every message bakes in a running balance
  // figure that changes with every real transaction.
  const dedupeKey = normalize(message).slice(0, MAX_DEDUPE_KEY_LENGTH);
  const dedupeWindowStart = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recentDuplicate } = await supabaseAdmin
    .from('transactions')
    .select('id')
    .eq('user_id', profile.id)
    .eq('sms_dedupe_key', dedupeKey)
    .gte('created_at', dedupeWindowStart)
    .limit(1)
    .maybeSingle();
  if (recentDuplicate) {
    return textResponse('Already logged this transaction moments ago — skipped duplicate.');
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
    sms_dedupe_key: dedupeKey,
  });

  if (insertError) {
    return textResponse('Could not log that transaction.', 500);
  }

  const amountText = formatAmount(amount, profile.currency);

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
    // Which card the message resolved to is the fiddliest part of setup to get right
    // (see the phrase and bank_sender paths above), so the user does need to see it --
    // but it belongs here, in a notification delivered to their own subscribed devices,
    // rather than in the HTTP response, which is readable by anyone holding the token.
    const cardLabel = card ? ` · 💳 ${card.name}` : '';
    await sendPushNotification(supabaseAdmin, subscriptions, {
      title: notifTitle,
      body: `${boldAmount} · 🏷️ ${categoryLabel}${cardLabel}`,
      url: '/',
    });
  }

  // Deliberately says nothing about which card matched, nor whether a card with the
  // referenced last 4 digits exists at all. The token in the URL is the whole auth story,
  // so this body is readable by anyone who has that token -- and anything account-specific
  // in it turns a write-only endpoint into a way to enumerate the user's card names and
  // probe which cards they hold. Amount and type are echoed because they were derived from
  // the message the caller themselves supplied, so they disclose nothing new.
  return textResponse(`Logged ${amountText} ${parsed.type}.`);
});
