import { getIcon } from '../lib/icons';
import type { Category } from '../types';

export function CategoryIcon({ category, size = 20 }: { category: Category | null; size?: number }) {
  const Icon = getIcon(category?.icon ?? 'more-horizontal');
  const color = category?.color ?? '#64748b';
  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{ backgroundColor: `${color}1a`, color, width: size * 1.9, height: size * 1.9 }}
    >
      <Icon size={size} strokeWidth={2} />
    </span>
  );
}
