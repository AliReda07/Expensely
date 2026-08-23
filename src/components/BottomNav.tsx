import { NavLink } from 'react-router-dom';
import { Home, History, MessageCircle, PieChart, Settings } from 'lucide-react';

const items = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/history', label: 'History', icon: History },
  { to: '/insights', label: 'Insights', icon: PieChart },
  { to: '/ask', label: 'Ask', icon: MessageCircle },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="flex justify-around">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                  isActive ? 'text-brand' : 'text-slate-400'
                }`
              }
            >
              <Icon size={22} strokeWidth={2} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
