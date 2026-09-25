import React, { useRef } from 'react';
import { Upload } from 'lucide-react';
import { parseEmailList } from '../../lib/csvParser.ts';
import { useToast } from '../Toast.tsx';

interface RecipientUploadProps {
  toInput: string;
  onToInputChange: (value: string) => void;
  recipients: string[];
  onRecipientsChange: (recipients: string[]) => void;
}

export const RecipientUpload: React.FC<RecipientUploadProps> = ({
  toInput,
  onToInputChange,
  recipients,
  onRecipientsChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = (event.target?.result as string) || '';
      const result = parseEmailList(content);
      onRecipientsChange(result.validEmails);
      addToast(
        `Parsed ${result.validEmails.length} valid email leads from ${file.name}`,
        'success'
      );
    };
    reader.readAsText(file);
    if (e.target) {
      e.target.value = '';
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt"
        onChange={handleFileSelected}
        className="hidden"
      />
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
                onChange={(e) => onToInputChange(e.target.value)}
                className="w-full border-none bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none py-1"
              />
            )}
          </div>

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
    </>
  );
};
