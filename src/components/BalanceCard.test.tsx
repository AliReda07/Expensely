import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BalanceCard } from './BalanceCard';

describe('BalanceCard', () => {
  it('shows a positive balance', () => {
    render(<BalanceCard balance={1250.5} currency="EGP" />);
    expect(screen.getByText(/1,250\.50/)).toBeInTheDocument();
  });

  it('shows a negative balance with a minus sign', () => {
    render(<BalanceCard balance={-42.5} currency="EGP" />);
    expect(screen.getByText(/-.*42\.50/)).toBeInTheDocument();
  });

  it('respects the given currency', () => {
    render(<BalanceCard balance={10} currency="USD" />);
    expect(screen.getByText(/\$/)).toBeInTheDocument();
  });
});
