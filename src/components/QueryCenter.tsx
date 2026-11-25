import { useState, useEffect } from 'react';
import { SiteQuery, User } from '../types';
import {
  MessageSquare,
  Clock,
  CheckCircle2,
  Send,
  Plus,
  ShieldCheck,
  Building2,
  Search,
  ChevronDown,
  ChevronUp,
  Camera,
  ExternalLink,
  X,
  AlertOctagon,
  AlertTriangle,
  Minus,
  ArrowDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

/*
 * Priority and status use two separate colour families so they are never confused:
 *  - Priority (urgency): a severity scale, red -> orange -> amber -> blue, each with its own icon,
 *    plus a matching stripe on the left edge of the ticket so priority can be scanned down the list.
 *  - Status: a dot (or a tick when resolved) with blue = Open, violet = In Progress, green = Resolved.
 * Colour is never the only cue: every badge also has a text label and an icon / dot.
 */
type Urgency = SiteQuery['urgency'];
const URGENCY_STYLE: Record<string, { label: string; hint: string; badge: string; accent: string; dot: string; icon: typeof AlertOctagon; rank: number }> = {
  Urgent: { label: 'Urgent', hint: 'Work stopped', badge: 'bg-rose-600 text-white border-rose-600', accent: 'border-l-rose-600', dot: 'bg-rose-600', icon: AlertOctagon, rank: 0 },
  High: { label: 'High priority', hint: 'Work may stop soon', badge: 'bg-orange-50 text-orange-800 border-orange-300', accent: 'border-l-orange-500', dot: 'bg-orange-500', icon: AlertTriangle, rank: 1 },
  Medium: { label: 'Medium priority', hint: 'Normal attention', badge: 'bg-amber-50 text-amber-800 border-amber-300', accent: 'border-l-amber-400', dot: 'bg-amber-400', icon: Minus, rank: 2 },
  Low: { label: 'Low priority', hint: 'For information', badge: 'bg-sky-50 text-sky-800 border-sky-200', accent: 'border-l-sky-400', dot: 'bg-sky-400', icon: ArrowDown, rank: 3 },
};
const urgencyStyle = (u: Urgency | string) => URGENCY_STYLE[u] || URGENCY_STYLE.Low;
const STATUS_STYLE: Record<SiteQuery['status'], { badge: string; dot: string }> = {
  Open: { badge: 'bg-blue-50 text-blue-800 border-blue-200', dot: 'bg-blue-600' },
  'In Progress': { badge: 'bg-violet-50 text-violet-800 border-violet-200', dot: 'bg-violet-500' },
  Resolved: { badge: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
};

interface QueryCenterProps {
  queries: SiteQuery[];
  currentUser: User;
  onOpenRaiseQueryModal: () => void;
  onAddResponse: (queryId: string, message: string) => void;
  onUpdateStatus: (queryId: string, status: SiteQuery['status']) => void;
  /** Opens a specific ticket (e.g. from a notification) */
  focusRequest?: { queryId: string; nonce: number } | null;
}

export default function QueryCenter({
  queries,
  currentUser,
  onOpenRaiseQueryModal,
  onAddResponse,
  onUpdateStatus,
  focusRequest,
}: QueryCenterProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Open' | 'In Progress' | 'Resolved'>('All');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('All');
  const [expandedQueryId, setExpandedQueryId] = useState<string | null>(queries[0]?.id || null);
  const [replyInput, setReplyInput] = useState<Record<string, string>>({});
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  // Jump to the ticket a notification points to
  useEffect(() => {
    if (!focusRequest) return;
    setSearchQuery('');
    setStatusFilter('All');
    setUrgencyFilter('All');
    setExpandedQueryId(focusRequest.queryId);
    const t = setTimeout(() => {
      document.getElementById(`query-card-${focusRequest.queryId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
    return () => clearTimeout(t);
  }, [focusRequest?.nonce]);

  const isAdmin = currentUser.role === 'admin';

  // Filter queries based on search, status, and urgency
  const filteredQueries = queries.filter((q) => {
    const matchesSearch =
      q.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.raisedByName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (q.materialName && q.materialName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'All' || q.status === statusFilter;
    const matchesUrgency = urgencyFilter === 'All' || q.urgency === urgencyFilter;

    return matchesSearch && matchesStatus && matchesUrgency;
  })
    // Most pressing first: unresolved before resolved, then by priority (Urgent -> Low); otherwise newest order is kept
    .map((q, i) => ({ q, i }))
    .sort(
      (a, b) =>
        Number(a.q.status === 'Resolved') - Number(b.q.status === 'Resolved') ||
        urgencyStyle(a.q.urgency).rank - urgencyStyle(b.q.urgency).rank ||
        a.i - b.i
    )
    .map(({ q }) => q);

  // Unresolved tickets per priority (for the priority filter)
  const unresolvedByUrgency = (u: string) => queries.filter((q) => q.urgency === u && q.status !== 'Resolved').length;

  const openCount = queries.filter((q) => q.status === 'Open').length;
  const inProgressCount = queries.filter((q) => q.status === 'In Progress').length;
  const resolvedCount = queries.filter((q) => q.status === 'Resolved').length;

  const handleSendReply = (queryId: string) => {
    const text = replyInput[queryId]?.trim();
    if (!text) return;

    onAddResponse(queryId, text);
    setReplyInput((prev) => ({ ...prev, [queryId]: '' }));
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200" id="query-center-container">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#23408e] text-white flex items-center justify-center shrink-0">
            <MessageSquare size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {isAdmin ? 'Admin Helpdesk & Operations Dispatch' : 'Site Queries & Support Portal'}
            </h1>
            <p className="text-xs text-slate-500">
              {isAdmin
                ? 'Review, resolve, and reply to site tickets raised by Site Managers.'
                : 'Raise issues about material delays, stock shortages, quality or site queries to Admin.'}
            </p>
          </div>
        </div>
        <button
          id="btn-raise-new-query"
          onClick={onOpenRaiseQueryModal}
          className="px-4 py-2.5 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
        >
          <Plus size={16} />
          Raise Query / Issue
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Tickets', value: queries.length, hint: 'All site queries', cls: 'text-slate-900' },
          { label: 'Pending Open', value: openCount, hint: 'Awaiting a response', cls: openCount ? 'text-blue-700' : 'text-slate-900' },
          { label: 'In Progress', value: inProgressCount, hint: 'Being worked on', cls: 'text-violet-700' },
          { label: 'Resolved', value: resolvedCount, hint: 'Closed tickets', cls: 'text-emerald-700' },
        ].map((k) => (
          <div key={k.label} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{k.label}</span>
            <p className={`text-2xl font-bold mt-1 ${k.cls}`}>{k.value}</p>
            <span className="text-[11px] text-slate-500">{k.hint}</span>
          </div>
        ))}
      </div>

      {/* Status tabs */}
      <div className="nav-tabs flex items-center gap-1 border-b border-slate-200 overflow-x-auto overflow-y-hidden" role="tablist">
        {(['All', 'Open', 'In Progress', 'Resolved'] as const).map((st) => {
          const n = st === 'All' ? queries.length : st === 'Open' ? openCount : st === 'In Progress' ? inProgressCount : resolvedCount;
          return (
            <button
              key={st}
              id={`filter-status-${st.toLowerCase().replace(/\s+/g, '-')}`}
              role="tab"
              aria-selected={statusFilter === st}
              onClick={() => setStatusFilter(st)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px cursor-pointer whitespace-nowrap ${
                statusFilter === st ? 'border-[#23408e] text-[#23408e]' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {st === 'All' ? 'All Tickets' : st} ({n})
            </button>
          );
        })}
      </div>

      {/* Search & priority */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            id="query-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search queries by title, manager, project, or material"
            aria-label="Search queries"
            className="flex-1 min-w-0 text-sm py-1 focus:outline-hidden"
          />
        </div>
        {/* Priority filter: colour-coded chips that double as the priority legend */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by priority">
          <span className="text-xs font-semibold text-slate-500 mr-1">Priority</span>
          {(['All', 'Urgent', 'High', 'Medium', 'Low'] as const).map((u) => {
            const active = urgencyFilter === u;
            const st = u === 'All' ? null : urgencyStyle(u);
            const n = u === 'All' ? null : unresolvedByUrgency(u);
            return (
              <button
                key={u}
                id={`filter-urgency-${u.toLowerCase()}`}
                type="button"
                aria-pressed={active}
                title={st ? `${st.label}: ${st.hint}` : 'Show all priorities'}
                onClick={() => setUrgencyFilter(u)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold cursor-pointer transition-colors ${
                  active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                }`}
              >
                {st && <span className={`w-2 h-2 rounded-full ${st.dot}`} aria-hidden="true" />}
                {u === 'All' ? 'All' : u}
                {n ? <span className={active ? 'text-white/80' : 'text-slate-400'}>{n}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Queries Feed */}
      <div className="space-y-4">
        {filteredQueries.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-10 text-center text-slate-500">
            <MessageSquare size={36} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-800">No matching tickets found</p>
            <p className="text-xs text-slate-500 mt-1">Try adjusting your filters or click "Raise Query / Issue" to start a query thread.</p>
          </div>
        ) : (
          filteredQueries.map((query) => {
            const isExpanded = expandedQueryId === query.id;

            const urg = urgencyStyle(query.urgency);
            const UrgIcon = urg.icon;
            const stat = STATUS_STYLE[query.status] || STATUS_STYLE.Open;
            const resolved = query.status === 'Resolved';

            return (
              <div
                key={query.id}
                id={`query-card-${query.id}`}
                className={`bg-white rounded-xl border border-slate-200 border-l-4 ${resolved ? 'border-l-emerald-400' : urg.accent} shadow-sm overflow-hidden transition-colors hover:border-[#c9d6f2]`}
              >
                {/* Header Strip */}
                <div
                  onClick={() => setExpandedQueryId(isExpanded ? null : query.id)}
                  className="p-5 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-[#f5f8fd] transition-colors"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${urg.badge} ${resolved ? 'opacity-70' : ''}`} title={urg.hint}>
                        <UrgIcon size={12} aria-hidden="true" />
                        {urg.label}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${stat.badge}`}>
                        {resolved ? (
                          <CheckCircle2 size={12} aria-hidden="true" />
                        ) : (
                          <span className={`w-1.5 h-1.5 rounded-full ${stat.dot}`} aria-hidden="true" />
                        )}
                        {query.status}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-slate-100 text-slate-700 border-slate-200">
                        <Building2 size={11} /> {query.projectName}
                      </span>
                      {query.materialName && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-slate-50 text-slate-700 border-slate-200">
                          Material: {query.materialName}
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-semibold text-slate-900 pt-1">{query.subject}</h3>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-medium">
                      <span>Raised by: <strong className="text-slate-800 font-bold">{query.raisedByName}</strong></span>
                      <span>•</span>
                      <span className="flex items-center gap-1"><Clock size={12} /> {query.createdAt}</span>
                      <span>•</span>
                      <span className="text-slate-600 font-bold">{query.responses.length} Replies</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end md:self-center">
                    {/* Status Changer for Admin */}
                    {isAdmin && (
                      <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status:</span>
                        <select
                          id={`change-status-${query.id}`}
                          value={query.status}
                          onChange={(e) => onUpdateStatus(query.id, e.target.value as SiteQuery['status'])}
                          className="bg-slate-100 border border-slate-300 text-slate-950 text-xs font-bold rounded-lg px-2 py-1 cursor-pointer focus:outline-hidden focus:border-[#23408e]"
                        >
                          <option value="Open">Open</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Resolved">Resolved</option>
                        </select>
                      </div>
                    )}

                    <button
                      id={`toggle-expand-${query.id}`}
                      type="button"
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
                    >
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Thread Body */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-t border-slate-100 bg-slate-50/50 p-5 space-y-4"
                    >
                      {/* Original Query Description Box */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200">
                        <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                          Issue Description from Site
                        </p>
                        <p className="text-xs text-slate-800 font-medium leading-relaxed whitespace-pre-wrap">
                          {query.description}
                        </p>
                      </div>

                      {/* Photo Proof Evidence Section */}
                      {query.photoProofUrl && (
                        <div className="bg-white p-4 rounded-xl border border-amber-200/80 shadow-2xs space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                              <Camera size={14} className="text-amber-600" /> Attached Photo Proof Evidence *
                            </p>
                            <a
                              href={query.photoProofUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-bold text-amber-700 hover:text-amber-900 hover:underline flex items-center gap-1"
                            >
                              View Full Size <ExternalLink size={11} />
                            </a>
                          </div>

                          <div className="relative inline-block overflow-hidden rounded-xl border border-slate-200 group max-w-sm">
                            <img
                              src={query.photoProofUrl}
                              alt={`Photo proof evidence for ${query.subject}`}
                              onClick={() => setPreviewPhotoUrl(query.photoProofUrl || null)}
                              className="w-full max-h-56 object-cover rounded-xl transition-transform duration-200 group-hover:scale-105 cursor-pointer"
                            />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                              <span className="bg-white/90 text-slate-900 text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs flex items-center gap-1">
                                Click to enlarge
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Reply Thread */}
                      {query.responses.length > 0 && (
                        <div className="space-y-2 pt-2">
                          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Discussion & Dispatch Thread ({query.responses.length})
                          </h4>

                          {query.responses.map((resp) => {
                            const isRespAdmin = resp.authorRole === 'admin';
                            return (
                              <div key={resp.id} className={`flex ${isRespAdmin ? 'justify-end' : 'justify-start'}`}>
                                <div
                                  className={`w-fit max-w-[85%] sm:max-w-[70%] px-3 py-2 rounded-lg border text-sm leading-snug ${
                                    isRespAdmin
                                      ? 'bg-[#f5f8fd] border-[#d9e3f5] rounded-tr-sm'
                                      : 'bg-white border-slate-200 rounded-tl-sm'
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs mb-1">
                                    {isRespAdmin ? (
                                      <ShieldCheck size={13} className="text-[#23408e]" />
                                    ) : (
                                      <Building2 size={13} className="text-emerald-600" />
                                    )}
                                    <span className="font-semibold text-slate-900">{resp.authorName}</span>
                                    <span
                                      className={`text-[10px] px-1.5 py-px rounded-full font-semibold ${
                                        isRespAdmin
                                          ? 'bg-[#eaf0fb] text-[#23408e]'
                                          : 'bg-emerald-50 text-emerald-800'
                                      }`}
                                    >
                                      {resp.authorRole === 'admin' ? 'Central Admin' : 'Site Manager'}
                                    </span>
                                    <span className="text-[10px] text-slate-400">• {resp.createdAt}</span>
                                  </div>
                                  <p className="text-slate-800 whitespace-pre-wrap">{resp.message}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="pt-2">
                        <div className="flex gap-2">
                          <input
                            id={`reply-input-${query.id}`}
                            type="text"
                            value={replyInput[query.id] || ''}
                            onChange={(e) =>
                              setReplyInput((prev) => ({ ...prev, [query.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSendReply(query.id);
                            }}
                            placeholder={
                              isAdmin
                                ? 'Type response as Admin (e.g. Supplier dispatched, approved purchase order)...'
                                : 'Type follow-up update for Admin...'
                            }
                            aria-label="Reply message"
                            className="flex-1 min-w-0 h-10 bg-white border border-slate-300 text-sm rounded-lg px-3 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20"
                          />
                          <button
                            id={`btn-send-reply-${query.id}`}
                            type="button"
                            onClick={() => handleSendReply(query.id)}
                            className="h-10 bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold px-4 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 shrink-0"
                          >
                            <Send size={13} /> Reply
                          </button>
                        </div>
                      </div>

                      {/* Admin Quick Resolve Action Button */}
                      {isAdmin && query.status !== 'Resolved' && (
                        <div className="pt-2 flex justify-end">
                          <button
                            id={`btn-resolve-query-${query.id}`}
                            onClick={() => onUpdateStatus(query.id, 'Resolved')}
                            className="text-xs font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                          >
                            <CheckCircle2 size={14} /> Mark Ticket as Resolved
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>

      {/* Lightbox Photo Preview Modal */}
      <AnimatePresence>
        {previewPhotoUrl && (
          <div
            id="photo-lightbox-backdrop"
            onClick={() => setPreviewPhotoUrl(null)}
            className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 cursor-pointer"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-4xl w-full bg-slate-900 rounded-2xl overflow-hidden p-2 shadow-2xl border border-slate-700"
            >
              <div className="flex items-center justify-between p-3 border-b border-slate-800 text-white">
                <p className="text-xs font-bold flex items-center gap-1.5">
                  <Camera size={15} className="text-amber-400" /> Site Photo Proof Evidence
                </p>
                <button
                  id="close-photo-lightbox"
                  onClick={() => setPreviewPhotoUrl(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-2 flex items-center justify-center bg-black/50">
                <img
                  src={previewPhotoUrl}
                  alt="Full size site photo proof"
                  className="max-h-[80vh] w-auto object-contain rounded-lg"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
