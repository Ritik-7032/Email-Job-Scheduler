import React, { useRef, useState } from 'react';
import { Upload, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { parseEmailList, ParseResult } from '../lib/csvParser.ts';

interface FileUploadProps {
  onEmailsParsed: (emails: string[]) => void;
  error?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onEmailsParsed,
  error,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const processFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = (e.target?.result as string) || '';
      const result = parseEmailList(content);
      setStats(result);
      onEmailsParsed(result.validEmails);
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  return (
    <div className="w-full flex flex-col gap-2">
      <label className="text-xs font-semibold uppercase tracking-wider text-slate-700">
        Recipients (CSV or Text File)
      </label>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-md p-4 flex flex-col items-center justify-center cursor-pointer transition-colors ${
          error
            ? 'border-rose-300 bg-rose-50/20 hover:bg-rose-50/40'
            : 'border-slate-300 bg-slate-50/50 hover:bg-slate-100/60'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          onChange={handleFileChange}
          className="hidden"
        />

        <Upload className="w-5 h-5 text-slate-400 mb-1.5" />
        <p className="text-xs font-medium text-slate-700">
          Click to upload or drag & drop .csv or .txt file
        </p>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Comma, semicolon, or newline-separated email addresses
        </p>
      </div>

      {fileName && (
        <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200">
          <FileText className="w-4 h-4 text-slate-500" />
          <span className="font-medium truncate max-w-[200px]">{fileName}</span>
        </div>
      )}

      {stats && (
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{stats.validEmails.length} valid email addresses detected</span>
          </div>
          {(stats.ignoredCount > 0 || stats.duplicateCount > 0) && (
            <div className="flex items-center gap-1.5 text-slate-500">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>
                {stats.ignoredCount > 0 && `${stats.ignoredCount} invalid entries ignored`}
                {stats.ignoredCount > 0 && stats.duplicateCount > 0 && ', '}
                {stats.duplicateCount > 0 && `${stats.duplicateCount} duplicates removed`}
              </span>
            </div>
          )}
        </div>
      )}

      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
};
