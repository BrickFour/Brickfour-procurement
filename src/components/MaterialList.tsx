import { useState, useMemo, FormEvent, Fragment, ReactNode } from 'react';
import { Material, MaterialCategory, Project, User, InventoryTransaction, RateHistoryPoint, BillType, Vendor, ProjectRequirement, VendorQuotation, MaterialVerification } from '../types';
import MaterialVerificationPanel, { newVerificationDraft, verificationError, toVerification, VerificationDraft } from './MaterialVerificationPanel';
import { Search, Filter, Plus, Trash2, ArrowUpRight, ArrowDownLeft, AlertCircle, AlertTriangle, Bell, X, HelpCircle, Lock, TrendingUp, Hash, Receipt, FileText, Check, ShoppingCart, BookOpen, Upload, Users } from 'lucide-react';
import BulkUploadModal from './BulkUploadModal';
import type { MaterialImportPlan, VendorImportPlan } from '../lib/bulkImport';
import { motion, AnimatePresence } from 'motion/react';
import MaterialRateGraphModal from './MaterialRateGraphModal';
import { resolveMaterialCode, STANDARD_MATERIAL_GROUPS, formatMaterialCode } from '../lib/materialCodes';
import { calculateBillFinancials, resolveMaterialBillType, STANDARD_GST_RATES } from '../lib/billUtils';

interface MaterialListProps {
  materials: Material[];
  projects: Project[];
  transactions?: InventoryTransaction[];
  selectedProjectId: string;
  currentUser?: User;
  onAddMaterial: (newMaterial: Omit<Material, 'id' | 'currentStock'> & {
    initialStock: number;
    totalPrice?: number;
    vendorName?: string;
    rateHistory?: RateHistoryPoint[];
    materialCode?: string;
    materialGroup?: string;
    billType?: BillType;
    billNumber?: string;
    gstRate?: number;
    gstAmount?: number;
    baseAmount?: number;
    vendorGstin?: string;
  }) => void;
  onRemoveMaterial: (id: string) => void;
  onQuickTransaction: (
    materialId: string,
    type: 'addition' | 'consumption',
    qty: number,
    notes: string,
    details?: {
      rate?: number;
      totalPrice?: number;
      vendorName?: string;
      invoiceUrl?: string;
      invoiceFileName?: string;
      billType?: BillType;
      billNumber?: string;
      gstRate?: number;
      gstAmount?: number;
      baseAmount?: number;
      vendorGstin?: string;
      verification?: MaterialVerification;
    }
  ) => void;
  onOpenRaiseQueryModalForMaterial?: (materialId: string, projectId: string) => void;
  onOpenOrderQueryForMaterial?: (material: Material) => void;
  onAddRatePoint?: (materialId: string, point: RateHistoryPoint) => void;
  lowStockOnlyFilter?: boolean;
  onClearLowStockFilter?: () => void;
  onToggleLowStockFilter?: (enable: boolean) => void;
  stockFilterMode?: 'all' | 'low' | 'reorder';
  onStockFilterChange?: (mode: 'all' | 'low' | 'reorder') => void;
  /** Admin only: data and handlers for bulk material / vendor upload */
  bulkUpload?: {
    projects: Project[];
    materials: Material[];
    transactions: InventoryTransaction[];
    vendors: Vendor[];
    prs: ProjectRequirement[];
    quotes: VendorQuotation[];
    onApplyMaterials: (plan: MaterialImportPlan) => void;
    onApplyVendors: (plan: VendorImportPlan) => void;
  };
}

const CATEGORIES: MaterialCategory[] = ['Structural', 'Finishing', 'Masonry', 'Plumbing', 'Electrical', 'Others'];

// Same KPI tile as the Order Queries & Quotes tab
function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 break-words">{value}</p>
      <span className="text-[11px] text-slate-500">{hint}</span>
    </div>
  );
}

export default function MaterialList({
  materials,
  projects,
  transactions = [],
  selectedProjectId,
  currentUser,
  onAddMaterial,
  onRemoveMaterial,
  onQuickTransaction,
  onOpenRaiseQueryModalForMaterial,
  onOpenOrderQueryForMaterial,
  onAddRatePoint,
  lowStockOnlyFilter,
  onClearLowStockFilter,
  onToggleLowStockFilter,
  stockFilterMode,
  onStockFilterChange,
  bulkUpload,
}: MaterialListProps) {
  const [bulkKind, setBulkKind] = useState<'materials' | 'vendors' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MaterialCategory | 'All'>('All');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedMaterialForGraph, setSelectedMaterialForGraph] = useState<Material | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  // Helper to compute total site asset procurement value for a material
  // (currentStock + consumedQty) * unitCost so log-use does not decrease estimated value
  const getMaterialTotalValue = (mat: Material) => {
    const consumedQty = transactions
      .filter((t) => t.materialId === mat.id && t.type === 'consumption')
      .reduce((sum, t) => sum + t.quantity, 0);
    const effectiveTotalStock = mat.currentStock + consumedQty;
    return effectiveTotalStock * mat.unitCost;
  };

  // States for the inline Quick Action logs
  const [activeQuickTx, setActiveQuickTx] = useState<{ id: string; type: 'addition' | 'consumption' } | null>(null);
  const [quickQty, setQuickQty] = useState<number | ''>('');
  const [quickRate, setQuickRate] = useState<number | ''>('');
  const [quickTotalPrice, setQuickTotalPrice] = useState<number | ''>('');
  const [quickVendor, setQuickVendor] = useState('');
  const [quickNotes, setQuickNotes] = useState('');
  const [quickInvoiceFileName, setQuickInvoiceFileName] = useState('');
  const [quickInvoiceUrl, setQuickInvoiceUrl] = useState('');
  const [quickBillType, setQuickBillType] = useState<BillType>('GST');
  const [quickBillNumber, setQuickBillNumber] = useState('');
  const [quickGstRate, setQuickGstRate] = useState<number>(18);
  const [quickVendorGstin, setQuickVendorGstin] = useState('');
  const [quickVerification, setQuickVerification] = useState<VerificationDraft>(() => newVerificationDraft(currentUser?.name || ''));

  // States for adding new material
  const [newMatName, setNewMatName] = useState('');
  const [newMatCode, setNewMatCode] = useState('001');
  const [newMatGroup, setNewMatGroup] = useState('Cement & Binding Materials');
  const [newMatCategory, setNewMatCategory] = useState<MaterialCategory>('Structural');
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [newMatUnit, setNewMatUnit] = useState('Brass');
  const [newMatInitialStock, setNewMatInitialStock] = useState<number>(0);
  const [newMatMinThreshold, setNewMatMinThreshold] = useState<number>(2);
  const [newMatUnitCost, setNewMatUnitCost] = useState<number>(100);
  const [newMatVendorName, setNewMatVendorName] = useState('');
  const [newMatTotalPrice, setNewMatTotalPrice] = useState<number | ''>('');
  const [newMatProjectId, setNewMatProjectId] = useState('');
  const [newMatBillType, setNewMatBillType] = useState<BillType>('GST');
  const [newMatBillNumber, setNewMatBillNumber] = useState('');
  const [newMatGstRate, setNewMatGstRate] = useState<number>(18);
  const [newMatVendorGstin, setNewMatVendorGstin] = useState('');

  // Financial calculations for the new material bill
  const newMaterialFinancials = useMemo(() => {
    const qty = Number(newMatInitialStock) || 0;
    const rate = Number(newMatUnitCost) || 0;
    return calculateBillFinancials(
      newMatBillType,
      qty,
      rate,
      newMatGstRate,
      newMatTotalPrice !== '' ? Number(newMatTotalPrice) : undefined
    );
  }, [newMatBillType, newMatInitialStock, newMatUnitCost, newMatGstRate, newMatTotalPrice]);

  // Auto-calculate Total Price when rate or quantity changes
  const computedTotalPrice = useMemo(() => {
    if (newMatTotalPrice !== '' && !isNaN(Number(newMatTotalPrice))) {
      return Number(newMatTotalPrice);
    }
    return newMaterialFinancials.totalAmount;
  }, [newMaterialFinancials, newMatTotalPrice]);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);

  // Dynamic category pills list including custom categories in inventory
  const allCategoryPills = useMemo(() => {
    const set = new Set<string>(CATEGORIES);
    materials.forEach((m) => {
      if (m.category && m.category.trim()) {
        set.add(m.category.trim());
      }
    });
    return Array.from(set);
  }, [materials]);

  // Active stock filter mode: 'all' | 'low' | 'reorder'
  const activeStockFilter = stockFilterMode ?? (lowStockOnlyFilter ? 'low' : 'all');

  const handleStockFilterChange = (mode: 'all' | 'low' | 'reorder') => {
    if (onStockFilterChange) {
      onStockFilterChange(mode);
    } else if (mode === 'low') {
      onToggleLowStockFilter?.(true);
    } else {
      if (onToggleLowStockFilter) onToggleLowStockFilter(false);
      onClearLowStockFilter?.();
    }
  };

  // Scoped materials by project for counting
  const projectMaterials = useMemo(() => {
    return materials.filter(m => selectedProjectId === 'all' || m.projectId === selectedProjectId);
  }, [materials, selectedProjectId]);

  const lowStockCount = useMemo(() => {
    return projectMaterials.filter(m => m.currentStock <= m.minThreshold).length;
  }, [projectMaterials]);

  const reorderCount = useMemo(() => {
    return projectMaterials.filter(m => m.currentStock > m.minThreshold && m.currentStock <= (m.minThreshold * 2)).length;
  }, [projectMaterials]);

  // Filter materials based on selected project, category, stock alert filter, and search query
  const filteredMaterials = materials.filter((mat) => {
    const projectMatches = selectedProjectId === 'all' || mat.projectId === selectedProjectId;
    const categoryMatches = selectedCategory === 'All' || mat.category === selectedCategory;
    
    let stockMatches = true;
    if (activeStockFilter === 'low') {
      stockMatches = mat.currentStock <= mat.minThreshold;
    } else if (activeStockFilter === 'reorder') {
      stockMatches = mat.currentStock > mat.minThreshold && mat.currentStock <= (mat.minThreshold * 2);
    }

    const searchMatches = mat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          mat.category.toLowerCase().includes(searchQuery.toLowerCase());
    return projectMatches && categoryMatches && stockMatches && searchMatches;
  });

  const getProjectName = (projId: string) => {
    const p = projects.find((p) => p.id === projId);
    return p ? p.name : 'Unassigned Project';
  };

  const handleAddSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!newMatName.trim()) return;

    const targetProjectId = newMatProjectId || (selectedProjectId !== 'all' ? selectedProjectId : projects[0]?.id || 'proj-1');
    if (!targetProjectId) {
      alert('Please select a valid project for this material.');
      return;
    }

    const finalCategory = newMatCategory === 'Others'
      ? (customCategoryName.trim() || 'Others')
      : newMatCategory;

    const rateVal = Number(newMatUnitCost);
    const qtyVal = Number(newMatInitialStock);
    const totalVal = computedTotalPrice;

    const defaultBillNum = newMatBillNumber.trim() || (newMatBillType === 'GST' ? `GST-${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}` : `URD-VCH-${Math.floor(100 + Math.random() * 900)}`);

    onAddMaterial({
      projectId: targetProjectId,
      name: newMatName,
      category: finalCategory,
      unit: newMatUnit,
      initialStock: qtyVal,
      minThreshold: Number(newMatMinThreshold),
      unitCost: rateVal,
      totalPrice: totalVal,
      vendorName: newMatVendorName.trim() || (newMatBillType === 'GST' ? 'Authorized GST Supplier' : 'Local Unregistered Quarry / Kiln'),
      materialCode: formatMaterialCode(newMatCode),
      materialGroup: newMatGroup.trim() || undefined,
      billType: newMatBillType,
      billNumber: defaultBillNum,
      gstRate: newMatBillType === 'GST' ? newMatGstRate : 0,
      gstAmount: newMaterialFinancials.gstAmount,
      baseAmount: newMaterialFinancials.baseAmount,
      vendorGstin: newMatBillType === 'GST' ? (newMatVendorGstin.trim() || undefined) : undefined,
    });

    // Reset
    setNewMatName('');
    setNewMatCode('001');
    setNewMatGroup('Cement & Binding Materials');
    setNewMatCategory('Structural');
    setCustomCategoryName('');
    setNewMatUnit('Brass');
    setNewMatInitialStock(0);
    setNewMatMinThreshold(2);
    setNewMatUnitCost(100);
    setNewMatVendorName('');
    setNewMatTotalPrice('');
    setNewMatBillType('GST');
    setNewMatBillNumber('');
    setNewMatGstRate(18);
    setNewMatVendorGstin('');
    setIsAddOpen(false);
  };

  const handleQuickTxSubmit = (mat: Material) => {
    if (!activeQuickTx) return;

    const qtyNum = Number(quickQty);
    if (quickQty === '' || isNaN(qtyNum) || qtyNum <= 0) {
      alert('please insert valid values');
      return;
    }

    if (!quickNotes.trim()) {
      alert('Please insert a compulsory reason / note for this stock movement.');
      return;
    }

    if (activeQuickTx.type === 'consumption' && qtyNum > mat.currentStock) {
      alert('please insert valid values');
      return;
    }

    // Material verification: only the accepted quantity is added to stock and billed
    let verification: MaterialVerification | undefined;
    let stockQty = qtyNum;
    if (activeQuickTx.type === 'addition') {
      const vError = verificationError(quickVerification, qtyNum);
      if (vError) {
        alert(vError);
        return;
      }
      verification = toVerification(quickVerification, qtyNum);
      if (!(verification.acceptedQty > 0)) {
        alert('All delivered material was rejected, so nothing is added to stock. Please return it to the vendor.');
        return;
      }
      stockQty = verification.acceptedQty;
    }

    const rateNum = Number(quickRate) || mat.unitCost || 0;
    const quickFinancials = calculateBillFinancials(
      quickBillType,
      stockQty,
      rateNum,
      quickGstRate,
      quickTotalPrice !== '' ? Number(quickTotalPrice) : undefined
    );

    const generatedQuickBillNum = quickBillNumber.trim() || (quickBillType === 'GST' ? `GST-INV-${Date.now().toString().slice(-4)}` : `URD-VCH-${Date.now().toString().slice(-4)}`);

    onQuickTransaction(
      mat.id,
      activeQuickTx.type,
      stockQty,
      verification && verification.rejectedQty > 0
        ? `${quickNotes.trim()} (${verification.rejectedQty} ${mat.unit} rejected: ${verification.rejectionReason})`
        : quickNotes.trim(),
      activeQuickTx.type === 'addition'
        ? {
            rate: rateNum,
            totalPrice: quickFinancials.totalAmount,
            baseAmount: quickFinancials.baseAmount,
            gstRate: quickBillType === 'GST' ? quickGstRate : 0,
            gstAmount: quickFinancials.gstAmount,
            billType: quickBillType,
            billNumber: generatedQuickBillNum,
            vendorGstin: quickBillType === 'GST' ? (quickVendorGstin.trim() || undefined) : undefined,
            vendorName: quickVendor.trim() || mat.vendorName || (quickBillType === 'GST' ? 'Authorized GST Supplier' : 'Local Unregistered Vendor'),
            invoiceUrl: quickInvoiceUrl,
            invoiceFileName: quickInvoiceFileName,
            verification,
          }
        : undefined
    );

    setQuickVerification(newVerificationDraft(currentUser?.name || ''));
    setActiveQuickTx(null);
    setQuickQty('');
    setQuickNotes('');
    setQuickRate('');
    setQuickTotalPrice('');
    setQuickVendor('');
    setQuickInvoiceFileName('');
    setQuickInvoiceUrl('');
    setQuickBillType('GST');
    setQuickBillNumber('');
    setQuickGstRate(18);
    setQuickVendorGstin('');
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200" id="materials-list-container">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#23408e] text-white flex items-center justify-center shrink-0">
            <BookOpen size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Procurements</h1>
            <p className="text-xs text-slate-500">Site material catalogue: stock levels, purchase rates, on-site value, stock movements and order queries.</p>
          </div>
        </div>
        {!isAdmin ? (
          <button
            id="btn-open-add-material"
            onClick={() => {
              if (selectedProjectId !== 'all') {
                setNewMatProjectId(selectedProjectId);
              } else if (projects.length > 0) {
                setNewMatProjectId(projects[0].id);
              }
              setIsAddOpen(true);
            }}
            className="px-4 py-2.5 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Plus size={16} /> Add New Material
          </button>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            {bulkUpload && (
              <>
                <button
                  id="btn-bulk-upload-vendors"
                  onClick={() => setBulkKind('vendors')}
                  className="px-4 py-2.5 rounded-lg border border-[#23408e] text-[#23408e] bg-white hover:bg-[#f5f8fd] text-sm font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                  title="Upload your vendor list (Excel/CSV) and view the vendor directory"
                >
                  <Users size={16} /> Bulk Upload Vendors
                </button>
                <button
                  id="btn-bulk-upload-materials"
                  onClick={() => setBulkKind('materials')}
                  className="px-4 py-2.5 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                  title="Upload your material list (Excel/CSV) for all sites"
                >
                  <Upload size={16} /> Bulk Upload Materials
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {bulkUpload && (
        <BulkUploadModal
          kind={bulkKind || 'materials'}
          isOpen={!!bulkKind}
          onClose={() => setBulkKind(null)}
          selectedProjectId={selectedProjectId}
          {...bulkUpload}
        />
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Catalogue Materials" value={projectMaterials.length} hint={selectedProjectId === 'all' ? 'Across all sites' : getProjectName(selectedProjectId)} />
        <Kpi label="Low Stock" value={<span className={lowStockCount ? 'text-rose-700' : undefined}>{lowStockCount}</span>} hint="At or below minimum level" />
        <Kpi label="Reorder Soon" value={<span className={reorderCount ? 'text-amber-700' : undefined}>{reorderCount}</span>} hint="Within 2x minimum level" />
        <Kpi label="Value On-Site" value={`Rs. ${Math.round(projectMaterials.reduce((s, m) => s + getMaterialTotalValue(m), 0)).toLocaleString('en-IN')}`} hint="Stock + used, at current rates" />
      </div>

      {/* Stock status tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto" role="tablist">
        {(
          [
            ['all', `All Materials (${projectMaterials.length})`, 'btn-stock-filter-all', null],
            ['low', `Low Stock Alerts (${lowStockCount})`, 'btn-stock-filter-low', <AlertCircle key="i" size={14} className="text-rose-600" />],
            ['reorder', `Reorder Notifications (${reorderCount})`, 'btn-stock-filter-reorder', <Bell key="i" size={14} className="text-amber-600" />],
          ] as const
        ).map(([mode, label, id, icon]) => (
          <button
            key={mode}
            id={id}
            role="tab"
            aria-selected={activeStockFilter === mode}
            onClick={() => handleStockFilterChange(mode)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
              activeStockFilter === mode ? 'border-[#23408e] text-[#23408e]' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Materials table card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            id="material-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search materials by name or category"
            aria-label="Search materials"
            className="flex-1 text-sm py-1 focus:outline-hidden"
          />
        </div>
        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/60 flex items-center gap-2 overflow-x-auto scrollbar-thin">
          <span className="text-xs font-semibold text-slate-500 inline-flex items-center gap-1.5 mr-1 whitespace-nowrap">
            <Filter size={12} /> Category
          </span>
          {(['All', ...allCategoryPills] as string[]).map((cat) => (
            <button
              key={cat}
              id={cat === 'All' ? 'filter-cat-all' : `filter-cat-${cat.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => setSelectedCategory(cat as MaterialCategory | 'All')}
              className={`px-2.5 py-1 rounded-full border text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-[#23408e] border-[#23408e] text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-[#c9d6f2] hover:text-[#23408e]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

      {filteredMaterials.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-500">
          <p>No materials match the selected filters.</p>
          {activeStockFilter !== 'all' ? (
            <button
              id="no-mats-btn-clear-filter"
              onClick={() => handleStockFilterChange('all')}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#23408e] hover:underline cursor-pointer"
            >
              <X size={14} /> Clear {activeStockFilter === 'low' ? 'Low Stock' : 'Reorder'} Filter
            </button>
          ) : !isAdmin && (
            <button
              id="no-mats-btn-add"
              onClick={() => setIsAddOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#23408e] hover:underline cursor-pointer"
            >
              <Plus size={14} /> Add your first material catalog item
            </button>
          )}
        </div>
      ) : (
        /* Tabular Format */
        <div className="overflow-auto max-h-[calc(100vh-260px)] min-h-[380px] w-full relative" id="materials-table-wrapper">
          <table className="w-full min-w-[1050px] text-left border-collapse" id="materials-table">
            <thead className="sticky top-0 z-20 bg-[#23408e]">
              <tr className="bg-[#23408e] text-white text-xs font-semibold uppercase tracking-wide">
                <th className="px-3 py-3 text-center w-14 sticky top-0 bg-[#23408e] z-20">Sr. No.</th>
                <th className="px-3 py-3 min-w-[230px] sticky top-0 bg-[#23408e] z-20">Material / Description</th>
                <th className="px-3 py-3 min-w-[120px] sticky top-0 bg-[#23408e] z-20">Category</th>
                <th className="px-3 py-3 min-w-[130px] sticky top-0 bg-[#23408e] z-20">Site / Project</th>
                <th className="px-3 py-3 text-right min-w-[130px] sticky top-0 bg-[#23408e] z-20">Current Stock</th>
                <th className="px-3 py-3 text-right min-w-[120px] sticky top-0 bg-[#23408e] z-20">Safety Score (2x)</th>
                <th className="px-3 py-3 text-center min-w-[140px] sticky top-0 bg-[#23408e] z-20">Rate Graph</th>
                <th className="px-3 py-3 text-right min-w-[130px] sticky top-0 bg-[#23408e] z-20">Unit Cost (Rs.)</th>
                <th className="px-3 py-3 text-right min-w-[140px] sticky top-0 bg-[#23408e] z-20">Value On-Site (Rs.)</th>
                <th className="px-3 py-3 text-center min-w-[170px] sticky top-0 bg-[#23408e] z-20">Actions</th>
              </tr>
            </thead>
              <tbody className="text-[13px]">
                {filteredMaterials.map((mat, index) => {
                  const isLowStock = mat.currentStock <= mat.minThreshold;
                  const isCritical = mat.currentStock === 0;
                  const isReorder = !isLowStock && mat.currentStock <= (mat.minThreshold * 2);
                  const isQuickActive = activeQuickTx?.id === mat.id;
                  const stockHealth = Math.min((mat.currentStock / (mat.minThreshold || 1)) * 100, 150);

                  return (
                    <Fragment key={mat.id}>
                      <tr
                        id={`mat-row-${mat.id}`}
                        className={`border-b border-slate-100 transition-colors hover:bg-[#f5f8fd] ${
                          isLowStock ? 'bg-rose-50/60' : isReorder ? 'bg-amber-50/50' : 'bg-white'
                        }`}
                      >
                        {/* Sr. No. */}
                        <td className={`px-3 py-3 text-center text-xs font-medium text-slate-500 border-l-[3px] ${isLowStock ? 'border-l-rose-500' : isReorder ? 'border-l-amber-400' : 'border-l-transparent'}`}>{index + 1}</td>

                        {/* Description / Name */}
                        <td className="px-3 py-3">
                          <div className="flex items-start gap-2">
                            <span className="shrink-0 mt-0.5 px-1.5 py-0.5 bg-[#eaf0fb] text-[#23408e] border border-[#c9d6f2] font-mono font-semibold text-[10px] rounded">
                              #{resolveMaterialCode(mat)}
                            </span>
                            <span className="font-semibold text-slate-900 leading-snug">{mat.name}</span>
                          </div>
                        </td>

                        {/* Category */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-slate-100 text-slate-700 border-slate-200">
                            {mat.category}
                          </span>
                        </td>

                        {/* Project / Site */}
                        <td className="px-3 py-3 whitespace-nowrap text-slate-600">
                          {getProjectName(mat.projectId)}
                        </td>

                        {/* Current Stock */}
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <span className={`font-semibold ${isLowStock ? 'text-rose-700' : isReorder ? 'text-amber-700' : 'text-slate-900'}`}>
                            {mat.currentStock.toLocaleString('en-IN')}
                          </span>{' '}
                          <span className="text-xs text-slate-500">{mat.unit}</span>
                          {(isLowStock || isReorder) && (
                            <div className="mt-1">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                                isCritical
                                  ? 'bg-rose-600 text-white border-rose-600'
                                  : isLowStock
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}>
                                {isCritical ? 'Out of stock' : isLowStock ? 'Low stock' : 'Reorder soon'}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Min Safe Level */}
                        <td className="px-3 py-3 text-right whitespace-nowrap text-slate-600">
                          {mat.minThreshold.toLocaleString('en-IN')} <span className="text-xs text-slate-500">{mat.unit}</span>
                        </td>

                        {/* View Material Rate Graph */}
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <button
                            id={`btn-rate-graph-${mat.id}`}
                            onClick={() => setSelectedMaterialForGraph(mat)}
                            className="px-3 py-1.5 rounded-lg border border-[#23408e] text-[#23408e] bg-white hover:bg-[#f5f8fd] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                            title="View Material Rate Graph (Stock Market Tracker)"
                          >
                            <TrendingUp size={13} />
                            View Rate Graph
                          </button>
                        </td>

                        {/* Unit Cost */}
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <div className="font-medium text-slate-900">
                            Rs. {mat.unitCost.toLocaleString('en-IN')} <span className="text-xs font-normal text-slate-500">/ {mat.unit}</span>
                          </div>
                          <div className="mt-1">
                            {resolveMaterialBillType(mat) === 'GST' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold bg-emerald-50 text-emerald-800 border-emerald-200">
                                GST {mat.gstRate || 18}%
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold bg-amber-50 text-amber-800 border-amber-200">
                                URD (0%)
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Value On-Site */}
                        <td className="px-3 py-3 text-right whitespace-nowrap font-semibold text-slate-900">
                          Rs. {getMaterialTotalValue(mat).toLocaleString('en-IN')}
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {!isAdmin ? (
                              <>
                                <button
                                  id={`btn-table-consume-${mat.id}`}
                                  onClick={() => {
                                    setActiveQuickTx(activeQuickTx?.id === mat.id && activeQuickTx.type === 'consumption' ? null : { id: mat.id, type: 'consumption' });
                                    setQuickNotes('');
                                  }}
                                  className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                                  title="Log Material Use"
                                >
                                  <ArrowDownLeft size={12} /> Log Use
                                </button>
                                <button
                                  id={`btn-table-replenish-${mat.id}`}
                                  onClick={() => {
                                    if (activeQuickTx?.id === mat.id && activeQuickTx.type === 'addition') {
                                      setActiveQuickTx(null);
                                    } else {
                                      setActiveQuickTx({ id: mat.id, type: 'addition' });
                                      setQuickNotes('');
                                      setQuickQty('');
                                      setQuickRate(mat.unitCost || 100);
                                      setQuickTotalPrice('');
                                      setQuickVendor(mat.vendorName || '');
                                      setQuickInvoiceFileName('');
                                      setQuickInvoiceUrl('');
                                    }
                                  }}
                                  className="px-2.5 py-1.5 bg-white hover:bg-[#f5f8fd] border border-[#23408e] text-[#23408e] text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                                  title="Add Material Stock (Rate, Qty, Total Price, Vendor, Reason, Invoice)"
                                >
                                  <ArrowUpRight size={12} /> Add Stock
                                </button>
                                <button
                                  id={`btn-table-order-query-${mat.id}`}
                                  onClick={() => onOpenOrderQueryForMaterial?.(mat)}
                                  className="px-2.5 py-1.5 bg-[#23408e] hover:bg-[#1b3170] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                                  title="Raise Project Requirement & Order Query to Vendors"
                                >
                                  <ShoppingCart size={12} /> Order Query
                                </button>
                                <button
                                  id={`btn-table-query-${mat.id}`}
                                  onClick={() => onOpenRaiseQueryModalForMaterial?.(mat.id, mat.projectId)}
                                  className="p-1.5 text-slate-500 hover:text-[#23408e] rounded-lg hover:bg-[#f5f8fd] transition-colors cursor-pointer border border-slate-200"
                                  title="Raise Query / Issue about this Material"
                                >
                                  <HelpCircle size={13} />
                                </button>
                                <button
                                  id={`btn-table-delete-${mat.id}`}
                                  onClick={() => setDeleteTarget(mat)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                                  title="Remove Material Catalog Entry"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            ) : (
                              /* Admin View - Read Only Actions */
                              <div className="flex items-center gap-1.5">
                                <button
                                  id={`btn-admin-order-query-${mat.id}`}
                                  onClick={() => onOpenOrderQueryForMaterial?.(mat)}
                                  className="px-2.5 py-1.5 bg-[#23408e] hover:bg-[#1b3170] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                                  title="Raise Project Requirement & Order Query to Vendors"
                                >
                                  <ShoppingCart size={12} /> Order Query
                                </button>
                                <button
                                  id={`btn-admin-query-${mat.id}`}
                                  onClick={() => onOpenRaiseQueryModalForMaterial?.(mat.id, mat.projectId)}
                                  className="px-2.5 py-1.5 bg-white border border-[#23408e] text-[#23408e] hover:bg-[#f5f8fd] text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                                  title="Open Query regarding this material"
                                >
                                  <HelpCircle size={12} /> Query Material
                                </button>
                                
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Quick Action Drawer Row */}
                      {!isAdmin && isQuickActive && (
                        <tr className="bg-[#f5f8fd] border-b border-[#d9e3f5]" id={`table-quick-form-${mat.id}`}>
                          <td colSpan={10} className="p-4">
                            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                                <div className="flex items-center gap-2.5">
                                  <span
                                    className={`px-3 py-1.5 rounded-xl text-white font-extrabold text-xs flex items-center gap-1.5 ${
                                      activeQuickTx.type === 'addition' ? 'bg-[#23408e]' : 'bg-rose-600'
                                    }`}
                                  >
                                    {activeQuickTx.type === 'addition' ? (
                                      <>
                                        <ArrowUpRight size={15} /> Inward Stock Delivery Form
                                      </>
                                    ) : (
                                      <>
                                        <ArrowDownLeft size={15} /> Outward Material Consumption Form
                                      </>
                                    )}
                                  </span>
                                  <div>
                                    <p className="text-sm font-extrabold text-slate-950">
                                      {mat.name} <span className="text-xs text-slate-500 font-normal">({mat.category})</span>
                                    </p>
                                    <p className="text-xs text-slate-500 font-medium">
                                      Current Stock: <strong className="text-slate-900 font-bold">{mat.currentStock} {mat.unit}</strong>
                                    </p>
                                  </div>
                                </div>

                                <button
                                  id={`quick-cancel-btn-${mat.id}`}
                                  type="button"
                                  onClick={() => setActiveQuickTx(null)}
                                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                                >
                                  <X size={18} />
                                </button>
                              </div>

                              {activeQuickTx.type === 'addition' ? (
                                /* ADD STOCK FORM WITH ALL REQUESTED INPUT FIELDS */
                                <div className="space-y-4">
                                  {/* BILL TYPE SELECTION (GST vs URD) FOR QUICK INWARD */}
                                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                      <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                        <Receipt size={13} className="text-amber-500" />
                                        Inward Bill Type (GST vs URD)
                                      </label>
                                      <span className="text-[10px] font-bold text-slate-500">Tax Invoice / Voucher</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setQuickBillType('GST');
                                          if (quickGstRate === 0) setQuickGstRate(18);
                                        }}
                                        className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                                          quickBillType === 'GST'
                                            ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-black'
                                            : 'border-slate-200 bg-slate-50 text-slate-700'
                                        }`}
                                      >
                                        <span>GST Tax Invoice</span>
                                        {quickBillType === 'GST' && <Check size={14} className="text-emerald-700" />}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setQuickBillType('URD');
                                          setQuickGstRate(0);
                                        }}
                                        className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                                          quickBillType === 'URD'
                                            ? 'border-amber-500 bg-amber-50 text-amber-950 font-black'
                                            : 'border-slate-200 bg-slate-50 text-slate-700'
                                        }`}
                                      >
                                        <span>URD Voucher (0%)</span>
                                        {quickBillType === 'URD' && <Check size={14} className="text-amber-700" />}
                                      </button>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                      <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                                          {quickBillType === 'GST' ? 'Invoice / Bill #' : 'URD Voucher #'}
                                        </label>
                                        <input
                                          type="text"
                                          value={quickBillNumber}
                                          onChange={(e) => setQuickBillNumber(e.target.value)}
                                          placeholder={quickBillType === 'GST' ? 'e.g. GST-2026/0812' : 'e.g. URD-VCH-391'}
                                          className="w-full bg-slate-50 border border-slate-300 text-slate-950 text-xs font-mono font-bold rounded-lg px-2.5 py-1.5 focus:outline-hidden"
                                        />
                                      </div>

                                      {quickBillType === 'GST' ? (
                                        <div>
                                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                                            GST Tax Rate
                                          </label>
                                          <select
                                            value={quickGstRate}
                                            onChange={(e) => setQuickGstRate(Number(e.target.value))}
                                            className="w-full bg-slate-50 border border-slate-300 text-slate-950 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:outline-hidden cursor-pointer"
                                          >
                                            <option value={18}>18% GST (9% CGST + 9% SGST)</option>
                                            <option value={28}>28% GST Heavy/Luxury</option>
                                            <option value={12}>12% GST Works</option>
                                            <option value={5}>5% GST Basic</option>
                                            <option value={0}>0% Nil Rated</option>
                                          </select>
                                        </div>
                                      ) : (
                                        <div>
                                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                                            Tax Particulars
                                          </label>
                                          <div className="w-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold rounded-lg px-2.5 py-1.5">
                                            0% Tax (URD Purchase)
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                      <label htmlFor={`quick-rate-input-${mat.id}`} className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                                        1. Rate / Unit Cost (Rs / {mat.unit}) *
                                      </label>
                                      <input
                                        id={`quick-rate-input-${mat.id}`}
                                        type="number"
                                        min="0.01"
                                        step="any"
                                        required
                                        value={quickRate}
                                        onChange={(e) => {
                                          const r = e.target.value === '' ? '' : Number(e.target.value);
                                          setQuickRate(r);
                                          if (quickTotalPrice === '') {
                                            setQuickTotalPrice((Number(r) || 0) * (Number(quickQty) || 0));
                                          }
                                        }}
                                        placeholder="e.g. 420"
                                        className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-bold rounded-xl px-3 py-2.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20"
                                      />
                                    </div>

                                    <div>
                                      <label htmlFor={`quick-qty-input-${mat.id}`} className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                                        2. Quantity ({mat.unit}) *
                                      </label>
                                      <input
                                        id={`quick-qty-input-${mat.id}`}
                                        type="number"
                                        min="0.01"
                                        step="any"
                                        required
                                        value={quickQty}
                                        onChange={(e) => {
                                          const q = e.target.value === '' ? '' : Number(e.target.value);
                                          setQuickQty(q);
                                          if (quickTotalPrice === '') {
                                            setQuickTotalPrice((Number(quickRate) || 0) * (Number(q) || 0));
                                          }
                                        }}
                                        placeholder={`Qty in ${mat.unit}`}
                                        className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-bold rounded-xl px-3 py-2.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20"
                                      />
                                    </div>

                                    <div>
                                      <label htmlFor={`quick-total-price-input-${mat.id}`} className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                                        3. Total Price (Rs)
                                      </label>
                                      <input
                                        id={`quick-total-price-input-${mat.id}`}
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={
                                          quickTotalPrice !== ''
                                            ? quickTotalPrice
                                            : (Number(quickRate) || 0) * (Number(quickQty) || 0)
                                        }
                                        onChange={(e) => setQuickTotalPrice(e.target.value === '' ? '' : Number(e.target.value))}
                                        placeholder="Rate × Quantity"
                                        className="w-full bg-amber-50/70 border border-amber-300 text-amber-950 text-xs font-black rounded-xl px-3 py-2.5 focus:outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-500/20"
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                      <label htmlFor={`quick-vendor-input-${mat.id}`} className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                                        4. Vendor / Supplier Name
                                      </label>
                                      <input
                                        id={`quick-vendor-input-${mat.id}`}
                                        type="text"
                                        value={quickVendor}
                                        onChange={(e) => setQuickVendor(e.target.value)}
                                        placeholder="e.g. Tata Tiscon / UltraTech Dealers"
                                        className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-medium rounded-xl px-3 py-2.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20"
                                      />
                                    </div>

                                    <div>
                                      <label htmlFor={`quick-notes-input-${mat.id}`} className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                                        5. Reason / Purpose for Addition *
                                      </label>
                                      <input
                                        id={`quick-notes-input-${mat.id}`}
                                        type="text"
                                        required
                                        value={quickNotes}
                                        onChange={(e) => setQuickNotes(e.target.value)}
                                        placeholder="e.g. Batch #14 Arrival for Slab Construction *"
                                        className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-medium rounded-xl px-3 py-2.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20"
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                                      6. Upload Invoice / Delivery Challan Document
                                    </label>
                                    <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                                      <input
                                        id={`quick-invoice-file-${mat.id}`}
                                        type="file"
                                        accept="image/*,.pdf"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            setQuickInvoiceFileName(file.name);
                                            setQuickInvoiceUrl(URL.createObjectURL(file));
                                          }
                                        }}
                                        className="hidden"
                                      />
                                      <label
                                        htmlFor={`quick-invoice-file-${mat.id}`}
                                        className="px-3 py-1.5 bg-[#23408e] hover:bg-[#1b3170] text-white text-xs font-semibold rounded-lg cursor-pointer transition-all inline-flex items-center gap-1.5 shrink-0"
                                      >
                                        Choose Invoice File
                                      </label>
                                      {quickInvoiceFileName ? (
                                        <div className="flex items-center gap-2 text-xs text-emerald-800 font-extrabold truncate bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                                          <span>✓ Attached: {quickInvoiceFileName}</span>
                                          {quickInvoiceUrl && (
                                            <a
                                              href={quickInvoiceUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="underline text-emerald-900 hover:text-emerald-700 ml-1"
                                            >
                                              Preview
                                            </a>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-xs text-slate-400 font-medium">No invoice file chosen (Optional PDF/Photo proof)</span>
                                      )}
                                    </div>
                                  </div>

                                  <MaterialVerificationPanel
                                    idPrefix={`quick-verify-${mat.id}`}
                                    unit={mat.unit}
                                    delivered={Number(quickQty) || 0}
                                    value={quickVerification}
                                    onChange={setQuickVerification}
                                  />

                                  <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                                    <button
                                      id={`quick-cancel-btn-bottom-${mat.id}`}
                                      type="button"
                                      onClick={() => setActiveQuickTx(null)}
                                      className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      id={`quick-submit-btn-${mat.id}`}
                                      type="button"
                                      onClick={() => handleQuickTxSubmit(mat)}
                                      className="px-4 py-2 bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                                    >
                                      <ArrowUpRight size={14} /> Record Inward Delivery & Update Rate Graph
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                /* OUTWARD CONSUMPTION FORM */
                                <div className="space-y-3">
                                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                    <div className="w-full sm:w-48">
                                      <label htmlFor={`quick-qty-input-${mat.id}`} className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                                        Quantity ({mat.unit}) *
                                      </label>
                                      <input
                                        id={`quick-qty-input-${mat.id}`}
                                        type="number"
                                        min="0.1"
                                        max={mat.currentStock}
                                        step="any"
                                        required
                                        value={quickQty}
                                        onChange={(e) => setQuickQty(e.target.value === '' ? '' : Number(e.target.value))}
                                        placeholder={`Qty (${mat.unit}) *`}
                                        className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-bold rounded-xl px-3 py-2 focus:outline-hidden focus:border-red-600"
                                      />
                                    </div>

                                    <div className="flex-1">
                                      <label htmlFor={`quick-notes-input-${mat.id}`} className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                                        Reason / Consumption Note *
                                      </label>
                                      <input
                                        id={`quick-notes-input-${mat.id}`}
                                        type="text"
                                        required
                                        value={quickNotes}
                                        onChange={(e) => setQuickNotes(e.target.value)}
                                        placeholder="e.g. Concrete mix for ground floor slab columns *"
                                        className="w-full bg-white border border-slate-300 text-slate-950 text-xs rounded-xl px-3 py-2 focus:outline-hidden focus:border-red-600"
                                      />
                                    </div>
                                  </div>

                                  {Number(quickQty) > mat.currentStock && (
                                    <p className="text-xs text-red-600 font-extrabold">
                                      please insert valid values (cannot exceed available stock of {mat.currentStock} {mat.unit})
                                    </p>
                                  )}

                                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                    <button
                                      type="button"
                                      onClick={() => setActiveQuickTx(null)}
                                      className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      id={`quick-submit-btn-${mat.id}`}
                                      type="button"
                                      onClick={() => handleQuickTxSubmit(mat)}
                                      className="px-4 py-2 bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                                    >
                                      <ArrowDownLeft size={14} /> Record Material Use
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
        </div>
      )}
      </div>

      {/* Add New Material Modal Popup */}
      {!isAdmin && (
        <AnimatePresence>
          {isAddOpen && (
            <motion.div
              key="add-material-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
              id="add-material-modal"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden"
              >
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
                  <h3 className="text-base font-extrabold text-slate-950 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-[#23408e] text-white inline-flex items-center justify-center"><Plus size={17} /></span> Add Catalog Material
                  </h3>
                  <button
                    id="close-add-material-modal"
                    onClick={() => setIsAddOpen(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleAddSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                  <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    <div>
                      <label htmlFor="new-mat-project" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Assigned Site / Project *
                      </label>
                      <select
                        id="new-mat-project"
                        value={newMatProjectId || (selectedProjectId !== 'all' ? selectedProjectId : projects[0]?.id || '')}
                        onChange={(e) => setNewMatProjectId(e.target.value)}
                        className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20 font-medium cursor-pointer"
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Material ERP Code & Group */}
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1">
                          <Hash size={13} className="text-amber-500" />
                          Material Code (e.g. 001 for all Cement types)
                        </label>
                        <span className="text-[10px] font-bold text-slate-500">Shared Code for Variants</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-1">
                          <input
                            id="new-mat-code"
                            type="text"
                            value={newMatCode}
                            onChange={(e) => setNewMatCode(e.target.value)}
                            placeholder="e.g. 001"
                            className="w-full bg-white border border-slate-300 text-slate-950 text-sm font-black rounded-xl px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-slate-950"
                          />
                        </div>
                        <div className="col-span-2">
                          <select
                            value={newMatCode}
                            onChange={(e) => {
                              const found = STANDARD_MATERIAL_GROUPS.find(g => g.code === e.target.value);
                              setNewMatCode(e.target.value);
                              if (found) setNewMatGroup(found.name);
                            }}
                            className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-bold rounded-xl px-3 py-2.5 focus:outline-hidden cursor-pointer truncate"
                          >
                            {STANDARD_MATERIAL_GROUPS.map((g) => (
                              <option key={g.code} value={g.code}>
                                #{g.code} - {g.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="new-mat-name" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Material Name / Specification *
                      </label>
                      <input
                        id="new-mat-name"
                        type="text"
                        required
                        value={newMatName}
                        onChange={(e) => setNewMatName(e.target.value)}
                        placeholder="e.g. 12MM TMT STEEL BARS"
                        className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20 font-medium"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="new-mat-category" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Category
                        </label>
                        <select
                          id="new-mat-category"
                          value={newMatCategory}
                          onChange={(e) => setNewMatCategory(e.target.value as MaterialCategory)}
                          className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20 cursor-pointer font-medium"
                        >
                          {CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="new-mat-unit" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Unit of Measurement
                        </label>
                        <select
                          id="new-mat-unit"
                          value={newMatUnit}
                          onChange={(e) => setNewMatUnit(e.target.value)}
                          className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20 cursor-pointer font-medium"
                        >
                          <option value="Brass">Brass (100 cu ft)</option>
                          <option value="Bags">Bags</option>
                          <option value="Tons">Tons</option>
                          <option value="Pieces">Pieces</option>
                          <option value="Liters">Liters</option>
                          <option value="Boxes">Boxes</option>
                          <option value="Rolls">Rolls</option>
                          <option value="Sq Ft">Sq Ft</option>
                          <option value="Kits">Kits</option>
                          <option value="Coils">Coils</option>
                        </select>
                      </div>
                    </div>

                    {newMatCategory === 'Others' && (
                      <div className="bg-amber-50/80 p-3.5 rounded-xl border border-amber-200">
                        <label htmlFor="new-mat-custom-category" className="block text-xs font-extrabold text-amber-900 uppercase tracking-wider mb-1">
                          Specify Custom Category Name *
                        </label>
                        <input
                          id="new-mat-custom-category"
                          type="text"
                          required
                          value={customCategoryName}
                          onChange={(e) => setCustomCategoryName(e.target.value)}
                          placeholder="e.g. Safety Gear, Landscaping, Fasteners"
                          className="w-full bg-white border border-amber-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-500/20 font-medium"
                        />
                      </div>
                    )}

                    {/* BILL TYPE SELECTOR (GST vs URD) */}
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3" id="add-mat-bill-section">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <Receipt size={14} className="text-amber-500" />
                          Procurement Bill Type (GST vs URD) *
                        </label>
                        <span className="text-[10px] font-bold text-slate-500">Tax & Invoicing Particulars</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          id="btn-add-mat-bill-gst"
                          onClick={() => {
                            setNewMatBillType('GST');
                            if (newMatGstRate === 0) setNewMatGstRate(18);
                          }}
                          className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                            newMatBillType === 'GST'
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-xs'
                              : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider">
                              GST Tax Invoice
                            </span>
                            <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                              newMatBillType === 'GST' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                            }`}>
                              {newMatBillType === 'GST' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </span>
                          </div>
                          <p className="text-[10px] text-emerald-800 font-semibold mt-1">
                            Tax Invoice with GSTIN & ITC Credit
                          </p>
                        </button>

                        <button
                          type="button"
                          id="btn-add-mat-bill-urd"
                          onClick={() => {
                            setNewMatBillType('URD');
                            setNewMatGstRate(0);
                          }}
                          className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                            newMatBillType === 'URD'
                              ? 'border-amber-500 bg-amber-50 text-amber-950 shadow-xs'
                              : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider">
                              URD Bill / Voucher
                            </span>
                            <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                              newMatBillType === 'URD' ? 'border-amber-500 bg-amber-500' : 'border-slate-300'
                            }`}>
                              {newMatBillType === 'URD' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </span>
                          </div>
                          <p className="text-[10px] text-amber-800 font-semibold mt-1">
                            Unregistered Dealer (0% Tax)
                          </p>
                        </button>
                      </div>

                      {/* Conditional GST / URD Fields */}
                      <div className="grid grid-cols-2 gap-2.5 pt-1">
                        <div>
                          <label htmlFor="new-mat-bill-number" className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                            {newMatBillType === 'GST' ? 'Invoice / Bill #' : 'URD Voucher #'}
                          </label>
                          <input
                            id="new-mat-bill-number"
                            type="text"
                            value={newMatBillNumber}
                            onChange={(e) => setNewMatBillNumber(e.target.value)}
                            placeholder={newMatBillType === 'GST' ? 'e.g. GST-2026/0192' : 'e.g. URD-VCH-881'}
                            className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-mono font-bold rounded-xl px-3 py-2 focus:outline-hidden"
                          />
                        </div>

                        {newMatBillType === 'GST' ? (
                          <div>
                            <label htmlFor="new-mat-gst-rate" className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                              GST Tax Rate (%)
                            </label>
                            <select
                              id="new-mat-gst-rate"
                              value={newMatGstRate}
                              onChange={(e) => setNewMatGstRate(Number(e.target.value))}
                              className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-bold rounded-xl px-3 py-2 focus:outline-hidden cursor-pointer"
                            >
                              <option value={18}>18% Standard (9% CGST + 9% SGST)</option>
                              <option value={28}>28% Heavy (14% CGST + 14% SGST)</option>
                              <option value={12}>12% Works (6% CGST + 6% SGST)</option>
                              <option value={5}>5% Basic (2.5% CGST + 2.5% SGST)</option>
                              <option value={0}>0% Nil Rated</option>
                            </select>
                          </div>
                        ) : (
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                              Tax Status
                            </label>
                            <input
                              type="text"
                              disabled
                              value="0% (URD Cash Purchase)"
                              className="w-full bg-amber-100/60 border border-amber-200 text-amber-950 text-xs font-bold rounded-xl px-3 py-2"
                            />
                          </div>
                        )}
                      </div>

                      {newMatBillType === 'GST' && (
                        <div>
                          <label htmlFor="new-mat-vendor-gstin" className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                            Supplier GSTIN Number (Optional)
                          </label>
                          <input
                            id="new-mat-vendor-gstin"
                            type="text"
                            value={newMatVendorGstin}
                            onChange={(e) => setNewMatVendorGstin(e.target.value)}
                            placeholder="e.g. 27AABCU9021K1ZM"
                            className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-mono font-bold rounded-xl px-3 py-2 focus:outline-hidden"
                          />
                        </div>
                      )}
                    </div>

                    {/* Rate, Quantity, Total Price, Vendor Name, Safety Min */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="new-mat-cost" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Rate / Unit Cost (Rs) *
                        </label>
                        <input
                          id="new-mat-cost"
                          type="number"
                          min="0"
                          step="any"
                          required
                          value={newMatUnitCost}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setNewMatUnitCost(val);
                            if (newMatTotalPrice === '') {
                              setNewMatTotalPrice(val * newMatInitialStock);
                            }
                          }}
                          className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20 font-bold"
                        />
                      </div>

                      <div>
                        <label htmlFor="new-mat-stock" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Quantity ({newMatUnit}) *
                        </label>
                        <input
                          id="new-mat-stock"
                          type="number"
                          min="0"
                          step="any"
                          required
                          value={newMatInitialStock}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setNewMatInitialStock(val);
                            if (newMatTotalPrice === '') {
                              setNewMatTotalPrice(newMatUnitCost * val);
                            }
                          }}
                          className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20 font-bold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="new-mat-total-price" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Total Invoiced Price (Rs)
                        </label>
                        <input
                          id="new-mat-total-price"
                          type="number"
                          min="0"
                          step="any"
                          value={newMatTotalPrice !== '' ? newMatTotalPrice : computedTotalPrice}
                          onChange={(e) => setNewMatTotalPrice(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder={`Calculated: Rs. ${computedTotalPrice}`}
                          className="w-full bg-amber-50/60 border border-amber-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-500/20 font-extrabold text-amber-950"
                        />
                        <p className="text-[10px] text-slate-500 mt-0.5 font-medium">Rate × Quantity (Auto-calculated)</p>
                      </div>

                      <div>
                        <label htmlFor="new-mat-vendor" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Vendor / Supplier Name
                        </label>
                        <input
                          id="new-mat-vendor"
                          type="text"
                          value={newMatVendorName}
                          onChange={(e) => setNewMatVendorName(e.target.value)}
                          placeholder="e.g. Tata Tiscon / UltraTech"
                          className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20 font-medium"
                        />
                      </div>
                    </div>

                    {/* Financial Breakdown Card */}
                    <div className={`p-3 rounded-xl border ${newMatBillType === 'GST' ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50/60 border-amber-200'}`}>
                      <div className="flex items-center justify-between text-xs font-bold mb-1.5 text-slate-900">
                        <span>Live Bill Financial Summary ({newMatBillType})</span>
                        <span className="text-[10px] font-semibold text-slate-500">Auto-Computed</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-500 block">Base Taxable:</span>
                          <span className="font-bold text-slate-900">Rs. {newMaterialFinancials.baseAmount.toLocaleString('en-IN')}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">
                            {newMatBillType === 'GST' ? `GST (${newMatGstRate}%):` : 'Tax:'}
                          </span>
                          <span className="font-bold text-emerald-800">
                            {newMatBillType === 'GST' ? `+ Rs. ${newMaterialFinancials.gstAmount.toLocaleString('en-IN')}` : 'Rs. 0 (Nil)'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Total Billed:</span>
                          <span className="font-black text-slate-950">Rs. {newMaterialFinancials.totalAmount.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="new-mat-min" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Safety Minimum Stock Level
                      </label>
                      <input
                        id="new-mat-min"
                        type="number"
                        min="0"
                        step="any"
                        value={newMatMinThreshold}
                        onChange={(e) => setNewMatMinThreshold(Number(e.target.value))}
                        className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20 font-medium"
                      />
                    </div>
                  </div>

                  {/* Fixed Sticky Footer */}
                  <div className="flex gap-3 p-4 px-6 border-t border-slate-200 bg-slate-50/90 shrink-0">
                    <button
                      id="btn-cancel-add-material"
                      type="button"
                      onClick={() => setIsAddOpen(false)}
                      className="flex-1 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      id="btn-submit-add-material"
                      type="submit"
                      className="flex-1 bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold py-2.5 rounded-lg transition-colors cursor-pointer"
                    >
                      Add Material
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Delete Resource Confirmation Modal */}
      {!isAdmin && (
        <AnimatePresence>
          {deleteTarget && (
            <motion.div
              key="delete-material-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center z-50 p-4"
              id="delete-material-modal"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl border border-slate-200"
              >
                <div className="flex items-center gap-3 text-red-600 mb-3">
                  <div className="p-2.5 bg-red-50 rounded-xl border border-red-100 shrink-0">
                    <Trash2 size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-950">Remove Resource</h3>
                    <p className="text-xs text-slate-500 font-medium">Permanent catalog action</p>
                  </div>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed my-3 font-medium">
                  Are you sure you want to remove <strong className="text-slate-950 font-bold">{deleteTarget.name}</strong> from the site inventory? This will also clear all linked transaction logs.
                </p>

                <div className="flex gap-2.5 mt-5">
                  <button
                    id="btn-cancel-delete-material"
                    type="button"
                    onClick={() => setDeleteTarget(null)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    id="btn-confirm-delete-material"
                    type="button"
                    onClick={() => {
                      onRemoveMaterial(deleteTarget.id);
                      setDeleteTarget(null);
                    }}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold py-2.5 rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    Delete Resource
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Stock Market Style Material Rate Graph Modal */}
      <MaterialRateGraphModal
        material={selectedMaterialForGraph}
        projects={projects}
        transactions={transactions}
        isOpen={!!selectedMaterialForGraph}
        onClose={() => setSelectedMaterialForGraph(null)}
        onAddRatePoint={onAddRatePoint}
      />
    </div>
  );
}
