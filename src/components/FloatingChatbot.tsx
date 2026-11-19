import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bot,
  Send,
  X,
  Maximize2,
  Minimize2,
  Trash2,
  User,
  Copy,
  Check,
  Building2,
  AlertTriangle,
  Receipt,
  Truck,
  ChevronDown,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import {
  Project,
  Material,
  InventoryTransaction,
  ContractorRecord,
  InternalTransferRecord,
  SiteQuery,
  Vendor,
  VendorQuotation,
  MarketPriceBenchmark,
  ProjectRequirement,
  User as AppUser,
} from '../types';

interface FloatingChatbotProps {
  projects: Project[];
  materials: Material[];
  transactions: InventoryTransaction[];
  contractors: ContractorRecord[];
  transfers: InternalTransferRecord[];
  queries: SiteQuery[];
  vendors: Vendor[];
  quotes: VendorQuotation[];
  marketBenchmarks: MarketPriceBenchmark[];
  prs: ProjectRequirement[];
  currentUser: AppUser;
  selectedProjectId: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

export default function FloatingChatbot({
  projects,
  materials,
  transactions,
  contractors,
  transfers,
  queries,
  vendors,
  quotes,
  marketBenchmarks,
  prs,
  currentUser,
  selectedProjectId,
}: FloatingChatbotProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const initialGreeting: ChatMessage = {
    id: 'welcome-msg',
    role: 'model',
    text: `👋 **Welcome to Pravah AI Assistant!**\n\nI have real-time visibility into all internal application data across **${projects.length} Projects**, **${materials.length} Materials**, contractor billings, daily stock ledgers, internal transfers, and vendor quotations.\n\nAsk me any question related to this application's internal data, calculations, or operational analysis!`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };

  const [messages, setMessages] = useState<ChatMessage[]>([initialGreeting]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isLoading, isOpen]);

  // Context builder for Gemini API
  const buildApplicationContext = () => {
    // Low stock materials
    const lowStockItems = materials
      .filter((m) => m.currentStock <= m.minThreshold)
      .map((m) => ({
        name: m.name,
        code: m.materialCode || 'N/A',
        stock: `${m.currentStock} ${m.unit}`,
        minThreshold: `${m.minThreshold} ${m.unit}`,
        unitCost: `₹${m.unitCost}`,
        status: m.currentStock === 0 ? 'Out of Stock' : 'Low Stock Alert',
      }));

    // Project summary with computed material valuation
    const projectsSummary = projects.map((p) => {
      const projMaterials = materials.filter((m) => m.projectId === p.id);
      const projMaterialValuation = projMaterials.reduce(
        (sum, m) => sum + (m.totalPrice || m.currentStock * m.unitCost),
        0
      );
      return {
        id: p.id,
        name: p.name,
        location: p.location,
        status: p.status,
        manager: p.manager,
        startDate: p.startDate,
        materialCount: projMaterials.length,
        totalInventoryValue: `₹${projMaterialValuation.toLocaleString('en-IN')}`,
      };
    });

    // Contractors liability & billing
    const contractorSummary = contractors.map((c) => ({
      firmName: c.firmName,
      category: c.category,
      project: c.projectName,
      pastBilling: `₹${c.pastBilling.toLocaleString('en-IN')}`,
      currentBilling: `₹${c.currentBilling.toLocaleString('en-IN')}`,
      totalEstimatedBilling: `₹${c.totalEstimatedBilling.toLocaleString('en-IN')}`,
      billingStatus: c.currentBillingStatus,
      billsCount: c.pastBills.length,
    }));

    // Internal transfers
    const transferSummary = transfers.map((t) => ({
      id: t.id,
      fromProject: t.outwardProjectName,
      toProject: t.inwardProjectName,
      material: t.materialName,
      quantity: `${t.quantity} ${t.unit}`,
      amount: `₹${t.amount.toLocaleString('en-IN')}`,
      status: t.status,
      vehicle: t.vehicleNumber || 'N/A',
      driver: t.driverName || 'N/A',
      transferDate: t.transferDate,
      notes: t.notes || 'N/A',
    }));

    // Recent stock transactions (last 15)
    const recentTx = transactions.slice(0, 15).map((t) => ({
      type: t.type,
      materialId: t.materialId,
      quantity: t.quantity,
      rate: t.rate ? `₹${t.rate}` : undefined,
      totalPrice: t.totalPrice ? `₹${t.totalPrice.toLocaleString('en-IN')}` : undefined,
      date: t.date,
      billType: t.billType,
      billNumber: t.billNumber,
      operator: t.operator,
      notes: t.notes,
    }));

    // Queries
    const querySummary = queries.map((q) => ({
      id: q.id,
      subject: q.subject,
      project: q.projectName,
      urgency: q.urgency,
      category: q.category,
      status: q.status,
      raisedBy: q.raisedByName,
      responsesCount: q.responses.length,
    }));

    // Vendor quotations & PRs
    const prSummary = prs.map((pr) => ({
      id: pr.id,
      token: pr.token,
      material: pr.materialName,
      code: pr.materialCode,
      quantity: `${pr.quantity} ${pr.unit}`,
      status: pr.status,
      project: pr.projectName,
      targetRate: pr.targetBudgetRate ? `₹${pr.targetBudgetRate}` : undefined,
    }));

    const quoteSummary = quotes.map((q) => ({
      prId: q.prId,
      materialCode: q.materialCode,
      vendor: q.vendorName,
      rate: `₹${q.quotedRate}/${q.unit}`,
      quantity: `${q.quantity} ${q.unit}`,
      gst: `${q.gstRate}%`,
      totalInclAll: `₹${q.totalAmount.toLocaleString('en-IN')}`,
      leadDays: `${q.deliveryDays} days`,
      paymentTerms: q.paymentTerms,
      warranty: q.warranty,
      rank: q.rank,
      status: q.status,
    }));

    return {
      currentUser: {
        name: currentUser.name,
        role: currentUser.role,
      },
      selectedProject:
        selectedProjectId === 'all'
          ? 'All Projects (Overview)'
          : projects.find((p) => p.id === selectedProjectId)?.name || selectedProjectId,
      counts: {
        totalProjects: projects.length,
        totalMaterials: materials.length,
        totalTransactions: transactions.length,
        totalContractors: contractors.length,
        totalTransfers: transfers.length,
        totalOpenQueries: queries.filter((q) => q.status !== 'Resolved').length,
        totalActivePRs: prs.filter((p) => p.status !== 'Awarded' && p.status !== 'Closed').length,
      },
      lowStockItems,
      projectsSummary,
      contractorSummary,
      transferSummary,
      recentTx,
      querySummary,
      prSummary,
      quoteSummary,
      marketBenchmarks: marketBenchmarks.map((b) => ({
        code: b.materialCode,
        material: b.materialName,
        currentMarketRate: `₹${b.currentMarketPrice}/${b.unit}`,
        range: `₹${b.minMarketPrice} - ₹${b.maxMarketPrice}`,
        trend: b.trend,
      })),
    };
  };

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const context = buildApplicationContext();
      const history = messages
        .filter((m) => !m.id.startsWith('welcome-') && !m.id.startsWith('ai-err-') && !m.text.includes('Offline Fallback'))
        .map((m) => ({
          role: m.role,
          text: m.text,
        }));

      const res = await fetch('/api/app-assistant', {
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
        throw new Error(data.error || 'Failed to get answer');
      }
    } catch (err) {
      console.error('FloatingChatbot error:', err);
      // Fallback
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          role: 'model',
          text: `📊 **Live Internal Analysis:**\n\n• **Active Projects:** ${projects.length} sites active.\n• **Catalog Size:** ${materials.length} resources tracked.\n• **Stock Health:** ${materials.filter((m) => m.currentStock <= m.minThreshold).length} items are below or near minimum threshold.\n• **Transfers:** ${transfers.length} inter-site transfers registered.\n\n*(Please ensure server connection is steady)*`,
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
        id: 'welcome-msg',
        role: 'model',
        text: `Chat history cleared. What application data or analysis would you like to review?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper to format text with markdown bolding, lists, and headers
  const renderFormattedMarkdown = (content: string) => {
    // If exact out-of-context response
    if (content.trim().toLowerCase() === 'please ask the questions only related to this application') {
      return (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <span>please ask the questions only related to this application</span>
        </div>
      );
    }

    const lines = content.split('\n');
    return lines.map((line, idx) => {
      if (line.trim() === '') {
        return <div key={idx} className="h-1.5" />;
      }

      // Headers (### or ## or #)
      if (line.startsWith('### ')) {
        return (
          <h4 key={idx} className="font-extrabold text-slate-900 text-xs mt-2 mb-1">
            {line.replace('### ', '')}
          </h4>
        );
      }
      if (line.startsWith('## ') || line.startsWith('# ')) {
        return (
          <h3 key={idx} className="font-black text-slate-900 text-sm mt-2.5 mb-1 text-amber-950">
            {line.replace(/^#+\s*/, '')}
          </h3>
        );
      }

      // Bullet points
      const isBullet = line.startsWith('• ') || line.startsWith('- ') || line.startsWith('* ');
      const cleanLine = isBullet ? line.replace(/^[•\-\*]\s+/, '') : line;

      // Parse bold segments
      const parts = cleanLine.split(/(\*\*.*?\*\*)/g);
      const renderedLine = parts.map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={pIdx} className="font-bold text-slate-950 dark:text-slate-900">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });

      if (isBullet) {
        return (
          <div key={idx} className="flex items-start gap-1.5 mb-1 last:mb-0">
            <span className="text-amber-500 font-bold shrink-0 mt-0.5">•</span>
            <div className="text-slate-800">{renderedLine}</div>
          </div>
        );
      }

      return (
        <p key={idx} className="mb-1 last:mb-0 text-slate-800">
          {renderedLine}
        </p>
      );
    });
  };

  return (
    <>
      {/* Floating Launcher Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            key="floating-launcher-btn"
            initial={{ scale: 0, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <button
              onClick={() => setIsOpen(true)}
              className="relative flex items-center justify-center w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 shadow-2xl border-2 border-amber-300/50 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
              title="Open AI Assistant"
              aria-label="Open AI Assistant"
            >
              <Bot size={26} strokeWidth={2.2} className="text-slate-950" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Chatbot Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="floating-chat-window"
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className={`fixed bottom-6 right-6 z-50 flex flex-col bg-white rounded-3xl border border-slate-300 shadow-2xl overflow-hidden transition-all duration-200 ${
              isExpanded
                ? 'w-[calc(100vw-32px)] sm:w-[680px] h-[calc(100vh-60px)] sm:h-[720px] max-w-4xl'
                : 'w-[calc(100vw-32px)] sm:w-[440px] h-[580px] max-h-[85vh]'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-xs">
                  <Bot size={18} />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-white">
                    Pravah AI Assistant
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Application Internal Analysis & Real-time Q&A
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  title="Clear Conversation"
                >
                  <Trash2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer hidden sm:block"
                  title={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  title="Close Assistant"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin bg-slate-50/40">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <div className="w-7 h-7 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shrink-0 mt-0.5 shadow-2xs">
                        <Bot size={15} />
                      </div>
                    )}

                    <div
                      className={`relative group max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed shadow-2xs ${
                        isUser
                          ? 'bg-[#b91c1c] text-white rounded-br-xs'
                          : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs'
                      }`}
                    >
                      <div className="whitespace-pre-wrap font-medium">
                        {isUser ? (
                          <span className="text-white font-medium">{msg.text}</span>
                        ) : (
                          renderFormattedMarkdown(msg.text)
                        )}
                      </div>

                      <div className={`flex items-center justify-between mt-2 pt-1 border-t text-[9px] ${
                        isUser ? 'border-white/20 text-white/80' : 'border-slate-100 text-slate-400'
                      }`}>
                        <span>
                          {msg.timestamp}
                        </span>

                        {!isUser && (
                          <button
                            type="button"
                            onClick={() => handleCopyText(msg.id, msg.text)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
                            title="Copy response"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check size={11} className="text-emerald-500" />
                                <span className="text-emerald-600 font-bold">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy size={11} />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {isUser && (
                      <div className="w-7 h-7 rounded-xl bg-red-100 text-[#b91c1c] flex items-center justify-center font-bold shrink-0 mt-0.5">
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

            {/* Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about materials, budgets, bills, contractors..."
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-50 focus:bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 transition-all placeholder:text-slate-400"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="p-2.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs shrink-0"
                title="Send query"
              >
                <Send size={15} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
