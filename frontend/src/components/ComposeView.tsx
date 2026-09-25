import React, { useState } from 'react';
import { User } from '../types/index.ts';
import { getDefaultStartTimeLocal, localDatetimeToUtcIso } from '../lib/dateUtils.ts';
import { parseEmailList } from '../lib/csvParser.ts';
import { api } from '../lib/api.ts';
import { useToast } from './Toast.tsx';
import { EmailAttachment } from './compose/types.ts';
import { SubjectBodyFields } from './compose/SubjectBodyFields.tsx';
import { RecipientUpload } from './compose/RecipientUpload.tsx';
import { DeliveryControls } from './compose/DeliveryControls.tsx';
import { ReviewSubmitAction } from './compose/ReviewSubmitAction.tsx';

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

  const [toInput, setToInput] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delayMs, setDelayMs] = useState<string>('00');
  const [hourlyLimit, setHourlyLimit] = useState<string>('00');
  const [startAtLocal, setStartAtLocal] = useState(getDefaultStartTimeLocal());
  const [hasUserCustomizedTime, setHasUserCustomizedTime] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);

  const handleAttachmentAdded = (newAtt: EmailAttachment) => {
    setAttachments((prev) => [...prev, newAtt]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
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
      let effectiveStartAtLocal = startAtLocal;
      const parsedStartMs = new Date(effectiveStartAtLocal).getTime();

      if (!hasUserCustomizedTime || isNaN(parsedStartMs) || parsedStartMs <= Date.now() + 10000) {
        effectiveStartAtLocal = getDefaultStartTimeLocal();
      }

      const startAtUtc = localDatetimeToUtcIso(effectiveStartAtLocal);

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
      <ReviewSubmitAction
        onBack={onBack}
        onSubmit={handleSend}
        isSubmitting={isSubmitting}
        attachments={attachments}
        onAttachmentAdded={handleAttachmentAdded}
        startAtLocal={startAtLocal}
        onStartAtLocalChange={setStartAtLocal}
        setHasUserCustomizedTime={setHasUserCustomizedTime}
      />

      <div className="max-w-4xl w-full mx-auto px-8 py-6 flex flex-col gap-4">
        <div className="flex items-center py-2 border-b border-slate-100 text-sm">
          <span className="w-16 text-slate-400 font-medium text-xs">From</span>
          <div className="bg-[#f4f6f5] text-slate-800 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 font-medium">
            <span>{user.email}</span>
            <span className="text-slate-400 text-[10px]">∨</span>
          </div>
        </div>

        <RecipientUpload
          toInput={toInput}
          onToInputChange={setToInput}
          recipients={recipients}
          onRecipientsChange={setRecipients}
        />

        <SubjectBodyFields
          subject={subject}
          onSubjectChange={setSubject}
          body={body}
          onBodyChange={setBody}
          attachments={attachments}
          onRemoveAttachment={removeAttachment}
        >
          <DeliveryControls
            delayMs={delayMs}
            onDelayMsChange={setDelayMs}
            hourlyLimit={hourlyLimit}
            onHourlyLimitChange={setHourlyLimit}
          />
        </SubjectBodyFields>
      </div>
    </div>
  );
};
