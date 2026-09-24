import React, { useState, useEffect, useCallback } from 'react';
import { User, EmailItem } from '../types/index.ts';
import { Header } from '../components/Header.tsx';
import { EmailTable } from '../components/EmailTable.tsx';
import { ComposeModal } from '../components/ComposeModal.tsx';
import { Button } from '../components/Button.tsx';
import { api } from '../lib/api.ts';
import { Plus, RefreshCw, Calendar, Send } from 'lucide-react';
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
    if (activeTab === 'scheduled') {
      fetchScheduled(scheduledOffset);
    } else {
      fetchSent(sentOffset);
    }
  }, [activeTab, scheduledOffset, sentOffset, fetchScheduled, fetchSent]);

  const handleRefresh = () => {
    if (activeTab === 'scheduled') {
      fetchScheduled(scheduledOffset);
    } else {
      fetchSent(sentOffset);
    }
  };

  const handleScheduleSuccess = () => {
    setActiveTab('scheduled');
    setScheduledOffset(0);
    fetchScheduled(0);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header user={user} onLogout={onLogout} isLoggingOut={isLoggingOut} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-md">
            <button
              onClick={() => setActiveTab('scheduled')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                activeTab === 'scheduled'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Scheduled Emails</span>
              {scheduledTotal > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold">
                  {scheduledTotal}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('sent')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                activeTab === 'sent'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Sent Emails</span>
              {sentTotal > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold">
                  {sentTotal}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              isLoading={isLoading}
              title="Refresh table"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsComposeOpen(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Compose New Email</span>
            </Button>
          </div>
        </div>

        {activeTab === 'scheduled' ? (
          <EmailTable
            type="scheduled"
            items={scheduledEmails}
            total={scheduledTotal}
            limit={limit}
            offset={scheduledOffset}
            isLoading={isLoading}
            error={scheduledError}
            onPageChange={(newOffset) => setScheduledOffset(newOffset)}
            onComposeClick={() => setIsComposeOpen(true)}
            onRetry={() => fetchScheduled(scheduledOffset)}
          />
        ) : (
          <EmailTable
            type="sent"
            items={sentEmails}
            total={sentTotal}
            limit={limit}
            offset={sentOffset}
            isLoading={isLoading}
            error={sentError}
            onPageChange={(newOffset) => setSentOffset(newOffset)}
            onComposeClick={() => setIsComposeOpen(true)}
            onRetry={() => fetchSent(sentOffset)}
          />
        )}
      </main>

      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        onSuccess={handleScheduleSuccess}
      />
    </div>
  );
};
