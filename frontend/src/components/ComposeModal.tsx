import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button.tsx';
import { Input } from './Input.tsx';
import { Textarea } from './Textarea.tsx';
import { FileUpload } from './FileUpload.tsx';
import { getDefaultStartTimeLocal, localDatetimeToUtcIso } from '../lib/dateUtils.ts';
import { api } from '../lib/api.ts';
import { useToast } from './Toast.tsx';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { addToast } = useToast();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [startAtLocal, setStartAtLocal] = useState(getDefaultStartTimeLocal());
  const [delayMs, setDelayMs] = useState<number>(2000);
  const [hourlyLimit, setHourlyLimit] = useState<number>(200);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!subject.trim()) {
      newErrors.subject = 'Subject is required';
    } else if (subject.length > 200) {
      newErrors.subject = 'Subject cannot exceed 200 characters';
    }

    if (!body.trim()) {
      newErrors.body = 'Body is required';
    }

    if (recipients.length === 0) {
      newErrors.recipients = 'Please upload a CSV or TXT file with valid email addresses';
    } else if (recipients.length > 1000) {
      newErrors.recipients = 'Maximum 1,000 recipients allowed per schedule batch';
    }

    if (!startAtLocal) {
      newErrors.startAt = 'Start time is required';
    } else {
      const selected = new Date(startAtLocal).getTime();
      if (selected <= Date.now()) {
        newErrors.startAt = 'Start time must be in the future';
      }
    }

    if (isNaN(delayMs) || delayMs < 2000) {
      newErrors.delayMs = 'Delay must be at least 2,000 ms (2s)';
    }

    if (isNaN(hourlyLimit) || hourlyLimit < 1 || hourlyLimit > 200) {
      newErrors.hourlyLimit = 'Hourly limit must be between 1 and 200';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      const startAtUtc = localDatetimeToUtcIso(startAtLocal);

      const response = await api.scheduleEmails({
        subject: subject.trim(),
        body: body.trim(),
        recipients,
        startAt: startAtUtc,
        delayMs: Number(delayMs),
        hourlyLimit: Number(hourlyLimit),
      });

      addToast(
        `Successfully scheduled ${response.count} emails!`,
        'success'
      );

      // Reset form
      setSubject('');
      setBody('');
      setRecipients([]);
      setStartAtLocal(getDefaultStartTimeLocal());
      setDelayMs(2000);
      setHourlyLimit(200);

      onSuccess();
      onClose();
    } catch (err: any) {
      if (err.details && Array.isArray(err.details)) {
        const fieldErrors: Record<string, string> = {};
        for (const item of err.details) {
          fieldErrors[item.field] = item.message;
        }
        setErrors(fieldErrors);
      } else {
        addToast(err.message || 'Failed to schedule emails', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative bg-white rounded-md border border-slate-200 shadow-xl max-w-xl w-full p-6 text-left my-8">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Schedule New Campaign
            </h2>
            <p className="text-xs text-slate-500">
              Configure batch delivery parameters and upload recipients.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-md p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <Input
            label="Subject"
            placeholder="e.g. Follow-up regarding Q3 product update"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            error={errors.subject}
          />

          <Textarea
            label="Email Body"
            placeholder="Write your email content here..."
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            error={errors.body}
          />

          <FileUpload
            onEmailsParsed={(list) => setRecipients(list)}
            error={errors.recipients}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              type="datetime-local"
              label="Start Time"
              value={startAtLocal}
              onChange={(e) => setStartAtLocal(e.target.value)}
              error={errors.startAt}
            />

            <Input
              type="number"
              label="Delay (ms)"
              min={2000}
              step={500}
              value={delayMs}
              onChange={(e) => setDelayMs(parseInt(e.target.value, 10))}
              helperText="Min: 2,000ms"
              error={errors.delayMs}
            />

            <Input
              type="number"
              label="Hourly Limit"
              min={1}
              max={200}
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(parseInt(e.target.value, 10))}
              helperText="Max: 200/hr"
              error={errors.hourlyLimit}
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 mt-2">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isSubmitting}
            >
              Schedule Campaign
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
