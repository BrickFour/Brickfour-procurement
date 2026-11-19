import { Mail, CheckCircle2, Copy, ExternalLink, X, Send } from 'lucide-react';
import { QueryEmailLog } from '../types';
import { useState } from 'react';

interface DispatchedEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  emailData: QueryEmailLog | null;
}

export default function DispatchedEmailModal({
  isOpen,
  onClose,
  emailData,
}: DispatchedEmailModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !emailData) return null;

  const mailtoUrl = `mailto:${emailData.toEmail}?subject=${encodeURIComponent(
    emailData.subject
  )}&body=${encodeURIComponent(emailData.body)}`;

  const handleCopy = () => {
    const fullText = `To: ${emailData.toEmail}\nSubject: ${emailData.subject}\n\n${emailData.body}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4" id="dispatched-email-modal">
      <div className="bg-slate-900 w-full max-w-lg rounded-3xl border border-slate-700 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Top Header */}
        <div className="bg-gradient-to-r from-emerald-900/80 to-slate-900 p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-2xl shadow-xs">
              <Mail size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                  <CheckCircle2 size={12} /> Email Dispatched
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded-md">
                  {emailData.type}
                </span>
              </div>
              <h3 className="text-sm font-extrabold text-white mt-0.5">Automated Query Email Notification</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Email Metadata Card */}
        <div className="p-5 space-y-4 text-xs">
          <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <span className="text-slate-400 font-semibold">Recipient (To):</span>
              <span className="text-emerald-400 font-extrabold text-sm underline">{emailData.toEmail}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <span className="text-slate-400 font-semibold">Sender (From):</span>
              <span className="text-white font-bold">{emailData.fromName} ({emailData.fromRole})</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <span className="text-slate-400 font-semibold">Subject Line:</span>
              <span className="text-amber-300 font-extrabold truncate max-w-[260px]">{emailData.subject}</span>
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-slate-500 font-medium">Dispatched Time:</span>
              <span className="text-slate-400 font-mono">{emailData.sentAt}</span>
            </div>
          </div>

          {/* Email Body Content */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Email Body Content:
            </label>
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 font-mono text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
              {emailData.body}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <a
              href={mailtoUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs text-xs"
            >
              <Send size={14} /> Open in Email App (mailto:)
            </a>
            <button
              type="button"
              onClick={handleCopy}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-xs"
            >
              {copied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {copied ? 'Copied to Clipboard' : 'Copy Email Body'}
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between">
          <span>⚡ BuilderStore Automated Query Notification Service</span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white font-bold cursor-pointer underline"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
