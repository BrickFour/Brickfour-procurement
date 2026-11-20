import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Project, Material, InventoryTransaction, User, SiteQuery, QueryResponse, RateHistoryPoint, ContractorRecord, ContractorBill, InternalTransferRecord, BillType, Vendor, MarketPriceBenchmark, ProjectRequirement, VendorQuotation, PurchaseOrderRef, PurchaseOrderRecord, PurchaseOrderReceipt } from './types';
import OrderQueryModal from './components/OrderQueryModal';
import VendorQuoteModal from './components/VendorQuoteModal';
import OrderQueryComparisonCenter, { DeliveryInput, DeliveryResult } from './components/OrderQueryComparisonCenter';
import NotificationCenter from './components/NotificationCenter';
import {
  INITIAL_PROJECTS,
  INITIAL_MATERIALS,
  INITIAL_TRANSACTIONS,
  INITIAL_USERS,
  INITIAL_QUERIES,
  INITIAL_CONTRACTORS,
  INITIAL_TRANSFERS,
  INITIAL_VENDORS,
  INITIAL_MARKET_BENCHMARKS,
  INITIAL_PRS,
  INITIAL_QUOTES,
} from './initialData';
import StatsGrid from './components/StatsGrid';
import ProjectSelector from './components/ProjectSelector';
import MaterialList from './components/MaterialList';
import type { MaterialImportPlan, VendorImportPlan } from './lib/bulkImport';
import TransactionHistory from './components/TransactionHistory';
import StockAnalytics from './components/StockAnalytics';
import QueryCenter from './components/QueryCenter';
import RaiseQueryModal from './components/RaiseQueryModal';
import ProcurementContracts from './components/ProcurementContracts';
import InternalTransfer from './components/InternalTransfer';
import MaterialCodeSummary from './components/MaterialCodeSummary';
import GstUrdBillsSummary from './components/GstUrdBillsSummary';
import AuthModal from './components/AuthModal';
import LoginPage from './components/LoginPage';
import AdminProjectManager from './components/AdminProjectManager';
import FloatingChatbot from './components/FloatingChatbot';
import { loadAppStateFromMongo, syncCollection, fetchServerUpdates, mergeServerDocs } from './services/mongoDataService';
import vyasLogo from './images/vyas logo.png';
import {
  BookOpen,
  History,
  TrendingUp,
  MessageSquare,
  LogIn,
  LogOut,
  HelpCircle,
  ShieldCheck,
  Building2,
  Truck,
  Hash,
  Receipt,
  ShoppingCart,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Browser keys for the signed-in session and the open tab (restored on refresh)
const SESSION_KEY = 'builder_logged_in';
const TAB_KEY = 'builder_active_tab';
const APP_TABS = ['catalog', 'order-queries', 'procurement', 'transfer', 'gst-urd', 'codes', 'ledger', 'analytics', 'queries', 'admin'] as const;
type AppTab = (typeof APP_TABS)[number];

export default function App() {
  // Theme state is strictly set to light theme as requested
  const [darkMode] = useState<boolean>(false);

  // Signed-in session survives a page refresh; the login page shows only until the user signs in or after logout
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SESSION_KEY) === '1' && !!localStorage.getItem('builder_current_user');
    } catch {
      return false;
    }
  });

  // MongoDB live database status
  const [isLiveDatabase, setIsLiveDatabase] = useState<boolean>(false);
  const [isLoadingDatabase, setIsLoadingDatabase] = useState<boolean>(true);

  // Data states
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [materials, setMaterials] = useState<Material[]>(INITIAL_MATERIALS);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>(INITIAL_TRANSACTIONS);
  const [queries, setQueries] = useState<SiteQuery[]>(INITIAL_QUERIES);
  const [contractors, setContractors] = useState<ContractorRecord[]>(INITIAL_CONTRACTORS);
  const [transfers, setTransfers] = useState<InternalTransferRecord[]>(INITIAL_TRANSFERS);

  // Vendor Enquiry & Quote Comparison States (PRD Requirements)
  const [vendors, setVendors] = useState<Vendor[]>(INITIAL_VENDORS);
  const [marketBenchmarks, setMarketBenchmarks] = useState<MarketPriceBenchmark[]>(INITIAL_MARKET_BENCHMARKS);
  const [prs, setPrs] = useState<ProjectRequirement[]>(INITIAL_PRS);
  const [quotes, setQuotes] = useState<VendorQuotation[]>(INITIAL_QUOTES);

  // Live quotation updates: vendors submit quotes through their secure link straight into MongoDB.
  // Poll the database so new quotes (and PR status changes) appear in the comparison automatically.
  const [isRefreshingQuotes, setIsRefreshingQuotes] = useState<boolean>(false);
  const [lastQuoteRefreshTime, setLastQuoteRefreshTime] = useState<string>('');

  const refreshVendorQuotes = useCallback(async () => {
    setIsRefreshingQuotes(true);
    try {
      const updates = await fetchServerUpdates(['vendor_quotations', 'project_requirements']);
      if (updates.vendor_quotations) {
        const docs = updates.vendor_quotations as VendorQuotation[];
        setQuotes((prev) => mergeServerDocs(prev, docs, (q) => q.id));
      }
      if (updates.project_requirements) {
        const docs = updates.project_requirements as ProjectRequirement[];
        setPrs((prev) => mergeServerDocs(prev, docs, (p) => p.id));
      }
      setLastQuoteRefreshTime(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    } finally {
      setIsRefreshingQuotes(false);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refreshVendorQuotes();
    }, 15000);
    return () => clearInterval(interval);
  }, [refreshVendorQuotes]);  // Order Query & Vendor Quote Modal States
  const [isOrderQueryOpen, setIsOrderQueryOpen] = useState<boolean>(false);
  const [orderQueryMaterial, setOrderQueryMaterial] = useState<Material | null>(null);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState<boolean>(false);
  const [quoteModalPR, setQuoteModalPR] = useState<ProjectRequirement | null>(null);

  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    try {
      return localStorage.getItem('builder_selected_project') || 'proj-1';
    } catch {
      return 'proj-1';
    }
  });
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = localStorage.getItem('builder_current_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.role === 'admin') return { ...parsed, name: 'Admin', email: 'admin@vyasgroup.com' };
        if (parsed.id === 'sm-1' || parsed.name === 'Rajesh Sharma') return { ...parsed, name: 'Site Manager 1', email: 'sitemanager1@vyasgroup.com' };
        if (parsed.id === 'sm-2' || parsed.name === 'Ananya Goel') return { ...parsed, name: 'Site Manager 2', email: 'sitemanager2@vyasgroup.com' };
        if (parsed.id === 'sm-3' || parsed.name === 'David Miller') return { ...parsed, name: 'Site Manager 3', email: 'sitemanager3@vyasgroup.com' };
        return parsed;
      } catch (e) {
        // fallback to default
      }
    }
    return INITIAL_USERS[0];
  });

  // Raise Query Modal states
  const [isRaiseQueryOpen, setIsRaiseQueryOpen] = useState<boolean>(false);
  const [preselectedMaterialId, setPreselectedMaterialId] = useState<string | undefined>(undefined);
  const [preselectedProjectId, setPreselectedProjectId] = useState<string | undefined>(undefined);
  const [queryFocus, setQueryFocus] = useState<{ queryId: string; nonce: number } | null>(null);

  // Award PR Success Toast notification state (direct notification without modal)
  // Bumped after an award so the Purchase Orders list reloads
  const [poRefreshKey, setPoRefreshKey] = useState(0);
  // Notifications: refresh hook + "open this RFQ / PO" requests from a clicked notification
  const notificationsRefresh = useRef<(() => void) | null>(null);
  const registerNotificationsRefresh = useCallback((fn: () => void) => {
    notificationsRefresh.current = fn;
  }, []);
  const [orderFocus, setOrderFocus] = useState<{ view: 'rfqs' | 'pos'; prId?: string; poNumber?: string; nonce: number } | null>(null);

  const [awardToast, setAwardToast] = useState<{
    vendorName: string;
    vendorEmail: string;
    materialName: string;
    poNumber: string;
    emailStatus: 'sent' | 'failed' | 'no-email';
  } | null>(null);

  // Load from MongoDB (or Local Backup fallback) on mount
  const refreshMongoData = useCallback(async () => {
    setIsLoadingDatabase(true);
    const { state, isLiveMongo } = await loadAppStateFromMongo();
    setProjects(state.projects);
    setMaterials(state.materials);
    setTransactions(state.transactions);
    setUsers(state.users);
    setQueries(state.queries);
    if (state.contractors) setContractors(state.contractors);
    if (state.internal_transfers) setTransfers(state.internal_transfers);
    if (state.vendors) setVendors(state.vendors);
    if (state.market_benchmarks) setMarketBenchmarks(state.market_benchmarks);
    if (state.project_requirements) setPrs(state.project_requirements);
    if (state.vendor_quotations) setQuotes(state.vendor_quotations);
    setIsLiveDatabase(isLiveMongo);
    setIsLoadingDatabase(false);
  }, []);

  useEffect(() => {
    refreshMongoData();
  }, [refreshMongoData]);

  // Persist every data change to MongoDB (diff-based; inactive until data has been loaded from the database)
  useEffect(() => {
    syncCollection('projects', projects);
  }, [projects]);

  useEffect(() => {
    syncCollection('materials', materials);
  }, [materials]);

  useEffect(() => {
    syncCollection('inventory_transactions', transactions);
  }, [transactions]);

  useEffect(() => {
    syncCollection('users', users);
  }, [users]);

  useEffect(() => {
    syncCollection('site_queries', queries);
  }, [queries]);

  useEffect(() => {
    syncCollection('contractors', contractors);
  }, [contractors]);

  useEffect(() => {
    syncCollection('internal_transfers', transfers);
  }, [transfers]);

  useEffect(() => {
    syncCollection('vendors', vendors);
  }, [vendors]);

  useEffect(() => {
    syncCollection('market_benchmarks', marketBenchmarks);
  }, [marketBenchmarks]);

  useEffect(() => {
    syncCollection('project_requirements', prs);
  }, [prs]);

  useEffect(() => {
    syncCollection('vendor_quotations', quotes);
  }, [quotes]);

  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);

  // Keep the signed-in session in the browser (business data lives in MongoDB)
  useEffect(() => {
    localStorage.setItem('builder_current_user', JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    try {
      if (isLoggedIn) localStorage.setItem(SESSION_KEY, '1');
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      // storage unavailable (private mode): the session lasts until the page is closed
    }
  }, [isLoggedIn]);

  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY) as AppTab | null;
      return saved && APP_TABS.includes(saved) ? saved : 'catalog';
    } catch {
      return 'catalog';
    }
  });

  // A refresh reopens the tab the user was on
  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, activeTab);
    } catch {
      // ignore
    }
  }, [activeTab]);

  // Pick up new vendor quotes as soon as the procurement view is opened
  useEffect(() => {
    if (activeTab === 'order-queries') refreshVendorQuotes();
  }, [activeTab, refreshVendorQuotes]);

  // Order Query & PR Handlers
  const handleOpenOrderQueryForMaterial = (material: Material) => {
    setOrderQueryMaterial(material);
    setIsOrderQueryOpen(true);
  };

  const handleCreatePR = (newPR: ProjectRequirement) => {
    setPrs((prev) => [newPR, ...prev]);
    setActiveTab('order-queries');
  };

  const handleSubmitQuote = (newQuote: VendorQuotation) => {
    setQuotes((prev) => {
      const filtered = prev.filter((q) => !(q.prId === newQuote.prId && q.vendorId === newQuote.vendorId));
      return [newQuote, ...filtered];
    });
    // Update PR status if it was Enquiry Sent
    setPrs((prev) =>
      prev.map((p) =>
        p.id === newQuote.prId && p.status === 'Enquiry Sent'
          ? { ...p, status: 'Quotes Received' }
          : p
      )
    );
  };

  /**
   * Award a PR to a vendor: marks the winning quote, then the server generates the Purchase Order (PDF),
   * stores it in the database and emails it to the vendor.
   */
  const handleAwardPR = async (prId: string, vendorId: string): Promise<boolean> => {
    const targetPR = prs.find((p) => p.id === prId);
    const winningQuote = quotes.find((q) => q.prId === prId && q.vendorId === vendorId && q.status !== 'Declined');
    if (!targetPR || !winningQuote) return false;
    const ok = window.confirm(
      `Award ${prId} (${targetPR.materialName}) to ${winningQuote.vendorName} for Rs. ${winningQuote.totalAmount.toLocaleString('en-IN')}?\n\n` +
        'A purchase order will be generated and emailed to the vendor.'
    );
    if (!ok) return false;

    poAttemptedRef.current.add(prId); // this call issues the PO; the auto-issuer must not race it
    setPrs((prev) => prev.map((p) => (p.id === prId ? { ...p, status: 'Awarded', selectedVendorId: vendorId } : p)));
    setQuotes((prev) =>
      prev.map((q) =>
        q.prId === prId && q.status !== 'Declined' ? { ...q, status: q.vendorId === vendorId ? 'Awarded' : 'Rejected' } : q
      )
    );
    await issuePurchaseOrder(prId, vendorId);
    return true;
  };

  /**
   * Generates the Purchase Order for an awarded PR and emails it to the vendor (no confirmation prompt).
   * Called right after an award, and automatically for any awarded PR that does not have a PO yet.
   * The server is idempotent: one PO per PR, so repeated calls never create duplicates.
   */
  const issuePurchaseOrder = async (prId: string, vendorId: string, opts: { silent?: boolean } = {}): Promise<boolean> => {
    const targetPR = prs.find((p) => p.id === prId);
    const winningQuote = quotes.find((q) => q.prId === prId && q.vendorId === vendorId && q.status !== 'Declined');
    if (!targetPR || !winningQuote) return false;
    poAttemptedRef.current.add(prId);
    try {
      const res = await fetch('/api/purchase-orders/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prId, vendorId, pr: targetPR, quote: winningQuote, awardedBy: currentUser.name }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || `Server returned HTTP ${res.status}`);
      const po: PurchaseOrderRef = json.purchaseOrder;
      setPrs((prev) => prev.map((p) => (p.id === prId ? { ...p, status: 'Awarded', selectedVendorId: vendorId, purchaseOrder: po } : p)));

      if (json.alreadyIssued) {
        setPoRefreshKey((k) => k + 1);
        return true;
      }
      if (po.emailStatus === 'failed' && !opts.silent) {
        alert(`${po.poNumber} was generated and saved, but it could not be emailed to ${winningQuote.vendorName}.\n\n${json.emailError || ''}\n\nYou can download it from Purchase Orders and send it manually.`);
      }
      setAwardToast({
        vendorName: winningQuote.vendorName,
        vendorEmail: po.emailStatus === 'sent' ? po.emailedTo || '' : '',
        materialName: targetPR.materialName,
        poNumber: po.poNumber,
        emailStatus: po.emailStatus,
      });
      setTimeout(() => setAwardToast(null), 6000);
      setPoRefreshKey((k) => k + 1);
      notificationsRefresh.current?.();
      return true;
    } catch (err: any) {
      if (!opts.silent) {
        alert(`${prId} was awarded to ${winningQuote.vendorName}, but the purchase order could not be generated.\n\n${err?.message || err}\n\nUse "Retry PO" under Purchase Orders.`);
      }
      return false;
    }
  };

  // Awarded PRs without a PO (e.g. awarded before automatic POs, or a failed attempt) get their PO
  // generated and emailed automatically once the data has loaded. Tried once per PR per session.
  const poAttemptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (isLoadingDatabase || !isLiveDatabase) return;
    for (const pr of prs) {
      if (pr.status !== 'Awarded' || pr.purchaseOrder || !pr.selectedVendorId) continue;
      if (poAttemptedRef.current.has(pr.id)) continue;
      if (!quotes.some((q) => q.prId === pr.id && q.vendorId === pr.selectedVendorId && q.status !== 'Declined')) continue;
      issuePurchaseOrder(pr.id, pr.selectedVendorId, { silent: true });
    }
  }, [prs, quotes, isLoadingDatabase, isLiveDatabase]);

  /** Manual retry (button) for an awarded PR whose automatic PO failed */
  const handleRetryPurchaseOrder = async (prId: string, vendorId: string) => issuePurchaseOrder(prId, vendorId);

  /**
   * Record a delivery + vendor invoice against a PO. The server calculates the invoice from the PO terms;
   * then the stock is added and the bill is filed under GST & URD Bills automatically (inward transaction).
   */
  const handleRecordDelivery = async (po: PurchaseOrderRecord, input: DeliveryInput): Promise<DeliveryResult> => {
    try {
      const res = await fetch(`/api/purchase-orders/${encodeURIComponent(po.poNumber)}/receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, recordedBy: currentUser.name }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return { ok: false, error: json?.error || `Server returned HTTP ${res.status}` };
      const r: PurchaseOrderReceipt = json.receipt;
      const round2 = (n: number) => Math.round(n * 100) / 100;

      // The ordered material in the project's stock: by id, else by name in the same project
      const projectId = po.projectId || materials.find((m) => m.id === po.materialId)?.projectId;
      const sameName = (m: Material) => m.name.trim().toLowerCase() === po.materialName.trim().toLowerCase();
      const material =
        materials.find((m) => m.id === po.materialId && (!projectId || m.projectId === projectId)) ||
        (projectId ? materials.find((m) => m.projectId === projectId && sameName(m)) : undefined);
      const projectName = projects.find((p) => p.id === projectId)?.name || po.projectName;

      // Landed cost per unit (excl. GST, incl. freight & loading) drives the stock value / estimation cost
      const isGstBill = Boolean(po.vendorGstin) || r.gstRate > 0;
      const baseAmount = round2(r.invoiceTotal - r.gstAmount);
      const landedRate = r.receivedQty > 0 ? round2(baseAmount / r.receivedQty) : po.rate;
      const consumedOf = (materialId: string) =>
        transactions.filter((t) => t.materialId === materialId && t.type === 'consumption').reduce((s, t) => s + t.quantity, 0);
      const billFields = {
        billType: (isGstBill ? 'GST' : 'URD') as BillType,
        billNumber: r.invoiceNumber,
        gstRate: isGstBill ? r.gstRate : 0,
        gstAmount: isGstBill ? r.gstAmount : 0,
        baseAmount,
        vendorGstin: po.vendorGstin,
        vendorName: po.vendorName,
      };
      const notes = `Received against ${po.poNumber} - invoice ${r.invoiceNumber} dated ${r.invoiceDate}${r.notes ? ` (${r.notes})` : ''}`;
      const invoiceUrl = r.invoiceFile ? `/api/purchase-orders/${encodeURIComponent(po.poNumber)}/documents/${r.invoiceFile.id}` : undefined;

      let estimationDelta: number | undefined;
      let materialCreated = false;
      if (material) {
        const consumed = consumedOf(material.id);
        estimationDelta = round2((material.currentStock + r.receivedQty + consumed) * landedRate - (material.currentStock + consumed) * material.unitCost);
        handleAddTransaction({
          projectId: material.projectId,
          materialId: material.id,
          type: 'addition',
          quantity: r.receivedQty,
          rate: landedRate,
          totalPrice: r.invoiceTotal,
          ...billFields,
          invoiceUrl,
          invoiceFileName: r.invoiceFile?.name,
          notes,
          operator: currentUser.name,
          date: r.receivedOn,
        });
      } else if (projectId) {
        // Not in this project's catalogue yet: create it with the delivered stock
        const pr = prs.find((p) => p.id === po.prId);
        const id = `mat-${Date.now()}`;
        const newMaterial: Material = {
          id,
          projectId,
          name: po.materialName,
          category: pr?.category || 'Others',
          unit: po.unit,
          currentStock: r.receivedQty,
          minThreshold: 0,
          unitCost: landedRate,
          totalPrice: r.invoiceTotal,
          materialCode: po.materialCode || pr?.materialCode,
          materialGroup: pr?.materialGroup,
          ...billFields,
          rateHistory: [
            { id: `rh-${id}`, date: r.receivedOn, rate: landedRate, quantity: r.receivedQty, totalPrice: r.invoiceTotal, notes, ...billFields },
          ],
        };
        setMaterials((prev) => [...prev, newMaterial]);
        setTransactions((prev) => [
          {
            id: `tx-${Date.now()}`,
            projectId,
            materialId: id,
            type: 'addition',
            quantity: r.receivedQty,
            rate: landedRate,
            totalPrice: r.invoiceTotal,
            ...billFields,
            invoiceUrl,
            invoiceFileName: r.invoiceFile?.name,
            notes,
            operator: currentUser.name,
            date: r.receivedOn,
          },
          ...prev,
        ]);
        materialCreated = true;
        estimationDelta = round2(r.receivedQty * landedRate);
      }

      // Latest purchase price for the material's market comparison
      const code = po.materialCode || material?.materialCode;
      if (code) {
        setMarketBenchmarks((prev) =>
          prev.map((b) =>
            b.materialCode === code
              ? { ...b, lastBuyPrice: po.rate, percentVsLastBuy: po.rate ? round2(((b.currentMarketPrice - po.rate) / po.rate) * 100) : b.percentVsLastBuy }
              : b
          )
        );
      }
      // A fully delivered order closes its requirement
      if (json.purchaseOrder?.deliveryStatus === 'Received') {
        setPrs((prev) => prev.map((p) => (p.id === po.prId && p.status === 'Awarded' ? { ...p, status: 'Closed' } : p)));
      }
      notificationsRefresh.current?.();
      return { ok: true, receipt: r, stockUpdated: Boolean(material) || materialCreated, materialCreated, projectName, estimationDelta };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Network error' };
    }
  };

  // Interactive drill-down filter states
  const [stockFilterMode, setStockFilterMode] = useState<'all' | 'low' | 'reorder'>('all');
  const [todayTxFilter, setTodayTxFilter] = useState<boolean>(false);

  // Drill down handlers
  const handleLowStockClick = () => {
    setActiveTab('catalog');
    setStockFilterMode('low');
  };

  const handleReorderClick = () => {
    setActiveTab('catalog');
    setStockFilterMode('reorder');
  };

  const handleDailyActivitiesClick = () => {
    setActiveTab('ledger');
    setTodayTxFilter(true);
  };

  // Remember the selected project (UI preference only)
  useEffect(() => {
    localStorage.setItem('builder_selected_project', selectedProjectId);
  }, [selectedProjectId]);


  // Determine projects visible to the current user
  const userVisibleProjects = useMemo(() => {
    if (!currentUser) return projects;

    if (currentUser.role === 'site_manager') {
      const matched = projects.filter(
        (p) =>
          p.id === currentUser.assignedProjectId ||
          p.managerId === currentUser.id ||
          (p.managerEmail && currentUser.email && p.managerEmail.toLowerCase() === currentUser.email.toLowerCase()) ||
          (p.manager && currentUser.name && p.manager.toLowerCase() === currentUser.name.toLowerCase())
      );
      if (matched.length > 0) return matched;
      if (currentUser.assignedProjectId) {
        const fallback = projects.find((p) => p.id === currentUser.assignedProjectId);
        if (fallback) return [fallback];
      }
      return projects;
    }

    if (currentUser.role === 'admin') {
      // System Administrators see ALL projects across the platform
      return projects;
    }

    return projects;
  }, [projects, currentUser]);

  // Filter materials accessible to the current user
  const userVisibleMaterials = useMemo(() => {
    if (currentUser?.role === 'site_manager' || currentUser?.role === 'admin') {
      const validProjectIds = new Set(userVisibleProjects.map((p) => p.id));
      return materials.filter((m) => validProjectIds.has(m.projectId));
    }
    return materials;
  }, [materials, currentUser, userVisibleProjects]);

  // Filter transactions accessible to the current user
  const userVisibleTransactions = useMemo(() => {
    if (currentUser?.role === 'site_manager' || currentUser?.role === 'admin') {
      const validProjectIds = new Set(userVisibleProjects.map((p) => p.id));
      return transactions.filter((t) => validProjectIds.has(t.projectId));
    }
    return transactions;
  }, [transactions, currentUser, userVisibleProjects]);

  // Filter queries accessible to the current user
  const userVisibleQueries = useMemo(() => {
    let filtered = queries;

    const allowedProjectIds = new Set(userVisibleProjects.map((p) => p.id));
    filtered = filtered.filter((q) => allowedProjectIds.has(q.projectId));

    if (selectedProjectId !== 'all') {
      filtered = filtered.filter((q) => q.projectId === selectedProjectId);
    }

    return filtered;
  }, [queries, userVisibleProjects, selectedProjectId]);

  // Filter contractors accessible to the current user
  const userVisibleContractors = useMemo(() => {
    if (currentUser?.role === 'site_manager' || currentUser?.role === 'admin') {
      const validProjectIds = new Set(userVisibleProjects.map((p) => p.id));
      return contractors.filter((c) => validProjectIds.has(c.projectId));
    }
    return contractors;
  }, [contractors, currentUser, userVisibleProjects]);

  // Contractor Handlers
  const handleAddContractor = (newContractorData: Omit<ContractorRecord, 'id' | 'createdAt'>) => {
    const newContractor: ContractorRecord = {
      ...newContractorData,
      id: `contractor-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setContractors((prev) => [newContractor, ...prev]);
  };

  // Removes a contracting firm (e.g. the sample records when starting fresh). Saved by the normal sync.
  const handleDeleteContractor = (contractorId: string) => {
    setContractors((prev) => prev.filter((c) => c.id !== contractorId));
  };

  const handleUpdateContractorBilling = (
    contractorId: string,
    updates: {
      currentBilling?: number;
      pastBilling?: number;
      currentBillingStatus?: ContractorRecord['currentBillingStatus'];
      statusReason?: string;
      newPastBill?: Omit<ContractorBill, 'id'>;
    }
  ) => {
    setContractors((prev) =>
      prev.map((c) => {
        if (c.id !== contractorId) return c;

        let updatedPastBills = c.pastBills;
        let updatedPastBilling = updates.pastBilling !== undefined ? updates.pastBilling : c.pastBilling;

        if (updates.newPastBill) {
          const newBill: ContractorBill = {
            ...updates.newPastBill,
            id: `bill-${Date.now()}`,
          };
          updatedPastBills = [...updatedPastBills, newBill];
          updatedPastBilling += newBill.amount;
        }

        return {
          ...c,
          currentBilling: updates.currentBilling !== undefined ? updates.currentBilling : c.currentBilling,
          pastBilling: updatedPastBilling,
          currentBillingStatus: updates.currentBillingStatus || c.currentBillingStatus,
          statusReason: updates.statusReason !== undefined ? updates.statusReason : c.statusReason,
          pastBills: updatedPastBills,
        };
      })
    );
  };

  const handleOpenRaiseQueryForContractor = (contractorId: string, projId: string, firmName: string) => {
    setPreselectedMaterialId(undefined);
    setPreselectedProjectId(projId);
    setIsRaiseQueryOpen(true);
  };

  // Filter transfers accessible to current user / selected project
  const userVisibleTransfers = useMemo(() => {
    const validProjectIds = new Set(userVisibleProjects.map((p) => p.id));
    return transfers.filter((t) => {
      // Must belong to user's accessible projects
      const isOutwardVisible = validProjectIds.has(t.outwardProjectId);
      const isInwardVisible = validProjectIds.has(t.inwardProjectId);
      if (!isOutwardVisible && !isInwardVisible) return false;

      // Project selector filter
      if (selectedProjectId !== 'all') {
        return t.outwardProjectId === selectedProjectId || t.inwardProjectId === selectedProjectId;
      }
      return true;
    });
  }, [transfers, userVisibleProjects, selectedProjectId]);

  // Transfer Handlers
  const handleAddTransfer = (newTransferData: Omit<InternalTransferRecord, 'id' | 'createdAt'>) => {
    const newTransfer: InternalTransferRecord = {
      ...newTransferData,
      id: `itrans-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };

    setTransfers((prev) => [newTransfer, ...prev]);

    // 1. Outward Site: Reduce quantity & estimation cost in resource catalog
    setMaterials((prevMaterials) =>
      prevMaterials.map((mat) => {
        const isMatchedMat =
          mat.projectId === newTransferData.outwardProjectId &&
          ((newTransferData.materialId && mat.id === newTransferData.materialId) ||
            mat.name.toLowerCase().trim() === newTransferData.materialName.toLowerCase().trim());

        if (isMatchedMat) {
          const updatedStock = Math.max(0, mat.currentStock - newTransferData.quantity);
          return {
            ...mat,
            currentStock: updatedStock,
            totalPrice: updatedStock * mat.unitCost,
          };
        }
        return mat;
      })
    );

    // 2. Outward Site: Log outward transaction in ledger
    const outwardTx: InventoryTransaction = {
      id: `tx-out-${Date.now()}`,
      projectId: newTransferData.outwardProjectId,
      materialId: `mat-transfer-${Date.now()}`,
      type: 'consumption',
      quantity: newTransferData.quantity,
      rate: newTransferData.rate,
      totalPrice: newTransferData.amount,
      date: newTransferData.transferDate,
      notes: `Internal Transfer (Outward Dispatch) to ${newTransferData.inwardProjectName}. Vehicle: ${newTransferData.vehicleNumber || 'N/A'}. Driver: ${newTransferData.driverName || 'N/A'}`,
      operator: currentUser?.name || 'Site Manager',
    };
    setTransactions((prev) => [outwardTx, ...prev]);
  };

  const handleUpdateTransferStatus = (
    transferId: string,
    status: InternalTransferRecord['status'],
    photoUrl?: string,
    photoFileName?: string,
    notes?: string
  ) => {
    const targetTransfer = transfers.find((t) => t.id === transferId);

    setTransfers((prev) =>
      prev.map((t) => (t.id === transferId ? { ...t, status, photoUrl, photoFileName, notes: notes ?? t.notes } : t))
    );

    // When status changes to 'Received & Verified' and wasn't previously verified
    if (targetTransfer && status === 'Received & Verified' && targetTransfer.status !== 'Received & Verified') {
      // 1. Inward Site: Add / Update material in Resource Catalog & update estimation cost
      setMaterials((prevMaterials) => {
        const existingMat = prevMaterials.find(
          (m) =>
            m.projectId === targetTransfer.inwardProjectId &&
            m.name.toLowerCase().trim() === targetTransfer.materialName.toLowerCase().trim()
        );

        if (existingMat) {
          return prevMaterials.map((m) => {
            if (m.id === existingMat.id) {
              const updatedStock = m.currentStock + targetTransfer.quantity;
              return {
                ...m,
                currentStock: updatedStock,
                totalPrice: updatedStock * m.unitCost,
              };
            }
            return m;
          });
        } else {
          // Create new Resource Catalog item for the receiving project site
          const newMaterial: Material = {
            id: `mat-in-${Date.now()}`,
            projectId: targetTransfer.inwardProjectId,
            name: targetTransfer.materialName,
            category: targetTransfer.category || 'General',
            unit: targetTransfer.unit || 'Nos.',
            currentStock: targetTransfer.quantity,
            minThreshold: 10,
            unitCost: targetTransfer.rate,
            totalPrice: targetTransfer.quantity * targetTransfer.rate,
          };
          return [...prevMaterials, newMaterial];
        }
      });

      // 2. Inward Site: Log inward addition transaction in ledger
      const inwardTx: InventoryTransaction = {
        id: `tx-in-${Date.now()}`,
        projectId: targetTransfer.inwardProjectId,
        materialId: `mat-transfer-${Date.now()}`,
        type: 'addition',
        quantity: targetTransfer.quantity,
        rate: targetTransfer.rate,
        totalPrice: targetTransfer.amount,
        date: new Date().toISOString().split('T')[0],
        notes: `Internal Transfer (Inward Receipt) from ${targetTransfer.outwardProjectName}. Vehicle: ${targetTransfer.vehicleNumber || 'N/A'}. Verified by ${currentUser?.name || 'Site Manager'}`,
        operator: currentUser?.name || 'Site Manager',
      };
      setTransactions((prev) => [inwardTx, ...prev]);
    }
  };



  // Automatically manage selectedProjectId when userVisibleProjects changes
  useEffect(() => {
    if (userVisibleProjects.length === 0) {
      if (selectedProjectId !== 'all') {
        setSelectedProjectId('all');
      }
      return;
    }

    const validProjectIds = userVisibleProjects.map((p) => p.id);
    if (selectedProjectId !== 'all' && !validProjectIds.includes(selectedProjectId)) {
      setSelectedProjectId(userVisibleProjects[0].id);
    }
  }, [currentUser, userVisibleProjects, selectedProjectId]);

  // Query Management Handlers
  const handleOpenRaiseQueryForMaterial = (matId: string, projId: string) => {
    setPreselectedMaterialId(matId);
    setPreselectedProjectId(projId);
    setIsRaiseQueryOpen(true);
  };

  const handleOpenGeneralRaiseQuery = () => {
    setPreselectedMaterialId(undefined);
    setPreselectedProjectId(selectedProjectId !== 'all' ? selectedProjectId : undefined);
    setIsRaiseQueryOpen(true);
  };

  // Site queries are communicated in-app only: the other party gets a bell notification and a pop-up.
  const notifyQueryEvent = (
    type: 'query-raised' | 'query-reply' | 'query-status',
    query: Pick<SiteQuery, 'id' | 'projectId' | 'urgency'>,
    title: string,
    message: string
  ) => {
    fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        queryId: query.id,
        projectId: query.projectId,
        urgency: query.urgency,
        senderId: currentUser.id,
        title,
        message: message.length > 220 ? `${message.slice(0, 217)}...` : message,
      }),
    })
      .then(() => notificationsRefresh.current?.())
      .catch(() => {
        // the query itself is saved; the notification is best-effort
      });
  };

  const queryTimestamp = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };
  const roleLabel = () => (currentUser.role === 'admin' ? 'Central Admin' : 'Site Manager');

  const handleRaiseQuery = (newQueryData: Omit<SiteQuery, 'id' | 'createdAt' | 'responses' | 'status'>) => {
    const newQuery: SiteQuery = {
      ...newQueryData,
      id: `query-${Date.now()}`,
      status: 'Open',
      createdAt: queryTimestamp(),
      authorEmail: currentUser.email,
      responses: [],
    };

    setQueries((prev) => [newQuery, ...prev]);
    setActiveTab('queries');
    setQueryFocus({ queryId: newQuery.id, nonce: Date.now() });

    notifyQueryEvent(
      'query-raised',
      newQuery,
      `New ${newQuery.urgency.toLowerCase()} query: ${newQuery.subject}`,
      `${currentUser.name} (${roleLabel()}) raised a query for ${newQuery.projectName}${newQuery.materialName ? ` about ${newQuery.materialName}` : ''}.`
    );
  };

  const handleAddQueryResponse = (queryId: string, message: string) => {
    const targetQuery = queries.find((q) => q.id === queryId);
    const newResponse: QueryResponse = {
      id: `resp-${Date.now()}`,
      authorUserId: currentUser.id,
      authorName: currentUser.name,
      authorRole: currentUser.role,
      message,
      createdAt: queryTimestamp(),
    };

    setQueries((prev) => prev.map((q) => (q.id === queryId ? { ...q, responses: [...q.responses, newResponse] } : q)));

    if (targetQuery) {
      notifyQueryEvent(
        'query-reply',
        targetQuery,
        `${currentUser.name} replied: ${targetQuery.subject}`,
        `"${message}"`
      );
    }
  };

  const handleUpdateQueryStatus = (queryId: string, status: SiteQuery['status']) => {
    const targetQuery = queries.find((q) => q.id === queryId);
    setQueries((prev) => prev.map((q) => (q.id === queryId ? { ...q, status } : q)));

    if (targetQuery && targetQuery.status !== status) {
      notifyQueryEvent(
        'query-status',
        targetQuery,
        `Query ${status === 'Resolved' ? 'resolved' : `marked ${status}`}: ${targetQuery.subject}`,
        `${currentUser.name} (${roleLabel()}) changed the status of this ${targetQuery.projectName} query to ${status}.`
      );
    }
  };


  useEffect(() => {
    const root = window.document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('builder_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('builder_theme', 'light');
    }
  }, [darkMode]);

  // Action: Add a Project
  const handleAddProject = (newProj: Omit<Project, 'id'> & { managerEmail?: string; managerPassword?: string }) => {
    const id = `proj-${Date.now()}`;
    const smId = `sm-${Date.now()}`;
    const project: Project = { 
      id, 
      name: newProj.name,
      location: newProj.location,
      manager: newProj.manager,
      managerId: smId,
      managerEmail: newProj.managerEmail,
      managerPassword: newProj.managerPassword,
      startDate: newProj.startDate,
      status: newProj.status,
      createdByAdminId: currentUser?.id,
    };
    setProjects(prev => [...prev, project]);
    setSelectedProjectId(id); // Auto select the newly created site

    // If site manager credentials provided by admin, store as Site Manager User
    if (newProj.managerEmail && newProj.managerPassword) {
      const newManagerUser: User = {
        id: smId,
        name: newProj.manager,
        email: newProj.managerEmail,
        password: newProj.managerPassword,
        role: 'site_manager',
        title: `Site Engineer (${newProj.name})`,
        assignedProjectId: id,
      };

      setUsers(prev => {
        const existingIdx = prev.findIndex(u => u.email.toLowerCase() === newProj.managerEmail?.toLowerCase());
        if (existingIdx !== -1) {
          const updated = [...prev];
          const updatedUser = {
            ...updated[existingIdx],
            password: newProj.managerPassword,
            assignedProjectId: id,
            name: newProj.manager,
          };
          updated[existingIdx] = updatedUser;
          return updated;
        }
        return [...prev, newManagerUser];
      });
    }
  };

  // Action: Assign or Re-assign Site Manager to Project
  const handleAssignManager = (projectId: string, managerUser: User) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id === projectId) {
          const updated: Project = {
            ...p,
            manager: managerUser.name,
            managerId: managerUser.id,
            managerEmail: managerUser.email,
            managerPassword: managerUser.password || p.managerPassword || 'site123password',
          };
          return updated;
        }
        return p;
      })
    );

    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === managerUser.id) {
          const updatedUser: User = { ...u, assignedProjectId: projectId };
          return updatedUser;
        }
        return u;
      })
    );
  };

  // Action: Add a Material
  // Bulk upload (admin): apply a validated import plan. State changes are saved to MongoDB by the normal sync.
  const handleApplyMaterialImport = (plan: MaterialImportPlan) => {
    const removeMat = new Set(plan.removeMaterialIds);
    const removeTx = new Set(plan.removeTransactionIds);
    const updates = new Map(plan.update.map((m) => [m.id, m]));
    setMaterials((prev) => [
      ...plan.add,
      ...prev.filter((m) => !removeMat.has(m.id)).map((m) => updates.get(m.id) || m),
    ]);
    if (removeTx.size) setTransactions((prev) => prev.filter((t) => !removeTx.has(t.id)));
  };

  const handleApplyVendorImport = (plan: VendorImportPlan) => {
    const removeIds = new Set(plan.removeVendorIds);
    const updates = new Map(plan.update.map((v) => [v.id, v]));
    setVendors((prev) => [
      ...plan.add,
      ...prev.filter((v) => !removeIds.has(v.id)).map((v) => updates.get(v.id) || v),
    ]);
  };

  const handleAddMaterial = (newMat: Omit<Material, 'id' | 'currentStock'> & {
    initialStock: number;
    totalPrice?: number;
    vendorName?: string;
    rateHistory?: RateHistoryPoint[];
    billType?: BillType;
    billNumber?: string;
    gstRate?: number;
    gstAmount?: number;
    baseAmount?: number;
    vendorGstin?: string;
  }) => {
    const id = `mat-${Date.now()}`;
    const todayStr = new Date().toISOString().split('T')[0];
    const computedTotal = newMat.totalPrice || (newMat.unitCost * newMat.initialStock);
    const chosenBillType: BillType = newMat.billType || 'GST';
    const chosenBillNumber = newMat.billNumber || (chosenBillType === 'GST' ? `GST-${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}` : `URD-VCH-${Math.floor(100 + Math.random() * 900)}`);
    const chosenGstRate = chosenBillType === 'GST' ? (newMat.gstRate !== undefined ? newMat.gstRate : 18) : 0;
    const computedBase = newMat.baseAmount !== undefined ? newMat.baseAmount : (chosenBillType === 'GST' ? Number((computedTotal / (1 + chosenGstRate / 100)).toFixed(2)) : computedTotal);
    const computedGst = newMat.gstAmount !== undefined ? newMat.gstAmount : Number((computedTotal - computedBase).toFixed(2));

    const initialRatePoint: RateHistoryPoint = {
      id: `pt-${id}-0`,
      date: todayStr,
      rate: newMat.unitCost,
      quantity: newMat.initialStock,
      totalPrice: computedTotal,
      vendorName: newMat.vendorName || (chosenBillType === 'GST' ? 'Authorized GST Supplier' : 'Local Unregistered Supplier'),
      notes: `Initial catalog registration (${chosenBillType} Bill #${chosenBillNumber})`,
      billType: chosenBillType,
      billNumber: chosenBillNumber,
      gstRate: chosenGstRate,
      gstAmount: computedGst,
      baseAmount: computedBase,
      vendorGstin: newMat.vendorGstin,
    };

    const material: Material = {
      id,
      projectId: newMat.projectId,
      name: newMat.name,
      category: newMat.category,
      unit: newMat.unit,
      currentStock: newMat.initialStock,
      minThreshold: newMat.minThreshold,
      unitCost: newMat.unitCost,
      totalPrice: computedTotal,
      vendorName: newMat.vendorName,
      materialCode: newMat.materialCode,
      materialGroup: newMat.materialGroup,
      billType: chosenBillType,
      billNumber: chosenBillNumber,
      gstRate: chosenGstRate,
      gstAmount: computedGst,
      baseAmount: computedBase,
      vendorGstin: newMat.vendorGstin,
      rateHistory: newMat.rateHistory || [initialRatePoint],
    };

    setMaterials(prev => [...prev, material]);

    // If initial stock was provided, record an addition transaction
    if (newMat.initialStock > 0) {
      const txId = `tx-${Date.now()}`;
      const transaction: InventoryTransaction = {
        id: txId,
        projectId: newMat.projectId,
        materialId: id,
        type: 'addition',
        quantity: newMat.initialStock,
        date: todayStr,
        rate: newMat.unitCost,
        totalPrice: computedTotal,
        baseAmount: computedBase,
        gstRate: chosenGstRate,
        gstAmount: computedGst,
        billType: chosenBillType,
        billNumber: chosenBillNumber,
        vendorGstin: newMat.vendorGstin,
        vendorName: newMat.vendorName || (chosenBillType === 'GST' ? 'Authorized GST Supplier' : 'Local Unregistered Supplier'),
        notes: `Initial stock registration (${chosenBillType} Bill: ${chosenBillNumber})`,
        operator: currentUser?.name || 'Inventory Mobilizer',
      };
      setTransactions(prev => [transaction, ...prev]);
    }
  };

  // Action: Add Rate Point to a Material's Rate History
  const handleAddRatePoint = (materialId: string, point: RateHistoryPoint) => {
    setMaterials(prevMaterials => {
      return prevMaterials.map(mat => {
        if (mat.id === materialId) {
          const existingHistory = mat.rateHistory && mat.rateHistory.length > 0
            ? mat.rateHistory
            : [
                {
                  id: `pt-${mat.id}-init`,
                  date: new Date().toISOString().split('T')[0],
                  rate: mat.unitCost,
                  quantity: mat.currentStock,
                  totalPrice: mat.totalPrice || (mat.unitCost * mat.currentStock),
                  vendorName: mat.vendorName || 'Primary Supplier',
                  notes: 'Baseline rate record',
                }
              ];
          const updatedHistory = [...existingHistory, point];
          const updatedMat: Material = {
            ...mat,
            unitCost: point.rate,
            vendorName: point.vendorName || mat.vendorName,
            totalPrice: point.totalPrice || (point.rate * mat.currentStock),
            rateHistory: updatedHistory,
            marketSourceUrl: point.sourceUrl || mat.marketSourceUrl,
            marketSourceTitle: point.sourceTitle || mat.marketSourceTitle,
            lastMarketSync: point.sourceUrl ? new Date().toISOString() : mat.lastMarketSync,
          };
          return updatedMat;
        }
        return mat;
      });
    });
  };

  // Action: Update Material ERP Code & Group
  const handleUpdateMaterialCode = (
    materialId: string,
    newCode: string,
    newGroup?: string,
    applyToAllSameName: boolean = true
  ) => {
    const targetMat = materials.find((m) => m.id === materialId);
    if (!targetMat) return;

    setMaterials((prevMaterials) => {
      return prevMaterials.map((mat) => {
        const isTarget =
          mat.id === materialId ||
          (applyToAllSameName &&
            mat.name.trim().toLowerCase() === targetMat.name.trim().toLowerCase());

        if (isTarget) {
          const updated: Material = {
            ...mat,
            materialCode: newCode,
            materialGroup: newGroup !== undefined ? newGroup : mat.materialGroup,
          };
          return updated;
        }
        return mat;
      });
    });
  };

  // Action: Remove a Material
  const handleRemoveMaterial = (id: string) => {
    setMaterials(prev => prev.filter(m => m.id !== id));
    // Clean up related transaction logs
    setTransactions(prev => prev.filter(t => t.materialId !== id));
  };

  // Action: Update Material Bill Type (GST vs URD)
  const handleUpdateMaterialBillType = (
    materialId: string,
    billType: BillType,
    billNumber?: string,
    gstRate?: number,
    vendorGstin?: string
  ) => {
    setMaterials((prevMaterials) => {
      return prevMaterials.map((mat) => {
        if (mat.id === materialId) {
          const newGstRate = billType === 'GST' ? (gstRate !== undefined ? gstRate : 18) : 0;
          const currentTotal = mat.totalPrice || (mat.unitCost * mat.currentStock);
          const computedBase = billType === 'GST' ? Number((currentTotal / (1 + newGstRate / 100)).toFixed(2)) : currentTotal;
          const computedGst = Number((currentTotal - computedBase).toFixed(2));

          const updated: Material = {
            ...mat,
            billType,
            billNumber: billNumber !== undefined ? billNumber : mat.billNumber,
            gstRate: newGstRate,
            gstAmount: computedGst,
            baseAmount: computedBase,
            vendorGstin: billType === 'GST' ? (vendorGstin !== undefined ? vendorGstin : mat.vendorGstin) : undefined,
          };
          return updated;
        }
        return mat;
      });
    });
  };

  // Action: Add a Transaction (either addition or consumption)
  const handleAddTransaction = (newTx: Omit<InventoryTransaction, 'id' | 'date'> & { date?: string }) => {
    if (!newTx.notes || !newTx.notes.trim()) {
      alert('Please insert a compulsory reason / note for this stock movement.');
      return;
    }

    const targetMat = materials.find(m => m.id === newTx.materialId);
    if (newTx.type === 'consumption' && targetMat && newTx.quantity > targetMat.currentStock) {
      alert('please insert valid values');
      return;
    }

    const txId = `tx-${Date.now()}`;
    const txDate = newTx.date || new Date().toISOString().split('T')[0];
    const computedTotal = newTx.totalPrice !== undefined ? newTx.totalPrice : (newTx.rate && newTx.quantity ? newTx.rate * newTx.quantity : 0);
    const chosenBillType: BillType = newTx.billType || targetMat?.billType || 'GST';
    const chosenGstRate = chosenBillType === 'GST' ? (newTx.gstRate !== undefined ? newTx.gstRate : (targetMat?.gstRate || 18)) : 0;
    const computedBase = newTx.baseAmount !== undefined ? newTx.baseAmount : (chosenBillType === 'GST' ? Number((computedTotal / (1 + chosenGstRate / 100)).toFixed(2)) : computedTotal);
    const computedGst = newTx.gstAmount !== undefined ? newTx.gstAmount : Number((computedTotal - computedBase).toFixed(2));

    const transaction: InventoryTransaction = {
      id: txId,
      projectId: newTx.projectId,
      materialId: newTx.materialId,
      type: newTx.type,
      quantity: newTx.quantity,
      date: txDate,
      notes: newTx.notes,
      operator: newTx.operator,
      rate: newTx.rate,
      totalPrice: computedTotal,
      baseAmount: computedBase,
      gstRate: chosenGstRate,
      gstAmount: computedGst,
      billType: chosenBillType,
      billNumber: newTx.billNumber || targetMat?.billNumber,
      vendorGstin: newTx.vendorGstin || targetMat?.vendorGstin,
      vendorName: newTx.vendorName || targetMat?.vendorName,
      invoiceUrl: newTx.invoiceUrl,
      invoiceFileName: newTx.invoiceFileName,
    };

    // Update material currentStock level and append rateHistory point if rate is provided
    setMaterials(prevMaterials => {
      return prevMaterials.map(mat => {
        if (mat.id === newTx.materialId) {
          const delta = newTx.type === 'addition' ? newTx.quantity : -newTx.quantity;
          const updatedStock = Math.max(0, mat.currentStock + delta);
          
          let newRateHistory = mat.rateHistory || [];
          if (newTx.type === 'addition' && newTx.rate && newTx.rate > 0) {
            newRateHistory = [
              ...newRateHistory,
              {
                id: `rh-${Date.now()}`,
                date: txDate,
                rate: newTx.rate,
                quantity: newTx.quantity,
                totalPrice: computedTotal,
                baseAmount: computedBase,
                gstRate: chosenGstRate,
                gstAmount: computedGst,
                billType: chosenBillType,
                billNumber: newTx.billNumber || mat.billNumber,
                vendorGstin: newTx.vendorGstin || mat.vendorGstin,
                vendorName: newTx.vendorName || mat.vendorName,
                notes: newTx.notes,
              }
            ];
          }

          const updatedMat = {
            ...mat,
            currentStock: Number(updatedStock.toFixed(3)), // Guard against float precision issues
            unitCost: (newTx.type === 'addition' && newTx.rate && newTx.rate > 0) ? newTx.rate : mat.unitCost,
            vendorName: newTx.vendorName ? newTx.vendorName : mat.vendorName,
            billType: newTx.billType || mat.billType,
            billNumber: newTx.billNumber || mat.billNumber,
            gstRate: chosenGstRate,
            gstAmount: computedGst,
            baseAmount: computedBase,
            vendorGstin: newTx.vendorGstin || mat.vendorGstin,
            rateHistory: newRateHistory,
          };
          return updatedMat;
        }
        return mat;
      });
    });

    setTransactions(prev => [transaction, ...prev]);
  };

  // Action: Add Bill Inward Transaction directly
  const handleAddBillTransaction = (
    txData: Omit<InventoryTransaction, 'id'> & { materialId: string }
  ) => {
    handleAddTransaction(txData);
  };

  // Action: Remove/Revert a Transaction
  const handleRemoveTransaction = (txId: string) => {
    const txToRevert = transactions.find(t => t.id === txId);
    if (!txToRevert) return;

    // Update material stock in reverse direction
    setMaterials(prevMaterials => {
      return prevMaterials.map(mat => {
        if (mat.id === txToRevert.materialId) {
          const delta = txToRevert.type === 'addition' ? -txToRevert.quantity : txToRevert.quantity;
          const updatedStock = Math.max(0, mat.currentStock + delta);
          // A deleted purchase also disappears from the material's rate history (rate graph)
          let rateHistory = mat.rateHistory;
          if (txToRevert.type === 'addition' && rateHistory?.length) {
            const idx = rateHistory.findIndex(
              (p) =>
                p.date === txToRevert.date &&
                Number(p.quantity) === Number(txToRevert.quantity) &&
                (p.billNumber || '') === (txToRevert.billNumber || '')
            );
            if (idx >= 0) rateHistory = rateHistory.filter((_, i) => i !== idx);
          }
          const updatedMat = {
            ...mat,
            currentStock: Number(updatedStock.toFixed(3)),
            rateHistory,
          };
          return updatedMat;
        }
        return mat;
      });
    });

    setTransactions(prev => prev.filter(t => t.id !== txId));
  };

  // Quick Inline Transaction trigger
  const handleQuickTransaction = (
    materialId: string,
    type: 'addition' | 'consumption',
    qty: number,
    notes: string,
    details?: {
      rate?: number;
      totalPrice?: number;
      baseAmount?: number;
      gstRate?: number;
      gstAmount?: number;
      billType?: BillType;
      billNumber?: string;
      vendorGstin?: string;
      vendorName?: string;
      invoiceUrl?: string;
      invoiceFileName?: string;
    }
  ) => {
    const mat = materials.find(m => m.id === materialId);
    if (!mat) return;

    if (!notes || !notes.trim()) {
      alert('Please insert a compulsory reason / note for this stock movement.');
      return;
    }

    if (type === 'consumption' && qty > mat.currentStock) {
      alert('please insert valid values');
      return;
    }

    handleAddTransaction({
      projectId: mat.projectId,
      materialId,
      type,
      quantity: qty,
      notes: notes.trim(),
      operator: currentUser?.name || 'Site Foreman',
      rate: details?.rate,
      totalPrice: details?.totalPrice,
      baseAmount: details?.baseAmount,
      gstRate: details?.gstRate,
      gstAmount: details?.gstAmount,
      billType: details?.billType,
      billNumber: details?.billNumber,
      vendorGstin: details?.vendorGstin,
      vendorName: details?.vendorName,
      invoiceUrl: details?.invoiceUrl,
      invoiceFileName: details?.invoiceFileName,
    });
  };

  // If user is not logged in, directly redirect to Login Page
  if (!isLoggedIn) {
    return (
      <LoginPage
        users={users}
        projects={projects}
        isLiveDatabase={isLiveDatabase}
        onLoginSuccess={(user) => {
          const cleanName = user.role === 'admin'
            ? 'Admin'
            : (user.name === 'Vikramaditya Rao' ? 'Admin' : (user.name === 'Rajesh Sharma' || user.id === 'sm-1' ? 'Site Manager 1' : (user.name === 'Ananya Goel' || user.id === 'sm-2' ? 'Site Manager 2' : (user.name === 'David Miller' || user.id === 'sm-3' ? 'Site Manager 3' : (user.name.startsWith('Site Manager') ? user.name : 'Site Manager')))));
          const sanitizedUser = { ...user, name: cleanName };
          setCurrentUser(sanitizedUser);
          if (user.assignedProjectId) {
            setSelectedProjectId(user.assignedProjectId);
          }
          setActiveTab('catalog');
          setIsLoggedIn(true);
        }}
        onRegisterAdmin={(newAdminData) => {
          const id = `admin-${Date.now()}`;
          const newAdminUser: User = { id, ...newAdminData };
          setUsers((prev) => [...prev, newAdminUser]);
          setCurrentUser(newAdminUser);
          setActiveTab('catalog');
          setIsLoggedIn(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 transition-colors duration-250 font-sans pb-12">
      {/* Dynamic Glassmorphism Banner Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 py-3.5 px-4 sm:px-8 shadow-xs">

        <div className="max-w-7xl mx-auto flex items-center justify-between">
          
          {/* Logo & Headline */}
          <div className="flex items-center gap-3">
            <img src={vyasLogo} alt="Vyas Group logo" className="h-10 sm:h-12 w-auto object-contain shrink-0" />
            <div>
              <h1 className="text-xl font-logo uppercase tracking-tight">
                <span className="text-indigo-900">PRAVAH</span>
              </h1>
              <p className="text-xs text-slate-500 font-semibold">
                Construction Material Consumption & Supply Ledger Dashboard
              </p>
            </div>
          </div>

          {/* User Account Login & Logout Controls */}
          <div className="flex items-center gap-2">
            <NotificationCenter
              currentUser={currentUser}
              projectId={currentUser.role === 'site_manager' ? currentUser.assignedProjectId : undefined}
              registerRefresh={registerNotificationsRefresh}
              onOpen={(link) => {
                if (link.view === 'queries') {
                  setActiveTab('queries');
                  if (link.queryId) setQueryFocus({ queryId: link.queryId, nonce: Date.now() });
                  return;
                }
                setActiveTab('order-queries');
                setOrderFocus({ ...link, nonce: Date.now() });
                if (link.view === 'pos') setPoRefreshKey((k) => k + 1);
              }}
            />
            {/* Signed-in user */}
            <div
              id="header-user"
              className="h-10 pl-1.5 pr-1.5 sm:pr-3 flex items-center gap-2.5 bg-white border border-slate-200 rounded-lg shrink-0"
            >
              <div className="w-7 h-7 rounded-md bg-[#23408e] text-white text-xs font-bold flex items-center justify-center shrink-0" aria-hidden="true">
                {currentUser.role === 'admin' ? 'A' : (currentUser.name || 'S').trim().charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:flex items-center gap-2 leading-tight">
                <span className="text-sm font-semibold text-slate-900">
                  {currentUser.role === 'admin'
                    ? 'Admin'
                    : (currentUser.name && currentUser.name.startsWith('Site Manager')
                        ? currentUser.name
                        : (currentUser.id === 'sm-1'
                            ? 'Site Manager 1'
                            : (currentUser.id === 'sm-2'
                                ? 'Site Manager 2'
                                : (currentUser.id === 'sm-3'
                                    ? 'Site Manager 3'
                                    : 'Site Manager'))))}
                </span>
                {currentUser.role !== 'admin' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]">
                    Site Manager
                  </span>
                )}
              </div>
            </div>

            <button
              id="btn-header-logout"
              onClick={() => setIsLoggedIn(false)}
              aria-label="Log out"
              title="Log out"
              className="w-10 h-10 flex items-center justify-center bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <LogOut size={18} />
            </button>
          </div>

        </div>
      </header>

      {/* Main Core Dashboard Stage */}
      <main className="w-full max-w-[1750px] mx-auto px-4 sm:px-6 lg:px-8 mt-6 space-y-6">
        
        {/* Project Selector Zone */}
        <ProjectSelector
          projects={userVisibleProjects}
          selectedProjectId={selectedProjectId}
          currentUser={currentUser}
          users={users}
          materials={userVisibleMaterials}
          contractors={userVisibleContractors}
          transactions={userVisibleTransactions}
          onSelectProject={setSelectedProjectId}
          onAddProject={handleAddProject}
        />

        {/* Real-time Statistics Cards */}
        <StatsGrid
          materials={userVisibleMaterials}
          transactions={userVisibleTransactions}
          contractors={userVisibleContractors}
          selectedProjectId={selectedProjectId}
          currentUser={currentUser}
          isAdmin={currentUser.role === 'admin'}
          onLowStockClick={handleLowStockClick}
          onReorderClick={handleReorderClick}
          onDailyActivitiesClick={handleDailyActivitiesClick}
        />

        {/* Modular Navigation Tabs with indicators */}
        <div className="flex gap-1 border-b border-slate-200 mt-2 overflow-x-auto" id="navigation-tabs">
          <button
            id="tab-catalog"
            onClick={() => {
              setActiveTab('catalog');
              setStockFilterMode('all');
            }}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'catalog'
                ? 'border-[#23408e] text-[#23408e] bg-[#f5f8fd]'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <BookOpen size={14} />
            Procurements ({
              selectedProjectId === 'all'
                ? userVisibleMaterials.length
                : userVisibleMaterials.filter(m => m.projectId === selectedProjectId).length
            })
          </button>

          <button
            id="tab-order-queries"
            onClick={() => setActiveTab('order-queries')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'order-queries'
                ? 'border-[#23408e] text-[#23408e] bg-[#f5f8fd]'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <ShoppingCart size={14} />
            Order Queries & Quotes ({prs.length})
            {prs.filter((p) => p.status !== 'Awarded' && p.status !== 'Closed').length > 0 && (
              <span className="ml-1 px-2 py-0.5 text-[10px] bg-[#23408e] text-white rounded-full font-semibold">
                {prs.filter((p) => p.status !== 'Awarded' && p.status !== 'Closed').length} Active
              </span>
            )}
          </button>

          <button
            id="tab-procurement"
            onClick={() => setActiveTab('procurement')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'procurement'
                ? 'border-[#23408e] text-[#23408e] bg-[#f5f8fd]'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Building2 size={14} />
            Contracts ({
              selectedProjectId === 'all'
                ? userVisibleContractors.length
                : userVisibleContractors.filter(c => c.projectId === selectedProjectId).length
            })
          </button>

          <button
            id="tab-transfer"
            onClick={() => setActiveTab('transfer')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'transfer'
                ? 'border-[#23408e] text-[#23408e] bg-[#f5f8fd]'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Truck size={14} />
            Internal Transfer ({userVisibleTransfers.length})
          </button>

          <button
            id="tab-gst-urd"
            onClick={() => setActiveTab('gst-urd')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'gst-urd'
                ? 'border-[#23408e] text-[#23408e] bg-[#f5f8fd]'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Receipt size={14} />
            GST & URD Bills
          </button>

          <button
            id="tab-codes"
            onClick={() => setActiveTab('codes')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'codes'
                ? 'border-[#23408e] text-[#23408e] bg-[#f5f8fd]'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Hash size={14} />
            Material Code Summary
          </button>

          <button
            id="tab-ledger"
            onClick={() => {
              setActiveTab('ledger');
              setTodayTxFilter(false);
            }}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'ledger'
                ? 'border-[#23408e] text-[#23408e] bg-[#f5f8fd]'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <History size={14} />
            Daily Ledger ({
              selectedProjectId === 'all'
                ? userVisibleTransactions.length
                : userVisibleTransactions.filter(t => t.projectId === selectedProjectId).length
            })
          </button>

          <button
            id="tab-queries"
            onClick={() => setActiveTab('queries')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'queries'
                ? 'border-[#23408e] text-[#23408e] bg-[#f5f8fd]'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <MessageSquare size={14} />
            Query Material & Issues ({userVisibleQueries.length})
            {userVisibleQueries.filter((q) => q.status === 'Open').length > 0 && (
              <span className="ml-1 px-2 py-0.5 text-[10px] bg-amber-50 text-amber-800 border border-amber-200 rounded-full font-semibold">
                {userVisibleQueries.filter((q) => q.status === 'Open').length} Open
              </span>
            )}
          </button>

          <button
            id="tab-analytics"
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'analytics'
                ? 'border-[#23408e] text-[#23408e] bg-[#f5f8fd]'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <TrendingUp size={14} />
            Visual Analytics
          </button>

          {currentUser.role === 'admin' && (
            <button
              id="tab-admin-manager"
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'admin'
                  ? 'border-[#23408e] text-[#23408e] bg-[#f5f8fd]'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <ShieldCheck size={14} />
              Site Manager Directory & Credential Mails
            </button>
          )}
        </div>

        {/* Animated Main Content Stage */}
        <div className="mt-4" id="main-content-display">
          <AnimatePresence mode="wait">
            {activeTab === 'catalog' && (
              <motion.div
                key="catalog-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <MaterialList
                  materials={userVisibleMaterials}
                  projects={userVisibleProjects}
                  transactions={userVisibleTransactions}
                  selectedProjectId={selectedProjectId}
                  currentUser={currentUser}
                  onAddMaterial={handleAddMaterial}
                  onRemoveMaterial={handleRemoveMaterial}
                  onQuickTransaction={handleQuickTransaction}
                  onOpenRaiseQueryModalForMaterial={handleOpenRaiseQueryForMaterial}
                  onOpenOrderQueryForMaterial={handleOpenOrderQueryForMaterial}
                  onAddRatePoint={handleAddRatePoint}
                  stockFilterMode={stockFilterMode}
                  onStockFilterChange={setStockFilterMode}
                  lowStockOnlyFilter={stockFilterMode === 'low'}
                  onClearLowStockFilter={() => setStockFilterMode('all')}
                  onToggleLowStockFilter={(enable) => setStockFilterMode(enable ? 'low' : 'all')}
                  bulkUpload={
                    currentUser.role === 'admin'
                      ? {
                          projects,
                          materials,
                          transactions,
                          vendors,
                          prs,
                          quotes,
                          onApplyMaterials: handleApplyMaterialImport,
                          onApplyVendors: handleApplyVendorImport,
                        }
                      : undefined
                  }
                />
              </motion.div>
            )}

            {activeTab === 'order-queries' && (
              <motion.div
                key="order-queries-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <OrderQueryComparisonCenter
                  prs={prs}
                  vendors={vendors}
                  quotes={quotes}
                  marketBenchmarks={marketBenchmarks}
                  projects={userVisibleProjects}
                  materials={userVisibleMaterials}
                  currentUser={currentUser}
                  onOpenNewPR={() => {
                    setOrderQueryMaterial(null);
                    setIsOrderQueryOpen(true);
                  }}
                  onOpenSubmitQuote={(pr) => {
                    setQuoteModalPR(pr);
                    setIsQuoteModalOpen(true);
                  }}
                  onAwardPR={handleAwardPR}
                  onRecordDelivery={handleRecordDelivery}
                  onRetryPurchaseOrder={handleRetryPurchaseOrder}
                  poRefreshKey={poRefreshKey}
                  focusRequest={orderFocus}
                />
              </motion.div>
            )}

            {activeTab === 'procurement' && (
              <motion.div
                key="procurement-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <ProcurementContracts
                  contractors={userVisibleContractors}
                  projects={userVisibleProjects}
                  selectedProjectId={selectedProjectId}
                  currentUser={currentUser}
                  onAddContractor={handleAddContractor}
                  onUpdateContractorBilling={handleUpdateContractorBilling}
                  onOpenRaiseQueryModalForContractor={handleOpenRaiseQueryForContractor}
                  onDeleteContractor={handleDeleteContractor}
                />
              </motion.div>
            )}

            {activeTab === 'transfer' && (
              <motion.div
                key="transfer-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <InternalTransfer
                  transfers={userVisibleTransfers}
                  projects={projects}
                  materials={materials}
                  selectedProjectId={selectedProjectId}
                  currentUser={currentUser}
                  onAddTransfer={handleAddTransfer}
                  onUpdateTransferStatus={handleUpdateTransferStatus}
                  onDeleteTransfer={(id) => setTransfers((prev) => prev.filter((t) => t.id !== id))}
                />
              </motion.div>
            )}

            {activeTab === 'gst-urd' && (
              <motion.div
                key="gst-urd-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <GstUrdBillsSummary
                  materials={userVisibleMaterials}
                  transactions={userVisibleTransactions}
                  projects={userVisibleProjects}
                  selectedProjectId={selectedProjectId}
                  currentUser={currentUser}
                  onUpdateMaterialBillType={handleUpdateMaterialBillType}
                  onAddBillTransaction={handleAddBillTransaction}
                  onDeleteBill={(bill) => {
                    if (bill.sourceType === 'transaction') handleRemoveTransaction(bill.sourceId);
                    else setMaterials((prev) => prev.map((m) => (m.id === bill.sourceId ? { ...m, baseBillRemoved: true } : m)));
                  }}
                />
              </motion.div>
            )}

            {activeTab === 'codes' && (
              <motion.div
                key="codes-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <MaterialCodeSummary
                  materials={userVisibleMaterials}
                  transactions={userVisibleTransactions}
                  projects={userVisibleProjects}
                  selectedProjectId={selectedProjectId}
                  currentUser={currentUser}
                  onUpdateMaterialCode={handleUpdateMaterialCode}
                  onQuickTransaction={handleQuickTransaction}
                />
              </motion.div>
            )}

            {activeTab === 'ledger' && (
              <motion.div
                key="ledger-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <TransactionHistory
                  transactions={userVisibleTransactions}
                  materials={userVisibleMaterials}
                  projects={userVisibleProjects}
                  selectedProjectId={selectedProjectId}
                  onAddTransaction={handleAddTransaction}
                  onRemoveTransaction={handleRemoveTransaction}
                  todayOnlyFilter={todayTxFilter}
                  onClearTodayFilter={() => setTodayTxFilter(false)}
                  onToggleTodayFilter={(enable) => setTodayTxFilter(enable)}
                />
              </motion.div>
            )}

            {activeTab === 'queries' && (
              <motion.div
                key="queries-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <QueryCenter
                  queries={userVisibleQueries}
                  currentUser={currentUser}
                  onOpenRaiseQueryModal={handleOpenGeneralRaiseQuery}
                  onAddResponse={handleAddQueryResponse}
                  onUpdateStatus={handleUpdateQueryStatus}
                  focusRequest={queryFocus}
                />
              </motion.div>
            )}

            {activeTab === 'analytics' && (
              <motion.div
                key="analytics-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <StockAnalytics
                  materials={userVisibleMaterials}
                  transactions={userVisibleTransactions}
                  selectedProjectId={selectedProjectId}
                />
              </motion.div>
            )}

            {activeTab === 'admin' && currentUser.role === 'admin' && (
              <motion.div
                key="admin-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <AdminProjectManager
                  projects={projects}
                  users={users}
                  onAssignManager={handleAssignManager}
                  onOpenAddProject={() => {
                    // Open create project modal
                    const addBtn = document.getElementById('btn-add-new-project');
                    if (addBtn) addBtn.click();
                  }}
                  onOpenAddSiteManager={() => {
                    setIsAuthOpen(true);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Raise Query Modal */}
      <RaiseQueryModal
        isOpen={isRaiseQueryOpen}
        onClose={() => setIsRaiseQueryOpen(false)}
        currentUser={currentUser}
        projects={userVisibleProjects}
        materials={userVisibleMaterials}
        selectedProjectId={preselectedProjectId || (selectedProjectId !== 'all' ? selectedProjectId : undefined)}
        preselectedMaterialId={preselectedMaterialId}
        onRaiseQuery={handleRaiseQuery}
      />

      {/* Order Query / Project Requirement Modal */}
      <OrderQueryModal
        isOpen={isOrderQueryOpen}
        onClose={() => {
          setIsOrderQueryOpen(false);
          setOrderQueryMaterial(null);
        }}
        currentUser={currentUser}
        projects={userVisibleProjects}
        materials={userVisibleMaterials}
        vendors={vendors}
        marketBenchmarks={marketBenchmarks}
        material={orderQueryMaterial}
        onCreatePR={handleCreatePR}
      />

      {/* Vendor Quote Submission Modal (mounted only while open so its form state starts fresh) */}
      {isQuoteModalOpen && quoteModalPR && (
        <VendorQuoteModal
          isOpen={isQuoteModalOpen}
          onClose={() => {
            setIsQuoteModalOpen(false);
            setQuoteModalPR(null);
          }}
          pr={quoteModalPR}
          vendors={vendors}
          marketBenchmarks={marketBenchmarks}
          existingQuotes={quotes}
          currentUser={currentUser}
          onSubmitQuote={handleSubmitQuote}
        />
      )}


      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        users={users}
        projects={projects}
        currentUser={currentUser}
        onSelectUser={(user) => {
          setCurrentUser(user);
          localStorage.setItem('builder_current_user', JSON.stringify(user));
        }}
        onAddSiteManager={(newManager) => {
          const id = `sm-${Date.now()}`;
          const managerUser: User = { id, ...newManager };
          setUsers((prev) => [...prev, managerUser]);
        }}
        onLogout={() => setIsLoggedIn(false)}
      />

      {/* Footer System Lines */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16 pt-8 border-t border-slate-200 dark:border-slate-800 text-center text-[11px] font-medium text-slate-400 dark:text-slate-600">
        <p>© 2026 PRAVAH Workspace. Hand-engineered for site operations, materials budgeting, and physical stocks recording.</p>
      </footer>

      {/* Floating AI Assistant Chatbot at bottom-right corner with full application context */}
      <FloatingChatbot
        projects={userVisibleProjects}
        materials={userVisibleMaterials}
        transactions={userVisibleTransactions}
        contractors={userVisibleContractors}
        transfers={userVisibleTransfers}
        queries={userVisibleQueries}
        vendors={vendors}
        quotes={quotes}
        marketBenchmarks={marketBenchmarks}
        prs={prs}
        currentUser={currentUser}
        selectedProjectId={selectedProjectId}
      />

      {/* Direct Award Success Toast Notification */}
      <AnimatePresence>
        {awardToast && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="fixed bottom-6 left-6 z-50 max-w-md bg-slate-950 text-white p-4 rounded-2xl shadow-2xl border border-emerald-500/60 flex items-start gap-3.5"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0 font-black">
              ✓
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-black text-emerald-400 uppercase tracking-wide">
                  Awarded • {awardToast.poNumber} Issued
                </h4>
                <button
                  onClick={() => setAwardToast(null)}
                  className="text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-slate-200 mt-1 font-semibold">
                Awarded to <strong className="text-white">{awardToast.vendorName}</strong> for{' '}
                <strong className="text-amber-300">{awardToast.materialName}</strong>.
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                {awardToast.emailStatus === 'sent' ? (
                  <>Purchase order emailed to <span className="text-sky-300 font-mono">{awardToast.vendorEmail}</span></>
                ) : awardToast.emailStatus === 'failed' ? (
                  <>Purchase order saved; email failed - download it and send manually</>
                ) : (
                  <>Purchase order saved (no vendor email to send it to)</>
                )}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
