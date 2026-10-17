import React, { useState, useEffect } from 'react';
import { User } from './types/index.ts';
import { api } from './lib/api.ts';
import { Login } from './screens/Login.tsx';
import { Dashboard } from './screens/Dashboard.tsx';
import { ToastProvider } from './components/Toast.tsx';

export const AppContent: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        // Extract token from URL query if returned from OAuth redirect
        const params = new URLSearchParams(window.location.search);
        const urlToken = params.get('token');
        if (urlToken) {
          api.setToken(urlToken);
          params.delete('token');
          const cleanQuery = params.toString() ? `?${params.toString()}` : '';
          window.history.replaceState({}, document.title, `${window.location.pathname}${cleanQuery}`);
        }

        const userData = await api.getMe();
        setUser(userData);
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    checkAuth();
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await api.logout();
    } catch {
      // Ignored
    } finally {
      api.clearToken();
      setUser(null);
      setIsLoggingOut(false);
    }
  };

  const [isSlowLoad, setIsSlowLoad] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let interval: ReturnType<typeof setInterval>;
    if (isLoading) {
      timer = setTimeout(() => setIsSlowLoad(true), 3000);
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 max-w-sm text-center">
          <div className="w-9 h-9 rounded-full border-2 border-slate-900 border-t-transparent animate-spin" />
          <div className="space-y-1">
            <p className="text-sm text-slate-800 font-semibold">
              {isSlowLoad ? 'Waking up backend server...' : 'Authenticating...'}
            </p>
            {isSlowLoad && (
              <p className="text-xs text-slate-500 leading-relaxed">
                Free-tier cloud hosting (Render) sleeps after 15 minutes of inactivity. Initial wake-up takes ~30–45s ({elapsedSeconds}s elapsed).
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={(u) => setUser(u)} />;
  }

  return (
    <Dashboard
      user={user}
      onLogout={handleLogout}
      isLoggingOut={isLoggingOut}
    />
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
};

export default App;
