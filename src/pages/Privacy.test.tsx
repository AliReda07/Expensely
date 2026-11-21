import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Privacy } from './Privacy';

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));

function renderPage() {
  render(
    <MemoryRouter>
      <Privacy />
    </MemoryRouter>,
  );
}

afterEach(() => vi.resetModules());

describe('Privacy policy page', () => {
  it('shows without signing in, with the prototype and review caveat', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Privacy policy', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/has not yet been\s+reviewed by a lawyer/i)).toBeInTheDocument();
  });

  it('names every outside service that handles data', () => {
    renderPage();
    for (const vendor of ['Supabase', 'Vercel', 'OpenRouter', 'Resend', 'Google']) {
      expect(screen.getAllByText(new RegExp(vendor)).length).toBeGreaterThan(0);
    }
  });

  it('covers the sections a policy needs', () => {
    renderPage();
    for (const title of [
      'Who is responsible',
      'What we collect',
      'Why we use it',
      'Who else handles your data',
      'Data leaving Egypt',
      'Family sharing',
      'How long we keep it',
      'Your rights',
      'Security',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
  });

  it('says plainly that contact details are not set yet instead of inventing them', () => {
    renderPage();
    expect(screen.getByText(/A contact email will be listed here/i)).toBeInTheDocument();
  });

  it('links back to sign in when signed out', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '/login');
  });
});
