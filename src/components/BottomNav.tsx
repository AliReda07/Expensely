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
      className="fixed bottom-0 inset-x-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)] dark:border-stone-800 dark:bg-stone-900/95"
      style={{ transform: 'translateZ(0)', WebkitBackfaceVisibility: 'hidden', willChange: 'transform' }}
    >
      <ul className="flex justify-around">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-all active:scale-90 ${
                  isActive ? 'text-brand' : 'text-stone-600 dark:text-stone-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} strokeWidth={2} className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'scale-100'}`} />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
