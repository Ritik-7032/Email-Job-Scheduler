import React, { useState, useEffect, useCallback } from 'react';
import { User, EmailItem } from '../types/index.ts';
import { Sidebar } from '../components/Sidebar.tsx';
import { ComposeView } from '../components/ComposeView.tsx';
import { EmailDetailView } from '../components/EmailDetailView.tsx';
import { api } from '../lib/api.ts';
import { formatScheduledTimePill } from '../lib/dateUtils.ts';
import { Search, SlidersHorizontal, RefreshCw, Star, Clock, ChevronLeft, ChevronRight, AlertCircle, Inbox } from 'lucide-react';
import { useToast } from '../components/Toast.tsx';

interface DashboardProps {
  user: User;
  onLogout: () => void;
  isLoggingOut: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({
  user,
  onLogout,
  isLoggingOut,
}) => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());

  const [scheduledEmails, setScheduledEmails] = useState<EmailItem[]>([]);
  const [scheduledTotal, setScheduledTotal] = useState(0);
  const [scheduledOffset, setScheduledOffset] = useState(0);
  const [scheduledError, setScheduledError] = useState<string | null>(null);

  const [sentEmails, setSentEmails] = useState<EmailItem[]>([]);
  const [sentTotal, setSentTotal] = useState(0);
  const [sentOffset, setSentOffset] = useState(0);
  const [sentError, setSentError] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const limit = 50;

  const fetchScheduled = useCallback(
    async (offset: number) => {
      setIsLoading(true);
      setScheduledError(null);
      try {
        const res = await api.getScheduledEmails(limit, offset);
        setScheduledEmails(res.items);
        setScheduledTotal(res.total);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load scheduled emails';
        setScheduledError(message);
        addToast(message, 'error');
      } finally {
        setIsLoading(false);
      }
    },
    [addToast]
  );

  const fetchSent = useCallback(
    async (offset: number) => {
      setIsLoading(true);
      setSentError(null);
      try {
        const res = await api.getSentEmails(limit, offset);
        setSentEmails(res.items);
        setSentTotal(res.total);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load sent emails';
        setSentError(message);
        addToast(message, 'error');
      } finally {
        setIsLoading(false);
      }
    },
    [addToast]
  );

  useEffect(() => {
    fetchScheduled(scheduledOffset);
    fetchSent(sentOffset);
  }, [activeTab, scheduledOffset, sentOffset, fetchScheduled, fetchSent]);

  const handleRefresh = () => {
    fetchScheduled(scheduledOffset);
    fetchSent(sentOffset);
  };

  const handleScheduleSuccess = () => {
    setActiveTab('scheduled');
    setScheduledOffset(0);
    fetchScheduled(0);
    fetchSent(0);
  };

  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // If Compose is open, render ComposeView (Image 5)
  if (isComposeOpen) {
    return (
      <ComposeView
        user={user}
        onBack={() => setIsComposeOpen(false)}
        onSuccess={handleScheduleSuccess}
      />
    );
  }

  // If Email is selected, render EmailDetailView (Image 4)
  if (selectedEmail) {
    return (
      <EmailDetailView
        email={selectedEmail}
        user={user}
        onBack={() => setSelectedEmail(null)}
      />
    );
  }

  const currentItems = activeTab === 'scheduled' ? scheduledEmails : sentEmails;
  const currentTotal = activeTab === 'scheduled' ? scheduledTotal : sentTotal;
  const currentOffset = activeTab === 'scheduled' ? scheduledOffset : sentOffset;
  const currentError = activeTab === 'scheduled' ? scheduledError : sentError;

  const filteredItems = currentItems.filter(
    (item) =>
      item.recipient.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.body.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentPage = Math.floor(currentOffset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(currentTotal / limit));

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sidebar matching Figma Images 2 & 3 */}
      <Sidebar
        user={user}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setSelectedEmail(null);
        }}
        onComposeClick={() => setIsComposeOpen(true)}
        scheduledCount={scheduledTotal}
        sentCount={sentTotal}
        onLogout={onLogout}
        isLoggingOut={isLoggingOut}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-white min-h-screen">
        {/* Search & Actions Header matching Figma */}
        <div className="h-16 px-8 flex items-center gap-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex-1 max-w-xl relative flex items-center">
            <div className="w-full bg-[#f4f6f5] rounded-full px-4 py-2 flex items-center gap-2.5 text-slate-500">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-400 shrink-0">
            <button
              type="button"
              className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-colors"
              title="Filter"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Email List Content */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {isLoading && currentItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400 gap-2">
              <div className="w-6 h-6 border-2 border-[#00a843] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-medium">Loading emails...</span>
            </div>
          ) : currentError ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 mb-2">
                <AlertCircle className="w-5 h-5" />
              </div>
              <p className="text-xs text-slate-700 font-medium mb-3">{currentError}</p>
              <button
                onClick={handleRefresh}
                className="border border-slate-300 text-slate-700 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-xs font-medium"
              >
                Try Again
              </button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                <Inbox className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-800">
                {activeTab === 'scheduled' ? 'No scheduled emails' : 'No sent emails'}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
                {activeTab === 'scheduled'
                  ? 'There are no campaigns in the queue. Click Compose to schedule a new batch.'
                  : 'Sent messages and dispatch logs will appear here.'}
              </p>
              {activeTab === 'scheduled' && (
                <button
                  onClick={() => setIsComposeOpen(true)}
                  className="bg-[#00a843] hover:bg-[#00923a] text-white text-xs font-semibold px-4 py-2 rounded-full shadow-sm"
                >
                  Compose New Email
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedEmail(item)}
                  className="px-8 py-3.5 flex items-center justify-between hover:bg-[#f9fbf9] cursor-pointer transition-colors group select-none text-xs"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1 mr-4">
                    {/* Recipient Prefix */}
                    <span className="font-semibold text-slate-900 w-36 truncate shrink-0">
                      To: {item.recipient}
                    </span>

                    {/* Status Pill Badge matching Figma Images 2 & 3 */}
                    {activeTab === 'scheduled' ? (
                      <span className="inline-flex items-center gap-1.5 bg-[#fff4e5] text-[#b35900] border border-[#ffe0b2] rounded-full px-2.5 py-0.5 text-[11px] font-medium shrink-0">
                        <Clock className="w-3 h-3 text-[#b35900]" />
                        <span>{formatScheduledTimePill(item.scheduledAt)}</span>
                      </span>
                    ) : item.status === 'sent' ? (
                      <span className="inline-flex items-center bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5 text-[11px] font-medium shrink-0">
                        Sent
                      </span>
                    ) : item.status === 'failed' ? (
                      <span className="inline-flex items-center bg-rose-50 text-rose-600 border border-rose-200 rounded-full px-2.5 py-0.5 text-[11px] font-medium shrink-0">
                        Failed
                      </span>
                    ) : (
                      <span className="inline-flex items-center bg-amber-50 text-amber-700 rounded-full px-2.5 py-0.5 text-[11px] font-medium shrink-0">
                        Processing
                      </span>
                    )}

                    {/* Subject in bold + Body snippet in grey */}
                    <div className="truncate min-w-0 flex-1 text-slate-700">
                      <span className="font-semibold text-slate-900 mr-1.5">
                        {item.subject}
                      </span>
                      <span className="text-slate-400 font-normal">
                        - {item.body.replace(/\n/g, ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Star Icon on Right */}
                  <button
                    onClick={(e) => toggleStar(item.id, e)}
                    className="p-1 hover:bg-slate-100 rounded-full text-slate-300 hover:text-slate-500 transition-colors shrink-0"
                  >
                    <Star
                      className={`w-4 h-4 ${
                        starredIds.has(item.id)
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-slate-300'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        {currentTotal > limit && (
          <div className="h-14 border-t border-slate-100 px-8 flex items-center justify-between text-xs text-slate-500 bg-white">
            <span>
              Showing <span className="font-semibold text-slate-800">{currentOffset + 1}</span> to{' '}
              <span className="font-semibold text-slate-800">
                {Math.min(currentOffset + limit, currentTotal)}
              </span>{' '}
              of <span className="font-semibold text-slate-800">{currentTotal}</span> emails
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (activeTab === 'scheduled') {
                    setScheduledOffset(Math.max(0, scheduledOffset - limit));
                  } else {
                    setSentOffset(Math.max(0, sentOffset - limit));
                  }
                }}
                disabled={currentOffset === 0}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => {
                  if (activeTab === 'scheduled') {
                    setScheduledOffset(scheduledOffset + limit);
                  } else {
                    setSentOffset(sentOffset + limit);
                  }
                }}
                disabled={currentOffset + limit >= currentTotal}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

