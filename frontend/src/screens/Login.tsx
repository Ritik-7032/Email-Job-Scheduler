import React from 'react';
import { User } from '../types/index.ts';

export interface LoginProps {
  onLoginSuccess?: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess: _onLoginSuccess }) => {
  const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
  const googleAuthUrl = `${apiBase}/api/auth/google`;

  return (
    <div className="min-h-screen bg-white flex flex-col justify-center items-center px-4">
      <div className="max-w-[440px] w-full bg-white rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-8 sm:p-10 text-center">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-8">
          Login
        </h1>

        <a
          href={googleAuthUrl}
          className="w-full flex items-center justify-center gap-3 bg-[#e8f5e9] hover:bg-[#def0e0] text-slate-800 font-medium text-sm py-3 px-4 rounded-xl transition-all shadow-sm"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span className="font-medium text-slate-800 text-sm">Login with Google</span>
        </a>
      </div>
    </div>
  );
};
