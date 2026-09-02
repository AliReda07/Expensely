import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SmsAutoLogSheet } from './SmsAutoLogSheet';
import type { Profile } from '../types';

const profile: Profile = {
  id: 'user-1',
  starting_balance: 0,
  overall_budget: null,
  currency: 'EGP',
  sms_token: 'a'.repeat(48),
};

function setUserAgent(ua: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
}

function renderSheet() {
  render(<SmsAutoLogSheet profile={profile} onClose={() => {}} onSaveToken={async () => ({ error: null })} />);
}

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SmsAutoLogSheet', () => {
  it('opens on the iOS instructions for a non-Android device', () => {
    setUserAgent(IPHONE_UA);
    renderSheet();

    expect(screen.getByRole('button', { name: 'iPhone' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Set up in iOS Shortcuts/)).toBeInTheDocument();
    expect(screen.queryByText(/Set up in MacroDroid/)).not.toBeInTheDocument();
  });

  it('opens on the Android instructions when the user is on Android', () => {
    setUserAgent(ANDROID_UA);
    renderSheet();

    expect(screen.getByRole('button', { name: 'Android' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Set up in MacroDroid/)).toBeInTheDocument();
    expect(screen.queryByText(/Set up in iOS Shortcuts/)).not.toBeInTheDocument();
  });

  it('switches instructions when the platform is changed by hand', async () => {
    setUserAgent(IPHONE_UA);
    renderSheet();

    await userEvent.click(screen.getByRole('button', { name: 'Android' }));

    expect(screen.getByText(/Set up in MacroDroid/)).toBeInTheDocument();
    expect(screen.queryByText(/Set up in iOS Shortcuts/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'iPhone' }));

    expect(screen.getByText(/Set up in iOS Shortcuts/)).toBeInTheDocument();
  });

  // The message body is pasted verbatim into MacroDroid, so a wrong variable name here is a
  // silent failure the user has no way to debug -- worth pinning even though it's copy.
  it('gives MacroDroid the exact magic text for the message body', () => {
    setUserAgent(ANDROID_UA);
    renderSheet();

    expect(screen.getByText('{sms_message}')).toBeInTheDocument();
  });

  // The whole point of moving the token into a header: the URL carries no secret, so it
  // can be shown, screenshotted and pasted freely.
  it('shows a URL that contains no token', () => {
    setUserAgent(ANDROID_UA);
    renderSheet();

    const url = screen.getByLabelText('Webhook URL') as HTMLInputElement;
    expect(url.value).toMatch(/\/functions\/v1\/sms-webhook$/);
    expect(url.value).not.toContain(profile.sms_token!);
  });

  // The token is the endpoint's only credential, so it must not sit on screen by default
  // where a screenshot of the setup steps would carry it away.
  it('masks the token until it is deliberately revealed', async () => {
    setUserAgent(ANDROID_UA);
    renderSheet();

    const masked = screen.getByLabelText('Your private token') as HTMLInputElement;
    expect(masked.value).not.toContain(profile.sms_token!);
    expect(masked.value).toMatch(/^•+$/);

    await userEvent.click(screen.getByRole('button', { name: 'Show token' }));
    expect((screen.getByLabelText('Your private token') as HTMLInputElement).value).toBe(profile.sms_token);

    await userEvent.click(screen.getByRole('button', { name: 'Hide token' }));
    expect((screen.getByLabelText('Your private token') as HTMLInputElement).value).toMatch(/^•+$/);
  });

  it('copies the real token even while it is masked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    setUserAgent(ANDROID_UA);
    renderSheet();

    await userEvent.click(screen.getByRole('button', { name: 'Copy token' }));
    expect(writeText).toHaveBeenCalledWith(profile.sms_token);

    await userEvent.click(screen.getByRole('button', { name: 'Copy URL' }));
    expect(writeText).toHaveBeenLastCalledWith(expect.not.stringContaining(profile.sms_token!));
  });

  it('keeps the token masked across a platform switch', async () => {
    setUserAgent(ANDROID_UA);
    renderSheet();

    await userEvent.click(screen.getByRole('button', { name: 'iPhone' }));

    expect((screen.getByLabelText('Your private token') as HTMLInputElement).value).toMatch(/^•+$/);
  });

  // A setup that follows the old instructions keeps working, but the instructions
  // themselves must teach the header on both platforms or nobody ever migrates.
  it('tells both platforms to send the token as a header', async () => {
    setUserAgent(ANDROID_UA);
    renderSheet();

    expect(screen.getAllByText('x-sms-token').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'iPhone' }));
    expect(screen.getAllByText('x-sms-token').length).toBeGreaterThan(0);
  });
});
