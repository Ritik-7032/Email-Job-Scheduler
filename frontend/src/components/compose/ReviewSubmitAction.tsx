import React, { useRef, useState } from 'react';
import { ArrowLeft, Paperclip, Clock, Calendar, X } from 'lucide-react';
import { EmailAttachment } from './types.ts';
import { useToast } from '../Toast.tsx';

interface ReviewSubmitActionProps {
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  attachments: EmailAttachment[];
  onAttachmentAdded: (attachment: EmailAttachment) => void;
  startAtLocal: string;
  onStartAtLocalChange: (value: string) => void;
  setHasUserCustomizedTime: (value: boolean) => void;
}

export const ReviewSubmitAction: React.FC<ReviewSubmitActionProps> = ({
  onBack,
  onSubmit,
  isSubmitting,
  attachments,
  onAttachmentAdded,
  startAtLocal,
  onStartAtLocalChange,
  setHasUserCustomizedTime,
}) => {
  const { addToast } = useToast();
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const datePickerInputRef = useRef<HTMLInputElement>(null);

  const [selectedPresetLabel, setSelectedPresetLabel] = useState<string | null>(null);
  const [isSendLaterOpen, setIsSendLaterOpen] = useState(false);

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
        onAttachmentAdded(newAtt);
        addToast(`Attached: ${file.name}`, 'success');
      };
      reader.readAsDataURL(file);
    });

    if (e.target) {
      e.target.value = '';
    }
  };

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
    onStartAtLocalChange(`${year}-${month}-${day}T${hours}:${minutes}`);
    setSelectedPresetLabel(label);
    setHasUserCustomizedTime(true);
  };

  const handleCustomDateChange = (val: string) => {
    onStartAtLocalChange(val);
    setHasUserCustomizedTime(true);
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

  return (
    <>
      <input
        ref={attachmentInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.txt"
        onChange={handleAttachmentSelected}
        className="hidden"
      />

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

          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="border border-[#00a843] text-[#00a843] hover:bg-[#e8f5e9]/80 active:bg-[#e8f5e9] rounded-full px-5 py-1 text-sm font-medium transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'Scheduling...' : 'Send Later'}
          </button>
        </div>
      </div>

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

            <input
              ref={datePickerInputRef}
              type="datetime-local"
              value={startAtLocal}
              onChange={(e) => handleCustomDateChange(e.target.value)}
              className="absolute inset-0 opacity-0 pointer-events-auto cursor-pointer w-full h-full"
            />
          </div>

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
    </>
  );
};
