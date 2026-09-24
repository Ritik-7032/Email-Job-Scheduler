import React from 'react';
import { EmailItem, User } from '../types/index.ts';
import { formatDateToLocal } from '../lib/dateUtils.ts';
import { ArrowLeft, Star, Trash2, Archive, ExternalLink, FileText } from 'lucide-react';

interface EmailDetailViewProps {
  email: EmailItem;
  user: User;
  onBack: () => void;
}

export const EmailDetailView: React.FC<EmailDetailViewProps> = ({
  email,
  user,
  onBack,
}) => {
  const [isStarred, setIsStarred] = React.useState(false);

  const senderInitial = email.sender?.email
    ? email.sender.email[0].toUpperCase()
    : email.recipient[0].toUpperCase();

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col overflow-y-auto">
      {/* Top Header Bar matching Image 4 */}
      <div className="h-14 border-b border-slate-100 px-6 flex items-center justify-between sticky top-0 bg-white z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-700 transition-colors shrink-0"
            title="Back to inbox"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-semibold text-slate-900 truncate">
            {email.subject}
          </h2>
        </div>

        <div className="flex items-center gap-4 text-slate-400 shrink-0">
          <button
            onClick={() => setIsStarred(!isStarred)}
            className={`p-1.5 hover:bg-slate-100 rounded-full transition-colors ${
              isStarred ? 'text-amber-400 fill-amber-400' : 'text-slate-400'
            }`}
          >
            <Star className={`w-4 h-4 ${isStarred ? 'fill-current' : ''}`} />
          </button>
          <button className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
            <Archive className="w-4 h-4" />
          </button>
          <button className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="h-4 w-px bg-slate-200 mx-1" />
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              className="w-7 h-7 rounded-full object-cover border border-slate-200"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold">
              {user.name[0]?.toUpperCase() || 'U'}
            </div>
          )}
        </div>
      </div>

      {/* Main Email Content */}
      <div className="max-w-4xl w-full mx-auto px-8 py-8 flex flex-col gap-6">
        {/* Sender Info Row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#00a843] text-white flex items-center justify-center font-bold text-base shrink-0">
              {senderInitial}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 text-sm">
                  {email.sender?.email || 'ReachInbox Scheduler'}
                </span>
                <span className="text-xs text-slate-400">
                  &lt;{email.sender?.email || 'system@reachinbox.ai'}&gt;
                </span>
              </div>
              <span className="text-xs text-slate-500">
                to {email.recipient}
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-400 font-medium">
            {formatDateToLocal(email.sentAt || email.scheduledAt)}
          </div>
        </div>

        {/* Email Body & Attachments */}
        {(() => {
          const regex = /(?:!\[(.*?)\]\((.*?)\)|📎\s*\[Attachment:\s*(.*?)\]\((.*?)\))/g;
          const parts = [];
          let lastIndex = 0;
          let match;

          while ((match = regex.exec(email.body)) !== null) {
            if (match.index > lastIndex) {
              parts.push({
                type: 'text',
                content: email.body.slice(lastIndex, match.index),
              });
            }

            if (match[1] !== undefined) {
              // Image match
              parts.push({
                type: 'image',
                alt: match[1],
                src: match[2],
              });
            } else if (match[3] !== undefined) {
              // File attachment match
              parts.push({
                type: 'file',
                name: match[3],
                src: match[4],
              });
            }

            lastIndex = regex.lastIndex;
          }

          if (lastIndex < email.body.length) {
            parts.push({
              type: 'text',
              content: email.body.slice(lastIndex),
            });
          }

          if (parts.length === 0) {
            return (
              <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap pt-2 font-normal">
                {email.body}
              </div>
            );
          }

          return (
            <div className="flex flex-col gap-4 pt-2">
              {parts.map((p, idx) => {
                if (p.type === 'text' && p.content?.trim()) {
                  return (
                    <div
                      key={idx}
                      className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap font-normal"
                    >
                      {p.content}
                    </div>
                  );
                }
                if (p.type === 'image' && p.src) {
                  return (
                    <div key={idx} className="w-fit my-2">
                      <img
                        src={p.src}
                        alt={p.alt || 'Email attachment'}
                        className="max-w-md w-full rounded-2xl border border-slate-200 shadow-sm object-cover"
                      />
                    </div>
                  );
                }
                if (p.type === 'file' && p.src) {
                  return (
                    <div key={idx} className="w-fit my-1">
                      <a
                        href={p.src}
                        download={p.name}
                        className="inline-flex items-center gap-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors shadow-xs"
                      >
                        <span className="p-1 bg-emerald-50 text-[#00a843] rounded-md">
                          <FileText className="w-3.5 h-3.5" />
                        </span>
                        <span>{p.name}</span>
                      </a>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          );
        })()}

        {/* Ethereal Preview Link Banner if available */}
        {email.previewUrl && (
          <div className="mt-8 p-4 bg-[#f4f6f5] rounded-xl border border-slate-200 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-900">
                Ethereal SMTP Test Preview
              </span>
              <span className="text-[11px] text-slate-500">
                View this rendered email as received by the mail server.
              </span>
            </div>
            <a
              href={email.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 bg-[#00a843] hover:bg-[#00923a] text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors shadow-sm"
            >
              <span>Open in Ethereal</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
