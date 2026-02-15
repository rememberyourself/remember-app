import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Avatar from './Avatar';

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return null;

  const isCoach = user.role === 'coach';

  const clientLinks = [
    { path: '/dashboard', label: 'Home', iconSrc: '/icons/home.png' },
    { path: '/checkin', label: 'Check-in', iconSrc: '/icons/checkin2.png' },
    { path: '/history', label: 'History', iconSrc: '/icons/history.png', extraClass: 'scale-125' },
    { path: '/toolbox', label: 'Toolbox', iconSrc: '/icons/toolbox.png', extraClass: 'opacity-75' },
  ];

  const coachLinks = [
    { path: '/coach', label: 'Clients', iconSrc: '/icons/clients.png' },
  ];

  const links = isCoach ? coachLinks : clientLinks;

  return (
    <>
      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-forest-900/80 backdrop-blur-xl border-b border-forest-700/50" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/app-icon.png" alt="Remember" className="w-14 h-14 rounded-full" />
            <span className="tracking-[0.15em] text-warm-white gold-shimmer heading-brand" style={{ fontSize: '18px' }}>
              Remember
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/profile')}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <Avatar name={user.name} avatar={user.avatar} size="sm" />
              <span className="text-earth-500 text-xs">{user.name}</span>
            </button>
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="text-earth-600 hover:text-warm-white text-xs transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-forest-900/90 backdrop-blur-xl border-t border-forest-700/50 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-lg mx-auto flex items-center justify-around py-2">
          {links.map(link => (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              className={`flex flex-col items-center gap-1 px-4 py-1 rounded-lg transition-all ${
                location.pathname === link.path
                  ? 'text-gold-500'
                  : 'text-earth-600 hover:text-earth-400'
              }`}
            >
              <img src={link.iconSrc} alt={link.label} className={`w-10 h-10 ${link.extraClass || ''}`} />
              <span className="text-[11px] uppercase tracking-wider">{link.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
