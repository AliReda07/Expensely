import { formatCurrency } from '../lib/format';

export function BalanceCard({ balance, currency }: { balance: number; currency: string }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-5 text-white shadow-lg shadow-brand/20">
      <p className="text-sm font-medium text-white/80">Current balance</p>
      <p className="mt-1 text-3xl font-bold tracking-tight">{formatCurrency(balance, currency)}</p>
    </div>
  );
}
