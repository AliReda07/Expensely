import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionRow } from './TransactionRow';
import type { Category, TransactionWithCategory } from '../types';

const foodCategory: Category = {
  id: 'cat-1',
  user_id: null,
  name: 'Food',
  icon: 'utensils',
  color: '#f97316',
  is_preset: true,
};

function makeTransaction(overrides: Partial<TransactionWithCategory> = {}): TransactionWithCategory {
  return {
    id: 'txn-1',
    user_id: 'user-1',
    type: 'expense',
    amount: 42.5,
    category_id: foodCategory.id,
    category: foodCategory,
    date: '2026-08-23',
    note: 'Lunch',
    created_at: '2026-08-23T12:00:00Z',
    ...overrides,
  };
}

describe('TransactionRow', () => {
  it('shows the category name, date, note, and amount', () => {
    render(<TransactionRow transaction={makeTransaction()} currency="EGP" />);
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText(/Aug 23/)).toBeInTheDocument();
    expect(screen.getByText(/Lunch/)).toBeInTheDocument();
    expect(screen.getByText(/42\.50/)).toBeInTheDocument();
  });

  it('falls back to "Uncategorized" when there is no category', () => {
    render(<TransactionRow transaction={makeTransaction({ category: null })} currency="EGP" />);
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
  });

  it('prefixes expenses with a minus sign', () => {
    render(<TransactionRow transaction={makeTransaction({ type: 'expense' })} currency="EGP" />);
    expect(screen.getByText(/^-/)).toBeInTheDocument();
  });

  it('prefixes income with a plus sign', () => {
    render(<TransactionRow transaction={makeTransaction({ type: 'income' })} currency="EGP" />);
    expect(screen.getByText(/^\+/)).toBeInTheDocument();
  });

  it('omits the note separator when there is no note', () => {
    render(<TransactionRow transaction={makeTransaction({ note: null })} currency="EGP" />);
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it('calls onClick when clicked and provided', async () => {
    const onClick = vi.fn();
    render(<TransactionRow transaction={makeTransaction()} currency="EGP" onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when no onClick is provided', () => {
    render(<TransactionRow transaction={makeTransaction()} currency="EGP" />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
