import { NavLink } from 'react-router-dom';
import { Home, MessageCircle, PieChart, Settings } from 'lucide-react';

const items = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/insights', label: 'Insights', icon: PieChart },
  { to: '/ask', label: 'Ask', icon: MessageCircle },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
      style={{ transform: 'translateZ(0)', WebkitBackfaceVisibility: 'hidden', willChange: 'transform' }}
    >
      <ul className="flex items-center gap-1 rounded-full border border-stone-200/70 bg-white/85 p-1.5 shadow-lg shadow-stone-900/10 backdrop-blur-xl dark:border-white/10 dark:bg-stone-900/70 dark:shadow-black/40">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              aria-label={label}
              className={({ isActive }) =>
                `flex h-12 w-12 items-center justify-center rounded-full transition-all active:scale-90 ${
                  isActive
                    ? 'bg-brand text-white shadow-md shadow-brand/40'
                    : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'
                }`
              }
            >
              <Icon size={20} strokeWidth={2.25} />
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
