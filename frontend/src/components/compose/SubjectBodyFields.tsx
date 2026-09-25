import React, { useRef, useEffect } from 'react';
import { Undo2, Redo2, FileText, X } from 'lucide-react';
import { EmailAttachment } from './types.ts';

interface SubjectBodyFieldsProps {
  subject: string;
  onSubjectChange: (value: string) => void;
  body: string;
  onBodyChange: (value: string) => void;
  attachments: EmailAttachment[];
  onRemoveAttachment: (id: string) => void;
  children?: React.ReactNode;
}

export const SubjectBodyFields: React.FC<SubjectBodyFieldsProps> = ({
  subject,
  onSubjectChange,
  body,
  onBodyChange,
  attachments,
  onRemoveAttachment,
  children,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && !body && editorRef.current.innerHTML !== '') {
      editorRef.current.innerHTML = '';
    }
  }, [body]);

  const execCmd = (cmd: string, value: string | undefined = undefined) => {
    if (editorRef.current) {
      editorRef.current.focus();
      document.execCommand(cmd, false, value);
      onBodyChange(editorRef.current.innerHTML);
    }
  };

  return (
    <>
      <div className="flex items-center py-2 border-b border-slate-100 text-sm">
        <span className="w-16 text-slate-400 font-medium text-xs">Subject</span>
        <input
          type="text"
          placeholder="Subject"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          className="flex-1 border-none bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none py-1 font-medium"
        />
      </div>

      {children}

      <div className="mt-2 bg-[#fcfcfc] rounded-2xl border border-slate-100 p-6 flex flex-col min-h-[380px] relative gap-4">
        <div className="text-xs text-slate-400 font-medium select-none">
          Type Your Reply...
        </div>

        <div className="bg-white rounded-full border border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-4 py-2 flex items-center gap-3.5 w-fit overflow-x-auto select-none">
          <div className="flex items-center gap-2 text-slate-500">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCmd('undo')}
              className="p-1 hover:text-slate-800 transition-colors cursor-pointer"
              title="Undo"
            >
              <Undo2 className="w-4 h-4 stroke-[1.8]" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCmd('redo')}
              className="p-1 hover:text-slate-800 transition-colors cursor-pointer"
              title="Redo"
            >
              <Redo2 className="w-4 h-4 stroke-[1.8]" />
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          <div
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execCmd('fontSize', '4')}
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

          <div className="flex items-center gap-2.5 text-slate-600">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCmd('bold')}
              className="px-1 text-sm font-bold hover:text-slate-900 transition-colors cursor-pointer"
              title="Bold"
            >
              B
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCmd('italic')}
              className="px-1 text-sm font-serif italic hover:text-slate-900 transition-colors cursor-pointer"
              title="Italic"
            >
              I
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCmd('underline')}
              className="px-1 text-sm underline underline-offset-2 hover:text-slate-900 transition-colors cursor-pointer"
              title="Underline"
            >
              U
            </button>
            <div
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCmd('justifyCenter')}
              className="flex items-center gap-1 hover:text-slate-900 cursor-pointer px-1 py-0.5 transition-colors"
              title="Center Alignment"
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

          <div className="flex items-center gap-2 text-slate-600">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCmd('insertOrderedList')}
              className="p-1 hover:text-slate-900 transition-colors cursor-pointer"
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

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCmd('insertUnorderedList')}
              className="p-1 hover:text-slate-900 transition-colors cursor-pointer"
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

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCmd('outdent')}
              className="p-1 hover:text-slate-900 transition-colors cursor-pointer"
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

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCmd('indent')}
              className="p-1 hover:text-slate-900 transition-colors cursor-pointer"
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
                <line x1="3" y1="12" x2="13" y2="13" strokeLinecap="round" />
                <line x1="3" y1="18" x2="13" y2="18" strokeLinecap="round" />
              </svg>
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCmd('formatBlock', 'blockquote')}
              className="p-1 hover:text-slate-900 transition-colors cursor-pointer"
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

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCmd('hiliteColor', '#fef08a')}
              className="p-1 hover:text-slate-900 transition-colors cursor-pointer"
              title="Highlight"
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

          <div className="flex items-center text-slate-600">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execCmd('strikeThrough')}
              className="px-1 text-sm font-serif line-through hover:text-slate-900 transition-colors font-medium select-none cursor-pointer"
              title="Strikethrough"
            >
              S
            </button>
          </div>
        </div>

        <div className="relative flex-1 flex flex-col min-h-[220px]">
          {(!body || body === '<br>' || body.trim() === '') && (
            <div className="absolute top-2 left-2 text-sm text-slate-400 pointer-events-none select-none">
              Write your email body here...
            </div>
          )}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={() => {
              if (editorRef.current) {
                onBodyChange(editorRef.current.innerHTML);
              }
            }}
            className="flex-1 w-full p-2 border-none resize-none focus:outline-none text-sm text-slate-800 leading-relaxed font-normal min-h-[200px] bg-transparent overflow-y-auto"
          />
        </div>

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
                      onClick={() => onRemoveAttachment(att.id)}
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
                    onClick={() => onRemoveAttachment(att.id)}
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
    </>
  );
};
