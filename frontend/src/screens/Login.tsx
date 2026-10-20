import React, { useState } from 'react';
import { User } from '../types/index.ts';
import { api } from '../lib/api.ts';

export interface LoginProps {
  onLoginSuccess?: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const rawApiBase = import.meta.env.VITE_API_URL || '';
  const apiBase = (rawApiBase || 'https://email-job-scheduler-mtxd.onrender.com').replace(/\/+$/, '');
  const googleAuthUrl = `${apiBase}/api/auth/google`;

  const handleDemoLogin = async () => {
    setIsDemoLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.demoLogin();
      if (res?.user && onLoginSuccess) {
        onLoginSuccess(res.user);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Demo access failed';
      setErrorMsg(msg);
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4">
      <div className="max-w-[460px] w-full bg-white rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-8 sm:p-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-200/60 rounded-full text-emerald-700 text-xs font-semibold mb-6">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Live Evaluation & Portfolio Mode
        </div>

        <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">
          Email Job Scheduler
        </h1>
        <p className="text-sm text-slate-500 mb-8">
          Distributed BullMQ scheduler with Redis Lua rate-limiting
        </p>

        {errorMsg && (
          <div className="mb-6 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl text-left">
            {errorMsg}
          </div>
        )}

        {/* 1-Click Recruiter / Demo Access */}
        <button
          type="button"
          onClick={handleDemoLogin}
          disabled={isDemoLoading}
          className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-medium text-sm py-3.5 px-4 rounded-xl transition-all shadow-md shadow-emerald-600/20 active:scale-[0.99] disabled:opacity-75"
        >
          {isDemoLoading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
          <span>{isDemoLoading ? 'Preparing Demo Workspace...' : '1-Click Recruiter / Demo Access'}</span>
        </button>

        <p className="text-[11px] text-slate-400 mt-2 mb-6">
          Instant guest sandbox access — no Google authorization needed.
        </p>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-3 text-slate-400 font-normal">
              or continue with Google OAuth
            </span>
          </div>
        </div>

        <a
          href={googleAuthUrl}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-medium text-sm py-3 px-4 rounded-xl transition-all shadow-sm"
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
          <span className="font-medium text-slate-700 text-sm">Login with Google</span>
        </a>
      </div>
    </div>
  );
};
