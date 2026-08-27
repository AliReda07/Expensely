import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('does not show an edit button when onSave is not provided', () => {
    render(<BalanceCard balance={10} currency="EGP" />);
    expect(screen.queryByLabelText('Edit balance')).not.toBeInTheDocument();
  });

  describe('editing', () => {
    it('shows an edit button when onSave is provided', () => {
      render(<BalanceCard balance={10} currency="EGP" onSave={vi.fn()} />);
      expect(screen.getByLabelText('Edit balance')).toBeInTheDocument();
    });

    it('opens an editable input pre-filled with the current balance', async () => {
      render(<BalanceCard balance={250} currency="EGP" onSave={vi.fn()} />);
      await userEvent.click(screen.getByLabelText('Edit balance'));
      expect(screen.getByRole('textbox')).toHaveValue('250');
    });

    it('calls onSave with the entered number and exits edit mode on success', async () => {
      const onSave = vi.fn().mockResolvedValue({ error: null });
      // 250 -> 260 is under the large-change threshold, so this shouldn't prompt.
      render(<BalanceCard balance={250} currency="EGP" onSave={onSave} />);
      await userEvent.click(screen.getByLabelText('Edit balance'));
      const input = screen.getByRole('textbox');
      await userEvent.clear(input);
      await userEvent.type(input, '260');
      await userEvent.click(screen.getByLabelText('Save balance'));
      expect(onSave).toHaveBeenCalledWith(260);
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('asks for confirmation before saving a large change, and respects the answer', async () => {
      // Deliberately an in-app prompt rather than window.confirm() -- the native dialog
      // is unreliable inside an iOS home-screen-installed PWA and can silently no-op,
      // which looked exactly like the save button doing nothing.
      const onSave = vi.fn().mockResolvedValue({ error: null });
      render(<BalanceCard balance={250} currency="EGP" onSave={onSave} />);
      await userEvent.click(screen.getByLabelText('Edit balance'));
      const input = screen.getByRole('textbox');
      await userEvent.clear(input);
      await userEvent.type(input, '500');
      await userEvent.click(screen.getByLabelText('Save balance'));

      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByText(/Set balance to/)).toBeInTheDocument();

      await userEvent.click(screen.getByText('Cancel'));
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByRole('textbox')).toHaveValue('500');

      await userEvent.click(screen.getByLabelText('Save balance'));
      await userEvent.click(screen.getByText('Yes, set it'));
      expect(onSave).toHaveBeenCalledWith(500);
    });

    it('shows an error and stays in edit mode when onSave fails', async () => {
      const onSave = vi.fn().mockResolvedValue({ error: 'Not signed in' });
      render(<BalanceCard balance={250} currency="EGP" onSave={onSave} />);
      await userEvent.click(screen.getByLabelText('Edit balance'));
      await userEvent.click(screen.getByLabelText('Save balance'));
      expect(await screen.findByText('Not signed in')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('rejects a non-numeric entry without calling onSave', async () => {
      const onSave = vi.fn();
      render(<BalanceCard balance={250} currency="EGP" onSave={onSave} />);
      await userEvent.click(screen.getByLabelText('Edit balance'));
      const input = screen.getByRole('textbox');
      await userEvent.clear(input);
      await userEvent.click(screen.getByLabelText('Save balance'));
      expect(screen.getByText('Enter a valid number')).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('cancels editing without calling onSave', async () => {
      const onSave = vi.fn();
      render(<BalanceCard balance={250} currency="EGP" onSave={onSave} />);
      await userEvent.click(screen.getByLabelText('Edit balance'));
      await userEvent.click(screen.getByLabelText('Cancel editing balance'));
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByText(/250\.00/)).toBeInTheDocument();
    });
  });
});
