import React from 'react';
import { User } from '../types/index.ts';
import { Button } from './Button.tsx';
import { LogOut } from 'lucide-react';

interface HeaderProps {
  user: User;
  onLogout: () => void;
  isLoggingOut: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  onLogout,
  isLoggingOut,
}) => {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-slate-900 rounded flex items-center justify-center text-white font-bold text-xs tracking-wider">
            RI
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 tracking-tight leading-none">
              ReachInbox Scheduler
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-7 h-7 rounded-full border border-slate-200 object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-semibold">
                {getInitials(user.name)}
              </div>
            )}
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-medium text-slate-900 leading-tight">
                {user.name}
              </span>
              <span className="text-[11px] text-slate-500 leading-tight">
                {user.email}
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-200 mx-1" />

          <Button
            variant="outline"
            size="sm"
            onClick={onLogout}
            isLoading={isLoggingOut}
            className="text-slate-600 hover:text-slate-900"
            title="Logout"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </div>
    </header>
  );
};
