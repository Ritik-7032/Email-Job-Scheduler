import React, { useState } from 'react';
import { User } from '../types/index.ts';
import { Clock, Send, ChevronDown, LogOut } from 'lucide-react';

interface SidebarProps {
  user: User;
  activeTab: 'scheduled' | 'sent';
  onTabChange: (tab: 'scheduled' | 'sent') => void;
  onComposeClick: () => void;
  scheduledCount: number;
  sentCount: number;
  onLogout: () => void;
  isLoggingOut?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  activeTab,
  onTabChange,
  onComposeClick,
  scheduledCount,
  sentCount,
  onLogout,
  isLoggingOut,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <aside className="w-64 shrink-0 bg-white min-h-screen border-r border-slate-200/80 p-4 flex flex-col justify-between select-none">
      <div className="flex flex-col gap-5">
        {/* Brand Logo matching ONB in Figma */}
        <div className="flex items-center gap-2 px-1 pt-1">
          <div className="font-extrabold text-2xl tracking-tighter text-slate-900 font-mono">
            ONB
          </div>
        </div>

        {/* User Profile Card */}
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full bg-[#f4f6f5] hover:bg-[#ebf0ed] p-2.5 rounded-2xl flex items-center justify-between transition-colors text-left"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {getInitials(user.name)}
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-slate-900 truncate leading-tight">
                  {user.name}
                </span>
                <span className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">
                  {user.email}
                </span>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
          </button>

          {isDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-30">
              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  onLogout();
                }}
                disabled={isLoggingOut}
                className="w-full px-3 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{isLoggingOut ? 'Logging out...' : 'Logout'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Compose Button matching Figma outline pill */}
        <button
          onClick={onComposeClick}
          className="w-full border border-[#00a843] text-[#00a843] hover:bg-[#e8f5e9]/60 active:bg-[#e8f5e9] rounded-full py-2 px-4 text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-sm"
        >
          Compose
        </button>

        {/* Navigation Core */}
        <div className="flex flex-col gap-1 mt-1">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-1">
            CORE
          </div>

          <button
            onClick={() => onTabChange('scheduled')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
              activeTab === 'scheduled'
                ? 'bg-[#e8f5e9] text-[#0f5132] font-semibold'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Clock className={`w-4 h-4 ${activeTab === 'scheduled' ? 'text-[#00a843]' : 'text-slate-500'}`} />
              <span>Scheduled</span>
            </div>
            <span className="text-xs text-slate-500 font-normal">
              {scheduledCount}
            </span>
          </button>

          <button
            onClick={() => onTabChange('sent')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
              activeTab === 'sent'
                ? 'bg-[#e8f5e9] text-[#0f5132] font-semibold'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Send className={`w-4 h-4 ${activeTab === 'sent' ? 'text-[#00a843]' : 'text-slate-500'}`} />
              <span>Sent</span>
            </div>
            <span className="text-xs text-slate-500 font-normal">
              {sentCount}
            </span>
          </button>
        </div>
      </div>

      <div className="text-[10px] text-slate-400 text-center pb-2">
        ReachInbox Scheduler
      </div>
    </aside>
  );
};
