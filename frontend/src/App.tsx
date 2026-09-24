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
      setUser(null);
    } catch {
      // Still set user to null on failure
      setUser(null);
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-full border-2 border-slate-900 border-t-transparent animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
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
