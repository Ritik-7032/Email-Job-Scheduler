import React, { useState, useRef } from 'react';
import { User } from '../types/index.ts';
import { getDefaultStartTimeLocal, localDatetimeToUtcIso } from '../lib/dateUtils.ts';
import { parseEmailList } from '../lib/csvParser.ts';
import { api } from '../lib/api.ts';
import { useToast } from './Toast.tsx';
import {
  ArrowLeft,
  Paperclip,
  Clock,
  Calendar,
  Upload,
  Undo2,
  Redo2,
  FileText,
  X
} from 'lucide-react';

interface EmailAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
}

interface ComposeViewProps {
  user: User;
  onBack: () => void;
  onSuccess: () => void;
}

export const ComposeView: React.FC<ComposeViewProps> = ({
  user,
  onBack,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const datePickerInputRef = useRef<HTMLInputElement>(null);

  const [toInput, setToInput] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delayMs, setDelayMs] = useState<string>('00');
  const [hourlyLimit, setHourlyLimit] = useState<string>('00');
  const [startAtLocal, setStartAtLocal] = useState(getDefaultStartTimeLocal());
  const [selectedPresetLabel, setSelectedPresetLabel] = useState<string | null>(null);
  const [isSendLaterOpen, setIsSendLaterOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<EmailAttachment[]>([
    {
      id: 'default-tennis',
      name: 'photo_match.png',
      size: 245000,
      type: 'image/png',
      dataUrl: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=800&q=80',
    },
  ]);

  // General Attachment Upload Handler (Images, PDFs, Docs)
  const handleAttachmentSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = (event.target?.result as string) || '';
        const newAtt: EmailAttachment = {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          dataUrl,
        };
        setAttachments((prev) => [...prev, newAtt]);
        addToast(`Attached: ${file.name}`, 'success');
      };
      reader.readAsDataURL(file);
    });

    if (e.target) e.target.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // CSV / TXT Upload Handler
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = (event.target?.result as string) || '';
      const result = parseEmailList(content);
      setRecipients(result.validEmails);
      addToast(
        `Parsed ${result.validEmails.length} valid email leads from ${file.name}`,
        'success'
      );
    };
    reader.readAsText(file);
  };

  // Quick Preset Helper for Send Later
  const applyPreset = (label: string, targetHour?: number) => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    if (targetHour !== undefined) {
      d.setHours(targetHour, 0, 0, 0);
    } else {
      d.setHours(9, 0, 0, 0);
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    setStartAtLocal(`${year}-${month}-${day}T${hours}:${minutes}`);
    setSelectedPresetLabel(label);
  };

  const handleCustomDateChange = (val: string) => {
    setStartAtLocal(val);
    if (val) {
      const d = new Date(val);
      const formatted = new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(d);
      setSelectedPresetLabel(formatted);
    }
  };

  const handleSend = async () => {
    let finalRecipients = [...recipients];
    if (toInput.trim()) {
      const parsed = parseEmailList(toInput);
      finalRecipients = Array.from(new Set([...finalRecipients, ...parsed.validEmails]));
    }

    if (!subject.trim()) {
      addToast('Subject is required', 'error');
      return;
    }

    if (!body.trim()) {
      addToast('Email body is required', 'error');
      return;
    }

    if (finalRecipients.length === 0) {
      addToast('Please enter or upload recipient email addresses', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const startAtUtc = localDatetimeToUtcIso(startAtLocal);

      const delayNum = parseInt(delayMs, 10);
      const hourlyNum = parseInt(hourlyLimit, 10);

      let finalBody = body.trim();
      if (attachments.length > 0) {
        attachments.forEach((att) => {
          if (att.type.startsWith('image/')) {
            finalBody += `\n\n![${att.name}](${att.dataUrl})`;
          } else {
            finalBody += `\n\n📎 [Attachment: ${att.name} (${(att.size / 1024).toFixed(1)} KB)](${att.dataUrl})`;
          }
        });
      }

      const res = await api.scheduleEmails({
        subject: subject.trim(),
        body: finalBody,
        recipients: finalRecipients,
        startAt: startAtUtc,
        delayMs: isNaN(delayNum) || delayNum < 2000 ? 2000 : delayNum,
        hourlyLimit: isNaN(hourlyNum) || hourlyNum < 1 ? 200 : hourlyNum,
      });

      addToast(`Successfully scheduled ${res.count} emails!`, 'success');
      onSuccess();
      onBack();
    } catch (err: unknown) {
      const error = err as { message?: string };
      addToast(error.message || 'Failed to schedule campaign', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col relative overflow-y-auto">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt"
        onChange={handleFileSelected}
        className="hidden"
      />
      <input
        ref={attachmentInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.txt"
        onChange={handleAttachmentSelected}
        className="hidden"
      />

      {/* Top Header Bar matching Images 2, 3, 4, 5 */}
      <div className="h-14 border-b border-slate-100 px-6 flex items-center justify-between sticky top-0 bg-white z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-semibold text-slate-900">
            Compose New Email
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Paperclip upload button with count badge matching Image 📎 1 */}
          <button
            type="button"
            onClick={() => attachmentInputRef.current?.click()}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-0.5 cursor-pointer"
            title="Attach images, PDFs, files"
          >
            <Paperclip className="w-4 h-4" />
            {attachments.length > 0 && (
              <span className="text-xs text-slate-700 font-semibold ml-0.5 select-none leading-none">
                {attachments.length}
              </span>
            )}
          </button>

          {/* Clock Send Later trigger */}
          <button
            type="button"
            onClick={() => setIsSendLaterOpen(!isSendLaterOpen)}
            className={`p-2 hover:bg-slate-100 rounded-full transition-colors ${
              isSendLaterOpen ? 'text-[#00a843] bg-emerald-50' : 'text-slate-500 hover:text-slate-800'
            }`}
            title="Schedule / Send Later"
          >
            <Clock className="w-4 h-4" />
          </button>

          {/* Send Later pill button matching Figma */}
          <button
            type="button"
            onClick={handleSend}
            disabled={isSubmitting}
            className="border border-[#00a843] text-[#00a843] hover:bg-[#e8f5e9]/80 active:bg-[#e8f5e9] rounded-full px-5 py-1 text-sm font-medium transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'Scheduling...' : 'Send Later'}
          </button>
        </div>
      </div>

      {/* Main Form Fields */}
      <div className="max-w-4xl w-full mx-auto px-8 py-6 flex flex-col gap-4">
        {/* From Row */}
        <div className="flex items-center py-2 border-b border-slate-100 text-sm">
          <span className="w-16 text-slate-400 font-medium text-xs">From</span>
          <div className="bg-[#f4f6f5] text-slate-800 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 font-medium">
            <span>{user.email}</span>
            <span className="text-slate-400 text-[10px]">∨</span>
          </div>
        </div>

        {/* To Row matching Images 3, 4, 5 */}
        <div className="flex items-center py-2 border-b border-slate-100 text-sm">
          <span className="w-16 text-slate-400 font-medium text-xs">To</span>
          <div className="flex-1 flex items-center justify-between min-w-0">
            <div className="flex items-center flex-wrap gap-2 flex-1 min-w-0 mr-3">
              {recipients.length > 0 ? (
                <>
                  {recipients.slice(0, 3).map((email, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center border border-[#00a843] bg-[#e8f5e9]/40 text-slate-800 text-xs px-3 py-0.5 rounded-full font-medium"
                    >
                      {email}
                    </span>
                  ))}
                  {recipients.length > 3 && (
                    <span className="inline-flex items-center border border-[#00a843] bg-white text-slate-800 text-xs px-2.5 py-0.5 rounded-full font-medium">
                      +{recipients.length - 3}
                    </span>
                  )}
                </>
              ) : (
                <input
                  type="text"
                  placeholder="recipient@example.com"
                  value={toInput}
                  onChange={(e) => setToInput(e.target.value)}
                  className="w-full border-none bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none py-1"
                />
              )}
            </div>

            {/* Upload List Button on the right matching Figma */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-[#00a843] hover:opacity-85 flex items-center gap-1.5 font-medium text-xs shrink-0 select-none"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload List</span>
            </button>
          </div>
        </div>

        {/* Subject Row */}
        <div className="flex items-center py-2 border-b border-slate-100 text-sm">
          <span className="w-16 text-slate-400 font-medium text-xs">Subject</span>
          <input
            type="text"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 border-none bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none py-1 font-medium"
          />
        </div>

        {/* Parameters Row matching Figma */}
        <div className="flex items-center gap-6 py-2 border-b border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Delay between 2 emails</span>
            <input
              type="text"
              value={delayMs}
              onChange={(e) => setDelayMs(e.target.value)}
              placeholder="00"
              className="w-16 bg-[#f4f6f5] border-none rounded-lg px-2.5 py-1 text-center font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#00a843]"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Hourly Limit</span>
            <input
              type="text"
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(e.target.value)}
              placeholder="00"
              className="w-16 bg-[#f4f6f5] border-none rounded-lg px-2.5 py-1 text-center font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#00a843]"
            />
          </div>
        </div>

        {/* Body & Rich Formatting Area matching uploaded screenshot */}
        <div className="mt-2 bg-[#fcfcfc] rounded-2xl border border-slate-100 p-6 flex flex-col min-h-[380px] relative gap-4">
          <div className="text-xs text-slate-400 font-medium select-none">
            Type Your Reply...
          </div>

          {/* Floating Pill Toolbar with exact symbols */}
          <div className="bg-white rounded-full border border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-4 py-2 flex items-center gap-3.5 w-fit overflow-x-auto select-none">
            {/* 1. Undo / Redo */}
            <div className="flex items-center gap-2 text-slate-500">
              <button
                type="button"
                className="p-1 hover:text-slate-800 transition-colors"
                title="Undo"
              >
                <Undo2 className="w-4 h-4 stroke-[1.8]" />
              </button>
              <button
                type="button"
                className="p-1 hover:text-slate-800 transition-colors"
                title="Redo"
              >
                <Redo2 className="w-4 h-4 stroke-[1.8]" />
              </button>
            </div>

            <div className="h-4 w-px bg-slate-200" />

            {/* 2. Text Style / Size (TT with up-down arrows) */}
            <div
              className="flex items-center gap-1 text-slate-600 hover:text-slate-900 cursor-pointer px-1 py-0.5 rounded transition-colors"
              title="Font Size"
            >
              <span className="font-serif font-semibold text-sm leading-none flex items-baseline">
                T<span className="text-[10px] font-medium ml-0.5">ᴛ</span>
              </span>
              <div className="flex flex-col text-slate-400 -space-y-1 ml-0.5">
                <span className="text-[8px] leading-none">▲</span>
                <span className="text-[8px] leading-none">▼</span>
              </div>
            </div>

            <div className="h-4 w-px bg-slate-200" />

            {/* 3. Bold, Italic, Underline, Alignment with arrows */}
            <div className="flex items-center gap-2.5 text-slate-600">
              <button
                type="button"
                className="px-1 text-sm font-bold hover:text-slate-900 transition-colors"
                title="Bold"
              >
                B
              </button>
              <button
                type="button"
                className="px-1 text-sm font-serif italic hover:text-slate-900 transition-colors"
                title="Italic"
              >
                I
              </button>
              <button
                type="button"
                className="px-1 text-sm underline underline-offset-2 hover:text-slate-900 transition-colors"
                title="Underline"
              >
                U
              </button>
              <div
                className="flex items-center gap-1 hover:text-slate-900 cursor-pointer px-1 py-0.5 transition-colors"
                title="Alignment & Line Height"
              >
                <svg
                  className="w-4 h-4 stroke-[1.8]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <line x1="3" y1="6" x2="21" y2="6" strokeLinecap="round" />
                  <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
                  <line x1="3" y1="18" x2="21" y2="18" strokeLinecap="round" />
                </svg>
                <div className="flex flex-col text-slate-400 -space-y-1">
                  <span className="text-[8px] leading-none">▲</span>
                  <span className="text-[8px] leading-none">▼</span>
                </div>
              </div>
            </div>

            <div className="h-4 w-px bg-slate-200" />

            {/* 4. Numbered list, Bullet list, Outdent, Indent, Quote, Flag */}
            <div className="flex items-center gap-2 text-slate-600">
              {/* Numbered List */}
              <button
                type="button"
                className="p-1 hover:text-slate-900 transition-colors"
                title="Numbered List"
              >
                <svg
                  className="w-4 h-4 stroke-[1.8]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path d="M10 6h11" strokeLinecap="round" />
                  <path d="M10 12h11" strokeLinecap="round" />
                  <path d="M10 18h11" strokeLinecap="round" />
                  <path d="M4 6h1v4" strokeLinecap="round" />
                  <path d="M4 10h2" strokeLinecap="round" />
                  <path d="M6 18H4c0-1 2-2 2-3s-1-1-2-1" strokeLinecap="round" />
                </svg>
              </button>

              {/* Bullet List */}
              <button
                type="button"
                className="p-1 hover:text-slate-900 transition-colors"
                title="Bullet List"
              >
                <svg
                  className="w-4 h-4 stroke-[1.8]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <line x1="9" y1="6" x2="20" y2="6" strokeLinecap="round" />
                  <line x1="9" y1="12" x2="20" y2="12" strokeLinecap="round" />
                  <line x1="9" y1="18" x2="20" y2="18" strokeLinecap="round" />
                  <circle cx="4" cy="6" r="1.5" fill="currentColor" />
                  <circle cx="4" cy="12" r="1.5" fill="currentColor" />
                  <circle cx="4" cy="18" r="1.5" fill="currentColor" />
                </svg>
              </button>

              {/* Outdent (Decrease Indent) */}
              <button
                type="button"
                className="p-1 hover:text-slate-900 transition-colors"
                title="Decrease Indent"
              >
                <svg
                  className="w-4 h-4 stroke-[1.8]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <polyline points="7 8 3 12 7 16" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="21" y1="6" x2="11" y2="6" strokeLinecap="round" />
                  <line x1="21" y1="12" x2="11" y2="12" strokeLinecap="round" />
                  <line x1="21" y1="18" x2="11" y2="18" strokeLinecap="round" />
                </svg>
              </button>

              {/* Indent (Increase Indent) */}
              <button
                type="button"
                className="p-1 hover:text-slate-900 transition-colors"
                title="Increase Indent"
              >
                <svg
                  className="w-4 h-4 stroke-[1.8]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <polyline points="17 8 21 12 17 16" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="3" y1="6" x2="13" y2="6" strokeLinecap="round" />
                  <line x1="3" y1="12" x2="13" y2="12" strokeLinecap="round" />
                  <line x1="3" y1="18" x2="13" y2="18" strokeLinecap="round" />
                </svg>
              </button>

              {/* Quote */}
              <button
                type="button"
                className="p-1 hover:text-slate-900 transition-colors"
                title="Quote"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179z" />
                </svg>
              </button>

              {/* Flag / Paragraph Bookmark */}
              <button
                type="button"
                className="p-1 hover:text-slate-900 transition-colors"
                title="Bookmark / Flag"
              >
                <svg
                  className="w-4 h-4 stroke-[1.8]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <line x1="4" y1="20" x2="4" y2="4" strokeLinecap="round" />
                  <path
                    d="M4 4h12l-2 5 2 5H4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            <div className="h-4 w-px bg-slate-200" />

            {/* 5. Strikethrough */}
            <div className="flex items-center text-slate-600">
              <button
                type="button"
                className="px-1 text-sm font-serif line-through hover:text-slate-900 transition-colors font-medium select-none"
                title="Strikethrough"
              >
                S
              </button>
            </div>
          </div>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your email body here..."
            className="flex-1 w-full p-2 border-none resize-none focus:outline-none text-sm text-slate-800 placeholder-slate-400 leading-relaxed font-normal min-h-[200px] bg-transparent"
          />

          {/* Attachments Section (Images, PDFs, Documents) matching uploaded screenshots */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 mt-2">
              {attachments.map((att) => {
                const isImg = att.type.startsWith('image/');
                if (isImg) {
                  return (
                    <div key={att.id} className="relative group w-fit">
                      <img
                        src={att.dataUrl}
                        alt={att.name}
                        className="w-48 h-32 object-cover rounded-2xl border border-slate-200/90 shadow-sm transition-transform hover:scale-[1.01]"
                      />
                      <button
                        type="button"
                        onClick={() => removeAttachment(att.id)}
                        className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black/90 text-white rounded-full transition-all shadow-md cursor-pointer"
                        title="Remove image"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={att.id}
                    className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-xs group"
                  >
                    <div className="p-1.5 bg-emerald-50 text-[#00a843] rounded-lg">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col max-w-[180px]">
                      <span className="text-xs font-semibold text-slate-800 truncate" title={att.name}>
                        {att.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {(att.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      className="p-1 text-slate-400 hover:text-red-500 rounded-full transition-colors ml-1 cursor-pointer"
                      title="Remove file"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Send Later Popover matching Image 1 & Image 2 exactly */}
      {isSendLaterOpen && (
        <div className="absolute top-16 right-8 w-80 bg-white rounded-2xl border border-slate-200/90 shadow-2xl p-5 z-20 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Send Later</h3>
            <button
              onClick={() => setIsSendLaterOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-full"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Custom Date Time Input matching Image 1: "Pick date & time" with Calendar icon */}
          <div
            onClick={() => {
              if (datePickerInputRef.current) {
                if ('showPicker' in HTMLInputElement.prototype) {
                  datePickerInputRef.current.showPicker();
                } else {
                  datePickerInputRef.current.focus();
                }
              }
            }}
            className="relative flex items-center justify-between pb-2 border-b border-slate-200 cursor-pointer group"
          >
            <span className={`text-xs select-none ${selectedPresetLabel ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>
              {selectedPresetLabel || 'Pick date & time'}
            </span>
            <Calendar className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />

            {/* Hidden native picker to drive the value */}
            <input
              ref={datePickerInputRef}
              type="datetime-local"
              value={startAtLocal}
              onChange={(e) => handleCustomDateChange(e.target.value)}
              className="absolute inset-0 opacity-0 pointer-events-auto cursor-pointer w-full h-full"
            />
          </div>

          {/* Quick Presets matching Figma */}
          <div className="flex flex-col text-xs text-slate-600 divide-y divide-slate-100">
            <button
              type="button"
              onClick={() => applyPreset('Tomorrow', 9)}
              className="py-2.5 text-left hover:text-[#00a843] font-medium transition-colors"
            >
              Tomorrow
            </button>
            <button
              type="button"
              onClick={() => applyPreset('Tomorrow, 10:00 AM', 10)}
              className="py-2.5 text-left hover:text-[#00a843] font-medium transition-colors"
            >
              Tomorrow, 10:00 AM
            </button>
            <button
              type="button"
              onClick={() => applyPreset('Tomorrow, 11:00 AM', 11)}
              className="py-2.5 text-left hover:text-[#00a843] font-medium transition-colors"
            >
              Tomorrow, 11:00 AM
            </button>
            <button
              type="button"
              onClick={() => applyPreset('Tomorrow, 3:00 PM', 15)}
              className="py-2.5 text-left hover:text-[#00a843] font-medium transition-colors"
            >
              Tomorrow, 3:00 PM
            </button>
          </div>

          {/* Footer Buttons matching Figma: Cancel (text) & Done (pill) */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsSendLaterOpen(false)}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSendLaterOpen(false);
                addToast(
                  `Send time scheduled for ${selectedPresetLabel || startAtLocal.replace('T', ' ')}`,
                  'info'
                );
              }}
              className="border border-[#00a843] text-[#00a843] hover:bg-[#e8f5e9] rounded-full px-5 py-1 text-xs font-semibold transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
