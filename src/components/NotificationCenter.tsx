import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellRing, CheckCheck, FileText, Truck, AlertTriangle, CalendarClock, Banknote, Send, X, ShoppingCart, MessageSquare, MessageSquareReply, CheckCircle2, ShieldCheck, ShieldX, Handshake, PackageX } from 'lucide-react';
import { AppNotification, User } from '../types';

type Link = NonNullable<AppNotification['link']>;

interface NotificationCenterProps {
  currentUser: User;
  /** Site managers only see their own project's notifications */
  projectId?: string;
  onOpen: (link: Link) => void;
  /** Lets the app trigger an immediate refresh after an action (e.g. a delivery was recorded) */
  registerRefresh?: (fn: () => void) => void;
}

const POLL_MS = 20000;
const URGENT: AppNotification['type'][] = ['payment-due', 'payment-overdue', 'po-email-failed', 'approval-requested', 'request-submitted', 'delivery-overdue', 'material-rejected'];

const ICONS: Record<AppNotification['type'], React.ComponentType<{ size?: number; className?: string }>> = {
  'quote-received': FileText,
  'quote-declined': AlertTriangle,
  'rfq-sent': Send,
  'po-issued': ShoppingCart,
  'po-email-failed': AlertTriangle,
  'delivery-recorded': Truck,
  'payment-due': CalendarClock,
  'payment-overdue': AlertTriangle,
  'payment-recorded': Banknote,
  'query-raised': MessageSquare,
  'query-reply': MessageSquareReply,
  'query-status': CheckCircle2,
  'approval-requested': ShieldCheck,
  'approval-approved': ShieldCheck,
  'approval-rejected': ShieldX,
  'negotiation-offer': Handshake,
  'negotiation-response': Handshake,
  'delivery-due': CalendarClock,
  'delivery-overdue': AlertTriangle,
  'material-rejected': PackageX,
  'request-submitted': ShieldCheck,
  'request-approved': ShieldCheck,
  'request-rejected': ShieldX,
};
const TONE: Record<AppNotification['severity'], string> = {
  info: 'bg-[#eaf0fb] text-[#23408e]',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-rose-50 text-rose-700',
};
const TOAST_BORDER: Record<AppNotification['severity'], string> = {
  info: 'border-l-[#23408e]',
  success: 'border-l-emerald-500',
  warning: 'border-l-amber-500',
  danger: 'border-l-rose-500',
};

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export default function NotificationCenter({ currentUser, projectId, onOpen, registerRefresh }: NotificationCenterProps) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const pushToasts = (list: AppNotification[]) => {
    if (!list.length) return;
    setToasts((prev) => [...list, ...prev.filter((t) => !list.some((n) => n.id === t.id))].slice(0, 4));
    for (const n of list) setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== n.id)), URGENT.includes(n.type) ? 12000 : 8000);
  };

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ userId: currentUser.id, ...(projectId ? { projectId } : {}) });
      const res = await fetch(`/api/notifications?${qs}`);
      const json = await res.json();
      if (!json?.success) return;
      const list: AppNotification[] = json.notifications || [];
      setItems(list);
      if (seen.current === null) {
        // First load: pop up only the unread payment dues / failures waiting for this user
        seen.current = new Set(list.map((n) => n.id));
        pushToasts(list.filter((n) => !n.read && URGENT.includes(n.type)).slice(0, 3));
      } else {
        const fresh = list.filter((n) => !n.read && !seen.current!.has(n.id));
        fresh.forEach((n) => seen.current!.add(n.id));
        pushToasts(fresh.slice(0, 3));
      }
    } catch {
      // offline: keep the previous list
    }
  }, [currentUser.id, projectId]);

  useEffect(() => {
    seen.current = null;
    setToasts([]);
    load();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    registerRefresh?.(() => setTimeout(load, 300));
  }, [registerRefresh, load]);

  // Close the panel on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markRead = async (body: { ids?: string[]; all?: boolean }) => {
    setItems((prev) => prev.map((n) => (body.all || body.ids?.includes(n.id) ? { ...n, read: true } : n)));
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, ...body }),
      });
    } catch {
      // will be retried next time
    }
  };

  const openItem = (n: AppNotification) => {
    if (!n.read) markRead({ ids: [n.id] });
    setToasts((prev) => prev.filter((t) => t.id !== n.id));
    setOpen(false);
    if (n.link) onOpen(n.link);
  };

  const unread = items.filter((n) => !n.read).length;
  const visible = items; // already filtered to the user's project by the server

  return (
    <>
      <div className="relative" ref={panelRef}>
        <button
          id="btn-notifications"
          onClick={() => setOpen((o) => !o)}
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
          aria-expanded={open}
          className="relative h-10 w-10 flex items-center justify-center bg-white hover:bg-[#f5f8fd] border border-slate-200 hover:border-[#c9d6f2] rounded-lg transition-colors cursor-pointer shrink-0"
          title="Notifications"
        >
          {unread ? <BellRing size={18} className="text-[#23408e]" /> : <Bell size={18} className="text-slate-600" />}
          {unread > 0 && (
            <span id="notification-badge" className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-rose-600 text-white text-[11px] font-bold flex items-center justify-center ring-2 ring-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>

        {open && (
          <div role="dialog" aria-label="Notifications" className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-2rem))] bg-white rounded-xl border border-slate-200 shadow-2xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-[#23408e] text-white">
              <div>
                <p className="text-sm font-semibold">Notifications</p>
                <p className="text-[11px] text-white/75">{unread ? `${unread} unread` : 'You are all caught up'}</p>
              </div>
              {unread > 0 && (
                <button onClick={() => markRead({ all: true })} className="text-[11px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/15 hover:bg-white/25 cursor-pointer">
                  <CheckCheck size={13} /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
              {visible.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">No notifications yet.</p>
              ) : (
                visible.map((n) => {
                  const Icon = ICONS[n.type] || Bell;
                  return (
                    <button
                      key={n.id}
                      onClick={() => openItem(n)}
                      className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-slate-50 cursor-pointer ${n.read ? '' : 'bg-[#f5f8fd]'}`}
                    >
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${TONE[n.severity]}`}>
                        <Icon size={15} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-start justify-between gap-2">
                          <span className={`text-sm ${n.read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}>{n.title}</span>
                          {!n.read && <span className="w-2 h-2 rounded-full bg-[#23408e] mt-1.5 shrink-0" aria-label="Unread" />}
                        </span>
                        <span className="block text-xs text-slate-600 mt-0.5">{n.message}</span>
                        <span className="block text-[11px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Pop-up notifications (portalled: the sticky header's backdrop blur would otherwise trap fixed positioning) */}
      {createPortal(
      <div id="notification-toasts" className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 w-[min(22rem,calc(100vw-2rem))]" aria-live="polite">
        {toasts.map((n) => {
          const Icon = ICONS[n.type] || Bell;
          return (
            <div key={n.id} role="status" className={`bg-white rounded-xl border border-slate-200 border-l-4 ${TOAST_BORDER[n.severity]} shadow-xl p-3 flex gap-3 animate-in slide-in-from-right-5 fade-in duration-200`}>
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${TONE[n.severity]}`}>
                <Icon size={15} />
              </span>
              <button onClick={() => openItem(n)} className="flex-1 min-w-0 text-left cursor-pointer">
                <span className="block text-sm font-semibold text-slate-900">{n.title}</span>
                <span className="block text-xs text-slate-600 mt-0.5">{n.message}</span>
              </button>
              <button onClick={() => setToasts((prev) => prev.filter((t) => t.id !== n.id))} aria-label="Dismiss" className="text-slate-400 hover:text-slate-700 self-start cursor-pointer">
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>,
      document.body
      )}
    </>
  );
}
