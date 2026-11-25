import { useState, useMemo } from 'react';
import { downloadCsv, printReport, fileSafe, todayIso, inr } from '../lib/exportUtils';
import { Material, InventoryTransaction, Project, User } from '../types';
import {
  aggregateMaterialsByCode,
  STANDARD_MATERIAL_GROUPS,
  formatMaterialCode,
  MaterialCodeSummaryGroup,
  resolveMaterialCode,
} from '../lib/materialCodes';
import {
  Search,
  Hash,
  Layers,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  Download,
  Printer,
  Edit3,
  CheckCircle2,
  Package,
  Boxes,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Filter,
  Check,
  X,
  Plus,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import MaterialRateGraphModal from './MaterialRateGraphModal';

interface MaterialCodeSummaryProps {
  materials: Material[];
  transactions: InventoryTransaction[];
  projects: Project[];
  selectedProjectId: string;
  currentUser?: User;
  onUpdateMaterialCode?: (materialId: string, newCode: string, newGroup?: string, applyToAllProjects?: boolean) => void;
  onQuickTransaction?: (
    materialId: string,
    type: 'addition' | 'consumption',
    qty: number,
    notes: string,
    details?: {
      rate?: number;
      totalPrice?: number;
      vendorName?: string;
    }
  ) => void;
}

export default function MaterialCodeSummary({
  materials,
  transactions,
  projects,
  selectedProjectId,
  currentUser,
  onUpdateMaterialCode,
  onQuickTransaction,
}: MaterialCodeSummaryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'code' | 'invested' | 'stockValue' | 'variants' | 'quantity'>('code');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [expandedCodes, setExpandedCodes] = useState<Record<string, boolean>>({});

  // Rate graph modal
  const [selectedMaterialForGraph, setSelectedMaterialForGraph] = useState<Material | null>(null);

  // Edit code modal
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [editTargetCode, setEditTargetCode] = useState('');
  const [editTargetGroupName, setEditTargetGroupName] = useState('');
  const [applyToAllSameName, setApplyToAllSameName] = useState(true);

  // View Activity Ledger for a specific Code
  const [viewCodeLedgerGroup, setViewCodeLedgerGroup] = useState<MaterialCodeSummaryGroup | null>(null);

  // Success toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const getProjectName = (projId: string) => {
    const p = projects.find((p) => p.id === projId);
    return p ? p.name : 'Unassigned Site';
  };

  // Toggle card expansion
  const toggleExpand = (code: string) => {
    setExpandedCodes((prev) => ({
      ...prev,
      [code]: !prev[code],
    }));
  };


  // Aggregate all code groups
  const allGroups = useMemo(() => {
    return aggregateMaterialsByCode(materials, transactions, selectedProjectId);
  }, [materials, transactions, selectedProjectId]);

  // Dynamic category pills list
  const categoryList = useMemo(() => {
    const set = new Set<string>();
    allGroups.forEach((g) => {
      if (g.category) set.add(g.category);
    });
    return Array.from(set);
  }, [allGroups]);

  // Filter and sort groups
  const codeGroups = useMemo(() => {
    let list = allGroups.filter((g) => {
      const categoryMatches = selectedCategory === 'All' || g.category === selectedCategory;
      const searchMatches =
        g.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.groupName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.uniqueVariantNames.some((v) => v.toLowerCase().includes(searchQuery.toLowerCase()));
      return categoryMatches && searchMatches;
    });

    list.sort((a, b) => {
      if (sortBy === 'code') {
        return a.code.localeCompare(b.code, undefined, { numeric: true });
      }
      if (sortBy === 'invested') {
        return b.totalInvestedAmount - a.totalInvestedAmount;
      }
      if (sortBy === 'stockValue') {
        return b.currentStockValuation - a.currentStockValuation;
      }
      if (sortBy === 'variants') {
        return b.totalVariantsCount - a.totalVariantsCount;
      }
      if (sortBy === 'quantity') {
        return b.totalCurrentStock - a.totalCurrentStock;
      }
      return 0;
    });

    return list;
  }, [allGroups, searchQuery, selectedCategory, sortBy]);

  // Overall Statistics across visible groups
  const overallStats = useMemo(() => {
    let totalCodes = codeGroups.length;
    let totalVariants = 0;
    let totalInvested = 0;
    let totalStockValuation = 0;
    let totalInwardAmount = 0;
    let totalConsumedAmount = 0;
    let lowStockCodes = 0;

    codeGroups.forEach((g) => {
      totalVariants += g.totalVariantsCount;
      totalInvested += g.totalInvestedAmount;
      totalStockValuation += g.currentStockValuation;
      totalInwardAmount += g.totalInwardAmount;
      totalConsumedAmount += g.totalConsumedAmount;
      if (g.isLowStock) lowStockCodes++;
    });

    return {
      totalCodes,
      totalVariants,
      totalInvested,
      totalStockValuation,
      totalInwardAmount,
      totalConsumedAmount,
      lowStockCodes,
    };
  }, [codeGroups]);

  // Open Edit Code Modal
  const handleOpenEditCode = (mat: Material) => {
    setEditingMaterial(mat);
    const currCode = resolveMaterialCode(mat);
    setEditTargetCode(currCode);
    const matchedGroup = STANDARD_MATERIAL_GROUPS.find((g) => g.code === currCode);
    setEditTargetGroupName(mat.materialGroup || matchedGroup?.name || '');
    setApplyToAllSameName(true);
  };

  // Submit Code Update
  const handleSaveCode = () => {
    if (!editingMaterial || !editTargetCode.trim()) return;

    const formatted = formatMaterialCode(editTargetCode.trim());
    if (onUpdateMaterialCode) {
      onUpdateMaterialCode(editingMaterial.id, formatted, editTargetGroupName.trim(), applyToAllSameName);
      showToast(
        `✓ Material "${editingMaterial.name}" assigned Code [${formatted}]${
          applyToAllSameName ? ' across all matching project items' : ''
        }`
      );
    }
    setEditingMaterial(null);
  };

  const scopeLabel = () => (selectedProjectId === 'all' ? 'All projects' : getProjectName(selectedProjectId));
  const summaryFilters = (): [string, string][] => [
    ['Project', scopeLabel()],
    ...(selectedCategory !== 'All' ? ([['Category', selectedCategory]] as [string, string][]) : []),
    ...(searchQuery.trim() ? ([['Search', searchQuery.trim()]] as [string, string][]) : []),
  ];

  // Export to CSV (valid in Excel and Google Sheets: quoted fields, UTF-8, codes kept as text e.g. "#001")
  const handleExportCSV = () => {
    const headers = [
      'Material Code', 'Group Name', 'Category', 'Variants', 'Variant Names', 'Available Stock', 'Average Unit Cost (Rs)',
      'Stock Valuation (Rs)', 'Total Invested (Rs)', 'Total Inward (Rs)', 'Total Consumed (Rs)', 'Low Stock', 'Site Projects',
    ];
    const rows = codeGroups.map((g) => [
      `#${g.code}`,
      g.groupName,
      g.category,
      g.totalVariantsCount,
      g.uniqueVariantNames.join('; '),
      g.unitSummaryText,
      Math.round(g.averageUnitCost * 100) / 100,
      Math.round(g.currentStockValuation),
      Math.round(g.totalInvestedAmount),
      Math.round(g.totalInwardAmount),
      Math.round(g.totalConsumedAmount),
      g.isLowStock ? 'Yes' : 'No',
      g.projectIds.map(getProjectName).join('; '),
    ]);
    downloadCsv(`Material_Code_Summary_${fileSafe(scopeLabel())}_${todayIso()}.csv`, headers, rows);
  };

  // Print Report: a clean A4 document with the visible code groups and totals
  const handlePrint = () => {
    printReport({
      title: 'Material Code Summary & Investment Ledger',
      subtitle: 'Material codes with available stock, valuation and total investment.',
      meta: summaryFilters(),
      landscape: true,
      summary: [
        ['Codes', String(overallStats.totalCodes)],
        ['Variants', String(overallStats.totalVariants)],
        ['Stock valuation', inr(overallStats.totalStockValuation, 0)],
        ['Total invested', inr(overallStats.totalInvested, 0)],
        ['Low-stock codes', String(overallStats.lowStockCodes)],
      ],
      columns: [
        { header: 'Code' }, { header: 'Group' }, { header: 'Category' }, { header: 'Variants', align: 'right' }, { header: 'Available Stock' },
        { header: 'Avg Unit Cost', align: 'right' }, { header: 'Valuation', align: 'right' }, { header: 'Invested', align: 'right' },
        { header: 'Inward', align: 'right' }, { header: 'Consumed', align: 'right' }, { header: 'Sites' },
      ],
      rows: codeGroups.map((g) => [
        `#${g.code}`, g.groupName, g.category, g.totalVariantsCount, g.unitSummaryText, inr(g.averageUnitCost), inr(g.currentStockValuation, 0),
        inr(g.totalInvestedAmount, 0), inr(g.totalInwardAmount, 0), inr(g.totalConsumedAmount, 0), g.projectIds.map(getProjectName).join(', '),
      ]),
      totals: [
        'Total', '', '', overallStats.totalVariants, '', '', inr(overallStats.totalStockValuation, 0), inr(overallStats.totalInvested, 0),
        inr(overallStats.totalInwardAmount, 0), inr(overallStats.totalConsumedAmount, 0), '',
      ],
    });
  };
  return (
    <div className="space-y-5 animate-in fade-in duration-200" id="material-code-summary-container">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 right-6 z-50 bg-emerald-50 text-emerald-900 px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 border border-emerald-200 text-sm"
          >
            <CheckCircle2 size={16} className="text-emerald-600" />
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#23408e] text-white flex items-center justify-center shrink-0">
            <Hash size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900">Material Code Summary &amp; Investment Ledger</h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]">
                ERP Code Grouping
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Unified material codes (e.g. <strong className="text-slate-700">001</strong> for all Cement types, <strong className="text-slate-700">002</strong> for Steel) with total quantities, total price invested and valuation.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            id="btn-export-code-csv"
            onClick={handleExportCSV}
            className="px-4 py-2.5 rounded-lg border border-[#23408e] text-[#23408e] bg-white hover:bg-[#f5f8fd] text-sm font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            title="Export Code-wise Summary to CSV"
          >
            <Download size={15} />
            Export CSV
          </button>
          <button
            id="btn-print-code-report"
            onClick={handlePrint}
            className="px-4 py-2.5 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            title="Print Summary Report"
          >
            <Printer size={15} />
            Print Report
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm min-w-0">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Material Codes</span>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">{overallStats.totalCodes}</p>
          <span className="text-[11px] text-slate-500">Across {overallStats.totalVariants} catalog items</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm min-w-0">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Price Invested</span>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 break-words">Rs. {Math.round(overallStats.totalInvested).toLocaleString('en-IN')}</p>
          <span className="text-[11px] text-slate-500">Lifetime procurement + opening assets</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm min-w-0">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Current Stock Valuation</span>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 break-words">Rs. {Math.round(overallStats.totalStockValuation).toLocaleString('en-IN')}</p>
          <span className="text-[11px] text-slate-500">Physical stock currently on site</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm min-w-0">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Ledger Movement</span>
          <p className="text-xl sm:text-2xl font-bold mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-emerald-700 inline-flex items-center"><ArrowDownLeft size={16} /> Rs. {(overallStats.totalInwardAmount / 100000).toFixed(1)}L</span>
            <span className="text-slate-300">/</span>
            <span className="text-rose-700 inline-flex items-center"><ArrowUpRight size={16} /> Rs. {(overallStats.totalConsumedAmount / 100000).toFixed(1)}L</span>
          </p>
          <span className="text-[11px] text-slate-500">Inward inflow vs outward utilised</span>
        </div>
      </div>

      {/* Search, sort, view and category filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Search size={16} className="text-slate-400 shrink-0" />
            <input
              id="input-code-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by code (e.g. 001), group name or material variant"
              aria-label="Search material codes"
              className="flex-1 min-w-0 text-sm py-1 focus:outline-hidden"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label htmlFor="select-code-sort" className="text-xs font-semibold text-slate-500">Sort</label>
            <select
              id="select-code-sort"
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-white border border-slate-300 text-slate-800 text-sm rounded-lg px-3 py-1.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20 cursor-pointer"
            >
              <option value="code">Code (001, 002...)</option>
              <option value="invested">Highest Invested Price</option>
              <option value="stockValue">Highest Current Valuation</option>
              <option value="variants">Most Variants Count</option>
              <option value="quantity">Highest Current Stock</option>
            </select>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
              {(['cards', 'table'] as const).map((mode) => (
                <button
                  key={mode}
                  id={mode === 'cards' ? 'btn-view-cards' : 'btn-view-table'}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                    viewMode === mode ? 'bg-[#23408e] text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mode === 'cards' ? 'Cards View' : 'Table View'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-4 py-2.5 bg-slate-50/60 flex items-center gap-2 overflow-x-auto scrollbar-thin">
          <span className="text-xs font-semibold text-slate-500 inline-flex items-center gap-1.5 mr-1 whitespace-nowrap">
            <Filter size={12} /> Category
          </span>
          {(['All', ...categoryList] as string[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-full border text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-[#23408e] border-[#23408e] text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-[#c9d6f2] hover:text-[#23408e]'
              }`}
            >
              {cat === 'All' ? `All Categories (${allGroups.length})` : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      {codeGroups.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
          <Hash size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-600 font-bold text-sm">No material codes match your search criteria.</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('All');
            }}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#23408e] hover:underline cursor-pointer"
          >
            <RefreshCw size={13} /> Reset search filters
          </button>
        </div>
      ) : viewMode === 'cards' ? (
        /* ================= CARDS VIEW ================= */
        <div className="space-y-4" id="code-groups-cards-list">
          {codeGroups.map((group) => {
            const isExpanded = !!expandedCodes[group.code];

            return (
              <div
                key={group.code}
                id={`code-card-${group.code}`}
                className="bg-white rounded-xl border border-slate-200 shadow-sm hover:border-[#c9d6f2] transition-colors overflow-hidden"
              >
                {/* Group Card Header */}
                <div
                  onClick={() => toggleExpand(group.code)}
                  className="p-5 bg-white hover:bg-[#f5f8fd] transition-colors cursor-pointer border-b border-slate-100"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Code badge and title */}
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className="w-12 h-12 rounded-lg bg-[#23408e] text-white flex flex-col items-center justify-center font-bold shrink-0">
                        <span className="text-[9px] text-blue-100 uppercase tracking-widest font-semibold">CODE</span>
                        <span className="text-base leading-none tracking-tight">{group.code}</span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-slate-900">
                            {group.groupName}
                          </h3>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-slate-100 text-slate-700 border-slate-200">
                            {group.category}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]">
                            {group.totalVariantsCount} {group.totalVariantsCount === 1 ? 'Material Variant' : 'Material Variants'}
                          </span>
                          {group.isLowStock && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-800 border border-red-200 text-[10px] font-black rounded-md animate-pulse">
                              <AlertCircle size={10} />
                              {group.lowStockCount} Low Stock Alert
                            </span>
                          )}
                        </div>

                        {/* List of sample variant tags */}
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          <span className="text-[11px] text-slate-500 font-bold">Includes:</span>
                          {group.uniqueVariantNames.map((name) => (
                            <span
                              key={name}
                              className="text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded-md"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Right: Key Figures & Toggle Arrow */}
                    <div className="flex items-center gap-4 sm:gap-6 shrink-0 justify-between lg:justify-end pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                      {/* Available Stock */}
                      <div className="text-left sm:text-right">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Current Stock
                        </div>
                        <div className="text-sm sm:text-base font-black text-slate-950">
                          {group.unitSummaryText}
                        </div>
                        <div className="text-[11px] font-bold text-amber-800">
                          Valuation: ₹{Math.round(group.currentStockValuation).toLocaleString('en-IN')}
                        </div>
                      </div>

                      {/* Total Price Invested */}
                      <div className="text-right">
                        <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                          Total Price Invested
                        </div>
                        <div className="text-base sm:text-lg font-black text-emerald-950">
                          ₹ {Math.round(group.totalInvestedAmount).toLocaleString('en-IN')}
                        </div>
                        <div className="text-[10px] font-bold text-slate-500">
                          Avg: ₹{group.averageUnitCost}/{group.primaryUnit}
                        </div>
                      </div>

                      {/* Expand Chevron Icon */}
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-all shrink-0">
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Detailed Breakdown for this Code Group */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="p-5 sm:p-6 bg-white space-y-5"
                    >
                      {/* Sub-Header with Action bar */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                            <Layers size={14} className="text-slate-600" />
                            All Materials Sharing Code [{group.code}] ({group.materials.length} Site Records)
                          </h4>
                          <p className="text-[11px] text-slate-500 font-medium">
                            Individual material variations, site stock levels, current valuations, and rates.
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            id={`btn-view-ledger-${group.code}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewCodeLedgerGroup(group);
                            }}
                            className="px-3 py-1.5 bg-[#23408e] hover:bg-[#1b3170] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <Eye size={12} /> View Code #{group.code} Ledger Activity
                          </button>
                        </div>
                      </div>

                      {/* Materials Table within this Code Group */}
                      <div className="border border-slate-200 rounded-xl overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-[#23408e] text-white font-semibold text-[11px] uppercase tracking-wide">
                            <tr>
                              <th className="px-4 py-2.5">MATERIAL VARIANT</th>
                              <th className="px-3 py-2.5">SITE LOCATION</th>
                              <th className="px-3 py-2.5 text-right">CURRENT STOCK</th>
                              <th className="px-3 py-2.5 text-right">SAFETY MIN.</th>
                              <th className="px-3 py-2.5 text-right">RATE (RS.)</th>
                              <th className="px-3 py-2.5 text-right">VALUATION (RS.)</th>
                              <th className="px-3 py-2.5 text-right">INVESTED PRICE (RS.)</th>
                              <th className="px-3 py-2.5 text-center">RATE GRAPH</th>
                              <th className="px-4 py-2.5 text-center">CODE ACTION</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium">
                            {group.materials.map((mat) => {
                              const isLow = mat.currentStock <= mat.minThreshold;
                              const stockVal = (mat.currentStock || 0) * (mat.unitCost || 0);
                              const invested = mat.totalPrice && mat.totalPrice > 0 ? mat.totalPrice : stockVal;

                              return (
                                <tr
                                  key={mat.id}
                                  className={`hover:bg-slate-50/80 transition-colors ${
                                    isLow ? 'bg-red-50/50 text-red-950 font-semibold' : ''
                                  }`}
                                >
                                  <td className="px-4 py-3">
                                    <div className="flex flex-col">
                                      <span className="font-extrabold text-slate-950">{mat.name}</span>
                                      <span className="text-[10px] text-slate-500">{mat.category}</span>
                                    </div>
                                  </td>

                                  <td className="px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">
                                    📍 {getProjectName(mat.projectId)}
                                  </td>

                                  <td className="px-3 py-3 text-right whitespace-nowrap">
                                    <span className={`font-bold ${isLow ? 'text-red-700' : 'text-slate-950'}`}>
                                      {mat.currentStock.toLocaleString('en-IN')}
                                    </span>{' '}
                                    <span className="text-slate-500 text-[10px]">{mat.unit}</span>
                                    {isLow && (
                                      <span className="ml-1.5 px-1.5 py-0.2 text-[9px] bg-red-200 text-red-900 font-black rounded-sm">
                                        LOW
                                      </span>
                                    )}
                                  </td>

                                  <td className="px-3 py-3 text-right text-slate-600 font-semibold">
                                    {mat.minThreshold} {mat.unit}
                                  </td>

                                  <td className="px-3 py-3 text-right font-black text-slate-950">
                                    ₹ {mat.unitCost.toLocaleString('en-IN')}
                                  </td>

                                  <td className="px-3 py-3 text-right font-black text-amber-900">
                                    ₹ {Math.round(stockVal).toLocaleString('en-IN')}
                                  </td>

                                  <td className="px-3 py-3 text-right font-black text-emerald-900">
                                    ₹ {Math.round(invested).toLocaleString('en-IN')}
                                  </td>

                                  <td className="px-3 py-3 text-center whitespace-nowrap">
                                    <button
                                      onClick={() => setSelectedMaterialForGraph(mat)}
                                      className="px-2.5 py-1 bg-white hover:bg-[#f5f8fd] border border-[#23408e] text-[#23408e] font-semibold text-[11px] rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                                      title="View rate fluctuation graph"
                                    >
                                      <TrendingUp size={11} className="text-amber-700" />
                                      Graph
                                    </button>
                                  </td>

                                  <td className="px-4 py-3 text-center whitespace-nowrap">
                                    <button
                                      id={`btn-edit-code-${mat.id}`}
                                      onClick={() => handleOpenEditCode(mat)}
                                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-[10px] rounded-lg transition-all cursor-pointer inline-flex items-center gap-1 border border-slate-300"
                                      title="Edit material code or reassign"
                                    >
                                      <Edit3 size={11} />
                                      Edit Code
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      ) : (
        /* ================= TABLE VIEW ================= */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-auto max-h-[calc(100vh-260px)] min-h-[400px] w-full" id="code-summary-table-wrapper">
          <table className="w-full min-w-[1000px] text-left border-collapse" id="code-summary-table">
            <thead className="sticky top-0 z-20 bg-[#23408e] text-white text-xs font-semibold uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3.5 text-center w-16">CODE</th>
                <th className="px-5 py-3.5 min-w-[220px]">MATERIAL GROUP & DESCRIPTION</th>
                <th className="px-4 py-3.5 min-w-[120px]">CATEGORY</th>
                <th className="px-4 py-3.5 text-center min-w-[100px]">VARIANTS</th>
                <th className="px-4 py-3.5 text-right min-w-[140px]">CURRENT STOCK</th>
                <th className="px-4 py-3.5 text-right min-w-[130px]">AVG RATE (RS.)</th>
                <th className="px-4 py-3.5 text-right min-w-[150px]">STOCK VALUATION (RS.)</th>
                <th className="px-4 py-3.5 text-right min-w-[160px]">TOTAL INVESTED (RS.)</th>
                <th className="px-4 py-3.5 text-center min-w-[130px]">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs font-medium">
              {codeGroups.map((group, index) => {
                return (
                  <tr
                    key={group.code}
                    id={`table-row-code-${group.code}`}
                    className={`hover:bg-slate-50 transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                    }`}
                  >
                    {/* Code Badge */}
                    <td className="px-4 py-3.5 text-center">
                      <span className="px-2 py-0.5 bg-[#eaf0fb] text-[#23408e] border border-[#c9d6f2] font-mono font-semibold text-xs rounded">
                        #{group.code}
                      </span>
                    </td>

                    {/* Group Name & Variants preview */}
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col">
                        <span className="font-extrabold text-slate-950 text-sm">{group.groupName}</span>
                        <span className="text-[11px] text-slate-500 truncate max-w-sm mt-0.5">
                          {group.uniqueVariantNames.join(', ')}
                        </span>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold rounded-md uppercase">
                        {group.category}
                      </span>
                    </td>

                    {/* Variants Count */}
                    <td className="px-4 py-3.5 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]">
                        {group.totalVariantsCount} types
                      </span>
                    </td>

                    {/* Stock Quantity */}
                    <td className="px-4 py-3.5 text-right font-black text-slate-950 whitespace-nowrap">
                      {group.unitSummaryText}
                    </td>

                    {/* Avg Rate */}
                    <td className="px-4 py-3.5 text-right font-bold text-slate-700 whitespace-nowrap">
                      ₹ {group.averageUnitCost.toLocaleString('en-IN')}/{group.primaryUnit}
                    </td>

                    {/* Stock Valuation */}
                    <td className="px-4 py-3.5 text-right font-black text-amber-900 whitespace-nowrap">
                      ₹ {Math.round(group.currentStockValuation).toLocaleString('en-IN')}
                    </td>

                    {/* Total Invested */}
                    <td className="px-4 py-3.5 text-right font-black text-emerald-950 text-sm whitespace-nowrap">
                      ₹ {Math.round(group.totalInvestedAmount).toLocaleString('en-IN')}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                      <button
                        onClick={() => setViewCodeLedgerGroup(group)}
                        className="px-2.5 py-1 bg-[#23408e] hover:bg-[#1b3170] text-white text-[11px] font-semibold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                        title="View Ledger Movements for this Code"
                      >
                        <Eye size={11} /> Activity
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ================= MODAL: EDIT / ASSIGN MATERIAL CODE ================= */}
      <AnimatePresence>
        {editingMaterial && (
          <div
            id="modal-edit-code-backdrop"
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs"
            onClick={(e) => e.target === e.currentTarget && setEditingMaterial(null)}
            onKeyDown={(e) => e.key === 'Escape' && setEditingMaterial(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 10 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-code-title"
              className="bg-white rounded-2xl w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200"
            >
              {/* Header (stays visible) */}
              <div className="shrink-0 flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-200">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[#23408e] text-white flex items-center justify-center shrink-0">
                    <Hash size={17} />
                  </div>
                  <div className="min-w-0">
                    <h3 id="edit-code-title" className="font-bold text-base text-slate-900">Assign Material Code</h3>
                    <p className="text-xs text-slate-500">Group this material with others under one code (e.g. 001 for all cement types).</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingMaterial(null)}
                  aria-label="Close"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body (scrolls) */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5 space-y-5">
                {/* Selected material */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="text-sm font-bold text-slate-900 break-words">{editingMaterial.name}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[11px] font-medium text-slate-600">
                    {editingMaterial.category}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[11px] font-medium text-slate-600">
                    {getProjectName(editingMaterial.projectId)}
                  </span>
                  {editingMaterial.materialCode && (
                    <span className="text-[11px] text-slate-500">Current code #{editingMaterial.materialCode}</span>
                  )}
                </div>

                {/* Material code */}
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,200px)_1fr] gap-4">
                  <div>
                    <label htmlFor="edit-code-input" className="block text-sm font-semibold text-slate-800 mb-1.5">
                      Material code *
                    </label>
                    <input
                      id="edit-code-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={editTargetCode}
                      onChange={(e) => setEditTargetCode(e.target.value.replace(/[^\dA-Za-z-]/g, ''))}
                      placeholder="e.g. 001"
                      aria-invalid={!editTargetCode.trim() ? true : undefined}
                      aria-describedby="edit-code-help"
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-base font-bold tracking-wide"
                    />
                    <p id="edit-code-help" className={`mt-1 text-xs ${editTargetCode.trim() ? 'text-slate-500' : 'text-rose-700'}`}>
                      {editTargetCode.trim() ? 'All variants share the same code.' : 'Enter a code or choose one below.'}
                    </p>
                  </div>
                  <div>
                    <label htmlFor="edit-group-input" className="block text-sm font-semibold text-slate-800 mb-1.5">
                      Group / family name <span className="font-normal text-slate-500">(optional)</span>
                    </label>
                    <input
                      id="edit-group-input"
                      type="text"
                      value={editTargetGroupName}
                      onChange={(e) => setEditTargetGroupName(e.target.value)}
                      placeholder="e.g. Cement & Binding Materials"
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm"
                    />
                  </div>
                </div>

                {/* Standard code presets (all visible: no inner scroll box) */}
                <div>
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <span id="presets-label" className="text-sm font-semibold text-slate-800">Standard codes</span>
                    <span className="text-xs text-slate-500">Tap one to fill in the code and group</span>
                  </div>
                  <div role="radiogroup" aria-labelledby="presets-label" className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 gap-2">
                    {STANDARD_MATERIAL_GROUPS.map((g) => {
                      const selected = editTargetCode === g.code;
                      return (
                        <button
                          key={g.code}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          title={g.name}
                          onClick={() => {
                            setEditTargetCode(g.code);
                            setEditTargetGroupName(g.name);
                          }}
                          className={`relative text-left rounded-xl border px-3 py-2.5 transition-colors cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#23408e]/40 ${
                            selected
                              ? 'bg-[#23408e] border-[#23408e] text-white shadow-sm'
                              : 'bg-white border-slate-200 text-slate-800 hover:border-[#23408e]/50 hover:bg-[#f5f8fd]'
                          }`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className={`text-sm font-bold ${selected ? 'text-white' : 'text-[#23408e]'}`}>#{g.code}</span>
                            {selected && <CheckCircle2 size={15} className="text-white shrink-0" aria-hidden="true" />}
                          </span>
                          <span className={`block mt-0.5 text-xs leading-snug line-clamp-2 ${selected ? 'text-white/90' : 'text-slate-600'}`}>
                            {g.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Apply to all matching items */}
                <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyToAllSameName}
                    onChange={(e) => setApplyToAllSameName(e.target.checked)}
                    className="mt-0.5 w-4 h-4 shrink-0"
                  />
                  <span className="text-sm">
                    <span className="font-semibold text-slate-900 block">Apply to every "{editingMaterial.name}" on all sites</span>
                    <span className="text-xs text-slate-600">
                      All matching records will use code #{editTargetCode.trim() || '—'}
                      {editTargetGroupName.trim() ? ` (${editTargetGroupName.trim()})` : ''}.
                    </span>
                  </span>
                </label>
              </div>

              {/* Footer (stays visible) */}
              <div className="shrink-0 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 px-4 sm:px-6 py-3 border-t border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setEditingMaterial(null)}
                  className="w-full sm:w-auto px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCode}
                  disabled={!editTargetCode.trim()}
                  className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold text-white bg-[#23408e] hover:bg-[#1b3170] rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Code
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================= MODAL: CODE LEDGER TRANSACTIONS ================= */}
      <AnimatePresence>
        {viewCodeLedgerGroup && (
          <div
            id="modal-code-ledger-backdrop"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-lg bg-[#23408e] text-white flex flex-col items-center justify-center font-bold">
                    <span className="text-[8px] text-amber-400">CODE</span>
                    <span className="text-xs leading-none">#{viewCodeLedgerGroup.code}</span>
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-slate-950">
                      Code #{viewCodeLedgerGroup.code} Activity Ledger
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      All additions & consumptions across {viewCodeLedgerGroup.groupName}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setViewCodeLedgerGroup(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Transactions List */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {(() => {
                  const matIds = new Set(viewCodeLedgerGroup.materials.map((m) => m.id));
                  const relatedTx = transactions.filter((t) => matIds.has(t.materialId));

                  if (relatedTx.length === 0) {
                    return (
                      <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-slate-500 text-xs font-bold">
                          No recent daily ledger transaction records logged for Code #{viewCodeLedgerGroup.code} materials.
                        </p>
                      </div>
                    );
                  }

                  return relatedTx.map((tx) => {
                    const mat = viewCodeLedgerGroup.materials.find((m) => m.id === tx.materialId);
                    const isAdd = tx.type === 'addition';

                    return (
                      <div
                        key={tx.id}
                        className="p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 flex items-center justify-between gap-3 text-xs transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              isAdd ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {isAdd ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                          </div>

                          <div>
                            <div className="font-extrabold text-slate-950 flex items-center gap-2">
                              <span>{mat?.name || 'Material Item'}</span>
                              <span
                                className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase ${
                                  isAdd ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
                                }`}
                              >
                                {isAdd ? 'Inward Inflow' : 'Site Consumption'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-semibold mt-0.5">
                              📅 {tx.date} | 📍 {getProjectName(tx.projectId)} | By {tx.operator || 'Supervisor'}
                            </div>
                            {tx.notes && <div className="text-[11px] text-slate-600 italic mt-0.5">"{tx.notes}"</div>}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className={`text-sm font-black ${isAdd ? 'text-emerald-700' : 'text-slate-950'}`}>
                            {isAdd ? '+' : '-'}{tx.quantity} {mat?.unit || 'Units'}
                          </div>
                          {tx.totalPrice && (
                            <div className="text-[11px] font-bold text-slate-500">
                              ₹ {Math.round(tx.totalPrice).toLocaleString('en-IN')}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 flex justify-end shrink-0">
                <button
                  onClick={() => setViewCodeLedgerGroup(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Material Rate Graph Modal */}
      {selectedMaterialForGraph && (
        <MaterialRateGraphModal
          material={selectedMaterialForGraph}
          projects={projects}
          transactions={transactions}
          isOpen={!!selectedMaterialForGraph}
          onClose={() => setSelectedMaterialForGraph(null)}
        />
      )}
    </div>
  );
}
