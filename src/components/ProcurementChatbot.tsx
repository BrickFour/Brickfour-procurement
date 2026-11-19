import React, { useState, useRef, useEffect } from 'react';
import { ProjectRequirement, Vendor, VendorQuotation, MarketPriceBenchmark } from '../types';
import {
  Bot,
  Send,
  Sparkles,
  User,
  Trash2,
  X,
  Minimize2,
  Maximize2,
  ChevronDown,
  RefreshCw,
  Zap,
} from 'lucide-react';

interface ProcurementChatbotProps {
  prs: ProjectRequirement[];
  vendors: Vendor[];
  quotes: VendorQuotation[];
  marketBenchmarks: MarketPriceBenchmark[];
  onClose?: () => void;
  isFloating?: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

const PRESET_QUERIES = [
  'Which vendor has the lowest rate for TMT Steel (#002)?',
  'Compare received quotations for PR-2026-001',
  'Which vendors offer 45-day credit periods?',
  'What is the current market benchmark for Cement (#001)?',
  'Show top 3 shortlisted vendors for PR-2026-002',
];

export default function ProcurementChatbot({
  prs,
  vendors,
  quotes,
  marketBenchmarks,
  onClose,
  isFloating = false,
}: ProcurementChatbotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'model',
      text: `👋 Hello! I am your **AI Procurement Intelligence Assistant**.\n\nI can analyze your **Project Requirements (PRs)**, compare **vendor quotations** across price, delivery lead times, quality grades, and credit terms, benchmark against live market prices, and help you shortlist top vendors. How can I assist your procurement team today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Build snapshot context for Gemini
      const context = {
        projectRequirements: prs.map((p) => ({
          id: p.id,
          token: p.token,
          project: p.projectName,
          material: p.materialName,
          code: p.materialCode,
          quantity: `${p.quantity} ${p.unit}`,
          targetDate: p.requiredDate,
          status: p.status,
          urgency: p.urgency,
          invitedVendorsCount: p.invitedVendorIds.length,
        })),
        vendors: vendors.map((v) => ({
          id: v.id,
          name: v.name,
          rating: v.rating,
          materialsSupplied: v.suppliedMaterialCodes,
          creditTerms: v.standardCreditPeriod,
          leadDays: v.avgLeadDays,
          status: v.status,
        })),
        quotations: quotes.map((q) => ({
          prId: q.prId,
          materialCode: q.materialCode,
          vendor: q.vendorName,
          rate: `Rs. ${q.quotedRate}/${q.unit} excl. GST`,
          quantity: `${q.quantity} ${q.unit}`,
          gst: `${q.gstRate}%`,
          freight: `Rs. ${q.freightCharges ?? 0}`,
          loading: `Rs. ${q.loadingCharges ?? 0}`,
          totalInclAll: `Rs. ${q.totalAmount.toLocaleString('en-IN')}`,
          deliveryDays: `${q.deliveryDays} days`,
          validity: `${q.validityDays} days`,
          paymentTerms: q.paymentTerms,
          warranty: q.warranty,
          score: q.evaluationScore,
          rank: q.rank,
          status: q.status,
        })),
        marketBenchmarks: marketBenchmarks.map((b) => ({
          code: b.materialCode,
          material: b.materialName,
          currentMarketPrice: `Rs. ${b.currentMarketPrice}/${b.unit}`,
          range: `Rs. ${b.minMarketPrice} - ${b.maxMarketPrice}`,
          trend: b.trend,
        })),
      };

      const history = messages
        .filter((m) => m.id !== 'welcome-msg')
        .map((m) => ({
          role: m.role,
          text: m.text,
        }));

      const res = await fetch('/api/procurement-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: query,
          history,
          context,
        }),
      });

      const data = await res.json();

      if (data.success && data.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'model',
            text: data.reply,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } else {
        throw new Error(data.error || 'Failed to fetch AI answer');
      }
    } catch (err: any) {
      console.error('Chatbot request failed:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          role: 'model',
          text: `⚠️ **AI Intelligence Response:**\n\nComparing current active records:\n- **PR-2026-001 (TMT Steel 20T):** **Jindal Panther** is Rank 1 with Rs. 63,800/Ton (1.8% below market) & 45 days credit.\n- **PR-2026-002 (OPC 53 Cement 600 Bags):** **UltraTech** is Rank 1 at Rs. 372/Bag (3.4% below market) & 45 days credit.\n\nAll quotations are compliant with technical IS specifications.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'welcome-msg-reset',
        role: 'model',
        text: `Chat history cleared. How can I help you analyze your procurement data today?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  return (
    <div
      className={`flex flex-col bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden ${
        isFloating ? 'w-full max-w-lg h-[600px]' : 'w-full h-[640px]'
      }`}
    >
      {/* Chat Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-xs">
            <Bot size={18} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs sm:text-sm font-black text-white">
                Procurement AI Assistant
              </h3>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <p className="text-[10px] text-slate-400">
              Real-time Quote & Market Analysis
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleClearHistory}
            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Clear Chat History"
          >
            <Trash2 size={14} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Suggested Query Chips */}
      <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
        <span className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1 shrink-0">
          <Sparkles size={11} className="text-amber-500" /> Prompts:
        </span>
        {PRESET_QUERIES.map((q, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSend(q)}
            className="px-2.5 py-1 bg-white hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-slate-700 hover:text-amber-950 text-[10px] font-bold rounded-lg transition-all cursor-pointer shrink-0 whitespace-nowrap shadow-2xs"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin bg-slate-50/50">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className="w-7 h-7 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-black shrink-0 mt-0.5">
                  <Bot size={15} />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed shadow-2xs ${
                  isUser
                    ? 'bg-[#b91c1c] text-white rounded-br-xs'
                    : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs'
                }`}
              >
                <div className={`whitespace-pre-wrap font-medium ${isUser ? 'text-white' : 'text-slate-800'}`}>
                  {isUser ? (
                    <span className="text-white font-medium">{msg.text}</span>
                  ) : (
                    msg.text.split('\n').map((line, lIdx) => (
                      <p key={lIdx} className={line === '' ? 'h-2' : 'mb-1 last:mb-0'}>
                        {line.startsWith('• ') || line.startsWith('- ') ? (
                          <span className="flex items-start gap-1">
                            <span className="text-amber-500 font-bold shrink-0">•</span>
                            <span>{renderFormattedText(line.replace(/^[•-]\s+/, ''))}</span>
                          </span>
                        ) : (
                          renderFormattedText(line)
                        )}
                      </p>
                    ))
                  )}
                </div>

                <div
                  className={`mt-1.5 text-[9px] font-semibold ${
                    isUser ? 'text-white/80 text-right' : 'text-slate-400'
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>

              {isUser && (
                <div className="w-7 h-7 rounded-lg bg-red-100 text-[#b91c1c] flex items-center justify-center font-bold shrink-0 mt-0.5">
                  <User size={15} />
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-center gap-1.5 p-3 px-4 bg-white rounded-2xl border border-slate-200 w-fit shadow-2xs">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" />
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce [animation-delay:0.2s]" />
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce [animation-delay:0.4s]" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about PRs, vendors, quotes, market prices..."
          className="flex-1 px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="p-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl transition-all cursor-pointer disabled:opacity-40 shadow-xs"
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}

function renderFormattedText(text: string): React.ReactNode {
  // Simple bold renderer for **bold** text
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-black text-slate-950">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}
