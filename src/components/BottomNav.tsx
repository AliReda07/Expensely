import { NavLink, useLocation } from 'react-router-dom';
import { Home, MessageCircle, PieChart, Settings } from 'lucide-react';

const items = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/insights', label: 'Insights', icon: PieChart },
  { to: '/ask', label: 'Ask', icon: MessageCircle },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function BottomNav() {
  const location = useLocation();
  const activeIndex = items.findIndex(({ to }) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to),
  );

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)] dark:border-stone-800 dark:bg-stone-900/95">
      <ul className="relative flex justify-around">
        {activeIndex >= 0 && (
          <span
            className="absolute top-0 h-[2.5px] rounded-b-full bg-brand transition-transform duration-300 ease-out"
            style={{ width: `${100 / items.length}%`, transform: `translateX(${activeIndex * 100}%)` }}
            aria-hidden="true"
          />
        )}
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
