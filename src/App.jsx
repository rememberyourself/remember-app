import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import ClientDashboard from './pages/ClientDashboard';
import CheckIn from './pages/CheckIn';
import CheckInHistory from './pages/CheckInHistory';
import CoachDashboard from './pages/CoachDashboard';
import ClientDetail from './pages/ClientDetail';
import Profile from './pages/Profile';
import Toolbox from './pages/Toolbox';
import { getUnreadResponseCount, getUnreviewedCheckinCount, subscribeToPush } from './utils/api';

function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-dvh bg-forest-900 flex items-center justify-center"><div className="animate-pulse text-earth-500">Loading...</div></div>;
  if (!user) return <Navigate to="/login" />;
  if (role && user.role !== role) return <Navigate to="/" />;
  return children;
}

// Push notification setup for ALL users (clients + coaches)
function PushSetup() {
  const { user } = useAuth();
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!user) return;

    const setupPush = async () => {
      try {
        // Check basic support
        const hasSW = 'serviceWorker' in navigator;
        const hasPush = 'PushManager' in window;
        const hasNotification = 'Notification' in window;
        console.log(`[Push] Support: SW=${hasSW}, Push=${hasPush}, Notification=${hasNotification}`);

        if (!hasSW || !hasPush || !hasNotification) {
          // Show banner anyway — tell user notifications aren't supported
          console.log('[Push] Not fully supported, showing unsupported banner');
          const dismissed = sessionStorage.getItem('push_banner_dismissed');
          if (!dismissed) setShowBanner('unsupported');
          return;
        }

        // Wait for service worker to be fully ready
        console.log('[Push] Waiting for service worker ready...');
        const reg = await navigator.serviceWorker.ready;
        console.log('[Push] Service worker ready, checking subscription...');

        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          console.log('[Push] Existing subscription found, syncing...');
          await subscribeToPush(user.id, existing.toJSON());
          return;
        }

        console.log(`[Push] Permission state: ${Notification.permission}`);

        if (Notification.permission === 'granted') {
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: 'BNHCzvyw21tTRy3VcLueMg4ozN5tW0mUKLRhAmWeaqbvInL1O_RItGId4pzwqPEspeiBHER19wvrcNW83BTNDKU',
          });
          await subscribeToPush(user.id, sub.toJSON());
          console.log(`[Push] Subscribed successfully (${user.role})`);
        } else if (Notification.permission === 'denied') {
          console.log('[Push] Permission denied, showing re-enable banner');
          setShowBanner('denied');
        } else {
          // Permission is 'default' — show opt-in banner
          console.log('[Push] Permission default, showing opt-in banner');
          const dismissed = sessionStorage.getItem('push_banner_dismissed');
          if (!dismissed) setShowBanner('default');
        }
      } catch (e) {
        console.log('[Push] Setup failed:', e.message);
        // Still show banner on error so user knows something's up
        const dismissed = sessionStorage.getItem('push_banner_dismissed');
        if (!dismissed) setShowBanner('default');
      }
    };

    // Small delay to ensure SW registration has started
    const timer = setTimeout(setupPush, 1500);
    return () => clearTimeout(timer);
  }, [user]);

  const handleEnable = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: 'BNHCzvyw21tTRy3VcLueMg4ozN5tW0mUKLRhAmWeaqbvInL1O_RItGId4pzwqPEspeiBHER19wvrcNW83BTNDKU',
        });
        await subscribeToPush(user.id, sub.toJSON());
        console.log(`[Push] Subscribed after user gesture`);
      }
    } catch (e) {
      console.log('[Push] Enable failed:', e.message);
    }
    setShowBanner(false);
  };

  const handleDismiss = () => {
    sessionStorage.setItem('push_banner_dismissed', 'true');
    setShowBanner(false);
  };

  if (!showBanner) return null;

  if (showBanner === 'unsupported') {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-forest-800 border-b border-earth-600/30 px-4 py-3 flex items-center gap-3 animate-slide-down" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <span className="text-lg">📱</span>
        <p className="text-warm-white text-sm flex-1">Push notifications aren't available on this device. Add app to home screen for the best experience.</p>
        <button onClick={handleDismiss} className="text-earth-600 text-xs">OK</button>
      </div>
    );
  }

  if (showBanner === 'denied') {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-forest-800 border-b border-red-500/30 px-4 py-3 flex items-center gap-3 animate-slide-down" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <span className="text-lg">🔕</span>
        <p className="text-warm-white text-sm flex-1">Notifications are blocked. Enable them in your device Settings → this app.</p>
        <button onClick={handleDismiss} className="text-earth-600 text-xs">OK</button>
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-forest-800 border-b border-gold-500/30 px-4 py-3 flex items-center gap-3 animate-slide-down" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
      <span className="text-lg">🔔</span>
      <p className="text-warm-white text-sm flex-1">Enable notifications to stay connected?</p>
      <button onClick={handleEnable} className="px-3 py-1.5 bg-gold-500 text-forest-900 rounded-lg text-xs font-medium">
        Enable
      </button>
      <button onClick={handleDismiss} className="text-earth-600 text-xs">
        Later
      </button>
    </div>
  );
}

// Badge updater for both client and coach PWA
function BadgeUpdater() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const updateBadge = async () => {
      try {
        let count = 0;
        if (user.role === 'client') {
          count = await getUnreadResponseCount(user.id);
        } else if (user.role === 'coach') {
          count = await getUnreviewedCheckinCount();
        }
        console.log(`[Badge] ${user.role} unread count: ${count}`);
        if ('setAppBadge' in navigator) {
          if (count > 0) {
            await navigator.setAppBadge(count);
          } else {
            await navigator.clearAppBadge();
          }
        }
      } catch (e) {
        console.log(`[Badge] Error:`, e.message);
      }
    };

    updateBadge();
    // Poll every 30s instead of 60s for faster badge updates
    const interval = setInterval(updateBadge, 30000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') updateBadge();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Listen for push messages from Service Worker
    const handleSWMessage = (event) => {
      if (event.data?.type === 'PUSH_RECEIVED') {
        console.log('[Badge] Push received, updating badge...');
        updateBadge();
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleSWMessage);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
    };
  }, [user]);

  return null;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={
        loading ? <div className="min-h-dvh bg-forest-900" /> :
        user ? (
          user.role === 'coach' ? <Navigate to="/coach" /> : <Navigate to="/dashboard" />
        ) : <Navigate to="/login" />
      } />
      <Route path="/dashboard" element={
        <ProtectedRoute role="client"><ClientDashboard /></ProtectedRoute>
      } />
      <Route path="/checkin" element={
        <ProtectedRoute role="client"><CheckIn /></ProtectedRoute>
      } />
      <Route path="/history" element={
        <ProtectedRoute role="client"><CheckInHistory /></ProtectedRoute>
      } />
      <Route path="/coach" element={
        <ProtectedRoute role="coach"><CoachDashboard /></ProtectedRoute>
      } />
      <Route path="/coach/client/:id" element={
        <ProtectedRoute role="coach"><ClientDetail /></ProtectedRoute>
      } />
      <Route path="/toolbox" element={
        <ProtectedRoute role="client"><Toolbox /></ProtectedRoute>
      } />
      <Route path="/profile" element={
        <ProtectedRoute><Profile /></ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PushSetup />
      <BadgeUpdater />
      <div className="min-h-dvh bg-forest-900">
        <AppRoutes />
      </div>
    </AuthProvider>
  );
}
