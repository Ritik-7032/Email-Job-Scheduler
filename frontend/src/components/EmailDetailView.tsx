import React from 'react';
import { EmailItem, User } from '../types/index.ts';
import { formatDateToLocal } from '../lib/dateUtils.ts';
import { ArrowLeft, Star, Trash2, Archive, ExternalLink, FileText, Reply, Forward } from 'lucide-react';

interface EmailDetailViewProps {
  email: EmailItem;
  user: User;
  onBack: () => void;
}

export function sanitizeAndFormatEmailHtml(content: string): string {
  if (!content) return '';

  // 1. Strip dangerous tags
  let safe = content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/on\w+=[^\s>]+/gi, '')
    .replace(/javascript:[^\s"'>]+/gi, '#');

  // 2. Format markdown bold, italic, and strikethrough if present
  safe = safe
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/~~(.*?)~~/g, '<s>$1</s>');

  // 3. Preserve newlines if text does not already contain HTML block tags
  if (!/<(?:p|div|br)\b/i.test(safe)) {
    safe = safe.replace(/\n/g, '<br/>');
  }

  return safe;
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
    <div className="flex-1 bg-slate-50 min-h-screen flex flex-col overflow-y-auto">
      {/* Top Header Bar matching typical email clients */}
      <div className="h-14 border-b border-slate-200/80 px-6 flex items-center justify-between sticky top-0 bg-white z-10 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-700 transition-colors shrink-0 cursor-pointer"
            title="Back to inbox"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 truncate">
            <h2 className="text-base font-semibold text-slate-900 truncate">
              {email.subject}
            </h2>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize shrink-0 ${
              email.status === 'sent'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : email.status === 'failed'
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              {email.status}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-slate-400 shrink-0">
          <button
            onClick={() => setIsStarred(!isStarred)}
            className={`p-1.5 hover:bg-slate-100 rounded-full transition-colors cursor-pointer ${
              isStarred ? 'text-amber-400 fill-amber-400' : 'text-slate-400'
            }`}
            title={isStarred ? 'Starred' : 'Not starred'}
          >
            <Star className={`w-4 h-4 ${isStarred ? 'fill-current' : ''}`} />
          </button>
          <button className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors cursor-pointer" title="Archive">
            <Archive className="w-4 h-4" />
          </button>
          <button className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-rose-500 transition-colors cursor-pointer" title="Delete">
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

      {/* Main Email Message Card */}
      <div className="max-w-4xl w-full mx-auto px-6 py-6 flex flex-col gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-7 flex flex-col gap-6">
          {/* Sender & Recipient Metadata */}
          <div className="flex items-start justify-between border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 text-white flex items-center justify-center font-bold text-base shadow-xs shrink-0">
                {senderInitial}
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 text-sm">
                    {email.sender?.email || 'HyperSend Dispatcher'}
                  </span>
                  <span className="text-xs text-slate-400 hidden sm:inline">
                    &lt;{email.sender?.email || 'system@scheduler.internal'}&gt;
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span>to</span>
                  <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                    {email.recipient}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-400 font-medium shrink-0">
              {formatDateToLocal(email.sentAt || email.scheduledAt)}
            </div>
          </div>

          {/* Email Body & Attachments */}
          {(() => {
            const regex = /(?:!\[(.*?)\]\((.*?)\)|📎\s*\[Attachment:\s*(.*?)\]\((.*?)\))/g;
            const parts: Array<{ type: 'text' | 'image' | 'file'; content?: string; alt?: string; src?: string; name?: string }> = [];
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
                <div
                  className="text-[14.5px] text-slate-800 leading-relaxed font-normal"
                  dangerouslySetInnerHTML={{ __html: sanitizeAndFormatEmailHtml(email.body) }}
                />
              );
            }

            return (
              <div className="flex flex-col gap-5">
                {parts.map((p, idx) => {
                  if (p.type === 'text' && p.content?.trim()) {
                    return (
                      <div
                        key={idx}
                        className="text-[14.5px] text-slate-800 leading-relaxed font-normal"
                        dangerouslySetInnerHTML={{ __html: sanitizeAndFormatEmailHtml(p.content) }}
                      />
                    );
                  }
                  if (p.type === 'image' && p.src) {
                    return (
                      <div key={idx} className="my-2 max-w-lg">
                        <div className="rounded-2xl overflow-hidden border border-slate-200/90 shadow-sm bg-slate-50">
                          <img
                            src={p.src}
                            alt={p.alt || 'Email attachment'}
                            className="w-full max-h-[460px] object-contain block"
                          />
                          {p.alt && (
                            <div className="px-3.5 py-2 bg-white border-t border-slate-100 text-xs text-slate-500 font-medium truncate">
                              🖼️ {p.alt}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  if (p.type === 'file' && p.src) {
                    return (
                      <div key={idx} className="w-fit my-1">
                        <a
                          href={p.src}
                          download={p.name}
                          className="inline-flex items-center gap-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-800 transition-colors shadow-xs"
                        >
                          <span className="p-1 bg-emerald-50 text-[#00a843] rounded-md">
                            <FileText className="w-4 h-4" />
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

          {/* Quick Action Bar like typical webmail */}
          <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
            <button
              onClick={() => onBack()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              <Reply className="w-3.5 h-3.5" />
              <span>Reply</span>
            </button>
            <button
              onClick={() => onBack()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              <Forward className="w-3.5 h-3.5" />
              <span>Forward</span>
            </button>
          </div>
        </div>

        {/* Ethereal SMTP Test Preview Link Banner if available */}
        {email.previewUrl && (
          <div className="p-4 bg-white rounded-2xl border border-slate-200 flex items-center justify-between shadow-xs">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-900">
                Ethereal SMTP Test Preview
              </span>
              <span className="text-[11px] text-slate-500">
                View this rendered email in Ethereal webmail.
              </span>
            </div>
            <a
              href={email.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 bg-[#00a843] hover:bg-[#00923a] text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors shadow-xs"
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
