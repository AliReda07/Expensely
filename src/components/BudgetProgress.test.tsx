import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BudgetProgress } from './BudgetProgress';

describe('BudgetProgress', () => {
  it('shows spent and budget amounts', () => {
    render(<BudgetProgress label="Food" spent={50} budget={100} currency="EGP" />);
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText(/50\.00.*100\.00/)).toBeInTheDocument();
  });

  it('caps the bar width at 100% even when over budget', () => {
    const { container } = render(<BudgetProgress label="Food" spent={150} budget={100} currency="EGP" />);
    const bar = container.querySelector('.rounded-full.transition-all') as HTMLElement;
    expect(bar.style.width).toBe('100%');
  });

  it('renders 0% width when budget is 0', () => {
    const { container } = render(<BudgetProgress label="Food" spent={0} budget={0} currency="EGP" />);
    const bar = container.querySelector('.rounded-full.transition-all') as HTMLElement;
    expect(bar.style.width).toBe('0%');
  });

  it('flags over-budget spending with the red styling', () => {
    render(<BudgetProgress label="Food" spent={150} budget={100} currency="EGP" />);
    const amount = screen.getByText(/150\.00/);
    expect(amount.className).toContain('text-red-600');
  });

  it('does not flag under-budget spending as over', () => {
    render(<BudgetProgress label="Food" spent={50} budget={100} currency="EGP" />);
    const amount = screen.getByText(/50\.00/);
    expect(amount.className).not.toContain('text-red-600');
  });
});
