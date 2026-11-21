export type HouseholdRole = 'owner' | 'adult' | 'child';
export type ShareMode = 'all' | 'cards' | 'totals';

export const MAX_HOUSEHOLD_MEMBERS = 6;

export const SHARE_MODE_OPTIONS: { value: ShareMode; label: string; description: string }[] = [
  { value: 'all', label: 'Everything', description: 'All your transactions, except any you mark as private.' },
  { value: 'cards', label: 'Only some cards', description: 'Only transactions made with the cards you choose.' },
  { value: 'totals', label: 'Totals only', description: 'Spending totals per category, never individual transactions.' },
];

// An invite token is 32 random bytes in hex (see create_invite). Anything else in the URL is
// not an invite, and is never sent to the server.
const TOKEN_RE = /^[0-9a-f]{64}$/;

/** The token from a `#<token>` URL fragment, or null if it isn't shaped like one. */
export function parseInviteToken(hash: string): string | null {
  const candidate = hash.replace(/^#/, '');
  return TOKEN_RE.test(candidate) ? candidate : null;
}

/**
 * The link the owner sends. The token sits in the fragment so it is never sent to a server,
 * written to an access log or leaked through a Referer header.
 */
export function buildInviteLink(origin: string, token: string): string {
  return `${origin}/join#${token}`;
}

// Survives the sign-in / sign-up redirect (including Google's round trip), which would
// otherwise drop the fragment. sessionStorage, not localStorage: it dies with the tab.
const STASH_KEY = 'expensely.pendingInvite';

export function stashInviteToken(token: string): void {
  try {
    sessionStorage.setItem(STASH_KEY, token);
  } catch {
    // Storage can be unavailable (private mode); joining then works only without a redirect.
  }
}

export function peekStashedInviteToken(): string | null {
  try {
    const value = sessionStorage.getItem(STASH_KEY);
    return value && TOKEN_RE.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearStashedInviteToken(): void {
  try {
    sessionStorage.removeItem(STASH_KEY);
  } catch {
    // nothing to clear
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  premium_required: 'Family is a Premium feature.',
  already_in_household: "You're already in a family. Leave it first to join another.",
  not_owner: 'Only the family owner can do that.',
  not_a_member: "That person isn't in your family.",
  invalid_invite:
    "This invite isn't valid for your account. It may have expired, been used already, or been sent to a different email address.",
  consent_required: 'You need to agree before joining.',
  household_full: 'This family already has 6 members.',
  household_inactive: "The family owner's Premium has lapsed, so you can't join right now.",
  invalid_cards: 'Choose at least one of your own cards.',
  invalid_share_mode: 'Pick what you want to share.',
  invalid_email: 'Enter a valid email address.',
  invalid_role: 'Pick adult or child.',
  invalid_name: 'Give the family a name (up to 60 characters).',
  children_cannot_change: "A child's sharing is set by the family and can't be changed.",
  owner_cannot_leave: 'The owner can delete the family instead of leaving it.',
  invalid_category: "That category can't be used for this member.",
  invalid_amount: 'Enter an amount greater than 0.',
  not_applicable: "You're the owner, so there's nothing to change here.",
};

/** A person-readable message for a database error. Never shows raw database text. */
export function familyErrorMessage(message: string | null | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  const code = Object.keys(ERROR_MESSAGES).find((c) => message === c || message.includes(c));
  return code ? ERROR_MESSAGES[code] : 'Something went wrong. Please try again.';
}
