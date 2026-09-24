import React, { useState } from 'react';
import { api } from '../lib/api.ts';
import { User } from '../types/index.ts';

interface LoginProps {
  onLoginSuccess?: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [emailInput, setEmailInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const authUrl = `${import.meta.env.VITE_API_URL || ''}/api/auth/google`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const user = await api.loginWithEmail(emailInput || undefined);
      if (onLoginSuccess) {
        onLoginSuccess(user);
      } else {
        window.location.reload();
      }
    } catch {
      window.location.href = authUrl;
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col justify-center items-center px-4">
      <div className="max-w-[440px] w-full bg-white rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-8 sm:p-10 text-center">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-8">
          Login
        </h1>

        <a
          href={authUrl}
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

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200/80"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-3 text-slate-400 font-normal">
              or sign up through email
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="Email ID"
            className="w-full bg-[#f4f6f5] border-none rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00a843] transition-all"
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full bg-[#f4f6f5] border-none rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00a843] transition-all"
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 bg-[#00a843] hover:bg-[#00923a] text-white font-medium py-3 rounded-xl transition-all shadow-sm text-sm tracking-wide disabled:opacity-50"
          >
            {isSubmitting ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
};
