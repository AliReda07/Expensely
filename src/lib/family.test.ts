import { afterEach, describe, expect, it } from 'vitest';
import {
  buildInviteLink,
  clearStashedInviteToken,
  familyErrorMessage,
  parseInviteToken,
  peekStashedInviteToken,
  stashInviteToken,
} from './family';

const TOKEN = 'a'.repeat(64);

describe('parseInviteToken', () => {
  it('accepts a 64-character hex fragment, with or without the #', () => {
    expect(parseInviteToken(`#${TOKEN}`)).toBe(TOKEN);
    expect(parseInviteToken(TOKEN)).toBe(TOKEN);
  });

  it('rejects anything else', () => {
    for (const bad of ['', '#', '#abc', `#${TOKEN}x`, `#${'g'.repeat(64)}`, `#${TOKEN.toUpperCase()}`, '#<script>']) {
      expect(parseInviteToken(bad)).toBeNull();
    }
  });
});

describe('buildInviteLink', () => {
  it('puts the token in the fragment so it never reaches a server', () => {
    const link = buildInviteLink('https://app.example', TOKEN);
    expect(link).toBe(`https://app.example/join#${TOKEN}`);
    expect(new URL(link).search).toBe('');
  });
});

describe('invite stash', () => {
  afterEach(() => clearStashedInviteToken());

  it('round-trips a valid token and clears it', () => {
    expect(peekStashedInviteToken()).toBeNull();
    stashInviteToken(TOKEN);
    expect(peekStashedInviteToken()).toBe(TOKEN);
    clearStashedInviteToken();
    expect(peekStashedInviteToken()).toBeNull();
  });

  it('ignores a stored value that is not a token', () => {
    sessionStorage.setItem('expensely.pendingInvite', 'not-a-token');
    expect(peekStashedInviteToken()).toBeNull();
  });
});

describe('familyErrorMessage', () => {
  it('maps known codes to readable text', () => {
    expect(familyErrorMessage('household_full')).toContain('6 members');
    expect(familyErrorMessage('invalid_invite')).toContain('expired');
  });

  it('never leaks raw database text', () => {
    expect(familyErrorMessage('duplicate key value violates unique constraint "household_members_user_id_key"')).toBe(
      'Something went wrong. Please try again.',
    );
    expect(familyErrorMessage(null)).toBe('Something went wrong. Please try again.');
  });
});
