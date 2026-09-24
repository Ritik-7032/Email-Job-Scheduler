import React from 'react';
import { EmailItem } from '../types/index.ts';
import { formatDateToLocal } from '../lib/dateUtils.ts';
import { ExternalLink, ChevronLeft, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button.tsx';
import { EmptyState } from './EmptyState.tsx';

interface EmailTableProps {
  type: 'scheduled' | 'sent';
  items: EmailItem[];
  total: number;
  limit: number;
  offset: number;
  isLoading: boolean;
  error?: string | null;
  onPageChange: (newOffset: number) => void;
  onComposeClick: () => void;
  onRetry?: () => void;
}

export const EmailTable: React.FC<EmailTableProps> = ({
  type,
  items,
  total,
  limit,
  offset,
  isLoading,
  error,
  onPageChange,
  onComposeClick,
  onRetry,
}) => {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const getStatusBadge = (status: EmailItem['status']) => {
    switch (status) {
      case 'scheduled':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            Scheduled
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
            Processing
          </span>
        );
      case 'sent':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            Sent
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="w-full bg-white rounded-md border border-slate-200 p-8 flex flex-col items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-900 mb-2"></div>
        <p className="text-xs text-slate-500">Loading {type} emails...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full bg-white rounded-md border border-rose-200 p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
        <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center mb-3">
          <AlertCircle className="w-5 h-5 text-rose-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-800">Failed to load {type} emails</h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">{error}</p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Try Again
          </Button>
        )}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title={type === 'scheduled' ? 'No scheduled emails' : 'No sent emails'}
        description={
          type === 'scheduled'
            ? 'You have no emails waiting in the schedule queue. Click below to schedule a new campaign.'
            : 'No emails have completed dispatch yet. Emails will appear here after being sent.'
        }
        action={
          type === 'scheduled' ? (
            <Button size="sm" onClick={onComposeClick}>
              Compose New Email
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="w-full bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
              <th className="py-2.5 px-4">Recipient</th>
              <th className="py-2.5 px-4">Subject</th>
              <th className="py-2.5 px-4">Sender</th>
              <th className="py-2.5 px-4">
                {type === 'scheduled' ? 'Scheduled For' : 'Sent At'}
              </th>
              <th className="py-2.5 px-4">Status</th>
              {type === 'sent' && <th className="py-2.5 px-4">Preview</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                <td className="py-2.5 px-4 font-medium text-slate-900 truncate max-w-[200px]">
                  {item.recipient}
                </td>
                <td className="py-2.5 px-4 truncate max-w-[260px]" title={item.subject}>
                  {item.subject}
                </td>
                <td className="py-2.5 px-4 text-slate-500 truncate max-w-[160px]">
                  {item.sender?.email || '-'}
                </td>
                <td className="py-2.5 px-4 whitespace-nowrap text-slate-600">
                  {type === 'scheduled'
                    ? formatDateToLocal(item.scheduledAt)
                    : formatDateToLocal(item.sentAt || item.updatedAt)}
                </td>
                <td className="py-2.5 px-4 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {getStatusBadge(item.status)}
                    {item.attempts > 1 && item.status !== 'sent' && (
                      <span className="text-[10px] text-slate-400">
                        ({item.attempts} attempts)
                      </span>
                    )}
                  </div>
                  {item.errorMessage && item.status === 'failed' && (
                    <p className="text-[10px] text-rose-600 truncate max-w-[180px] mt-0.5">
                      {item.errorMessage}
                    </p>
                  )}
                </td>
                {type === 'sent' && (
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    {item.previewUrl ? (
                      <a
                        href={item.previewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-slate-900 hover:text-slate-600 font-medium hover:underline text-[11px]"
                      >
                        <span>View</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-200 px-4 py-3 flex items-center justify-between bg-slate-50/50">
        <div className="text-xs text-slate-500">
          Showing <span className="font-medium text-slate-900">{offset + 1}</span> to{' '}
          <span className="font-medium text-slate-900">
            {Math.min(offset + limit, total)}
          </span>{' '}
          of <span className="font-medium text-slate-900">{total}</span> emails
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => onPageChange(Math.max(0, offset - limit))}
          >
            <ChevronLeft className="w-3.5 h-3.5 mr-1" />
            Previous
          </Button>

          <span className="text-xs text-slate-600 font-medium px-2">
            Page {currentPage} of {totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            disabled={offset + limit >= total}
            onClick={() => onPageChange(offset + limit)}
          >
            Next
            <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
};
