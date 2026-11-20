import { useState, useMemo, FormEvent, Fragment } from 'react';
import { Material, InventoryTransaction, Project, User, BillType } from '../types';
import {
  Search,
  Filter,
  Plus,
  FileText,
  Receipt,
  Download,
  Printer,
  Building2,
  Calendar,
  Layers,
  ArrowUpRight,
  TrendingUp,
  X,
  ExternalLink,
  Edit3,
  Scale,
  DollarSign,
  AlertTriangle,
  Info,
  Hash,
  Trash2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { resolveMaterialCode, STANDARD_MATERIAL_GROUPS } from '../lib/materialCodes';
import {
  calculateBillFinancials,
  resolveMaterialBillType,
  resolveTransactionBillType,
  STANDARD_GST_RATES,
} from '../lib/billUtils';

export interface UnifiedBillItem {
  id: string;
  sourceType: 'material' | 'transaction';
  sourceId: string;
  projectId: string;
  projectName: string;
  materialId?: string;
  materialName: string;
  materialCode: string;
  materialGroup: string;
  category: string;
  billType: BillType;
  billNumber: string;
  date: string;
  vendorName: string;
  vendorGstin?: string;
  quantity: number;
  unit: string;
  unitRate: number;
  baseAmount: number;
  gstRate: number;
  gstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  totalAmount: number;
  notes?: string;
  invoiceUrl?: string;
  invoiceFileName?: string;
  operator?: string;
}

interface GstUrdBillsSummaryProps {
  materials: Material[];
  transactions: InventoryTransaction[];
  projects: Project[];
  selectedProjectId: string;
  currentUser?: User;
  onUpdateMaterialBillType?: (
    materialId: string,
    billType: BillType,
    billNumber?: string,
    gstRate?: number,
    vendorGstin?: string
  ) => void;
  onAddBillTransaction?: (
    txData: Omit<InventoryTransaction, 'id'> & { materialId: string }
  ) => void;
  /** Delete a bill: a purchase entry (transaction) or a material's opening-stock bill */
  onDeleteBill?: (bill: { sourceType: 'material' | 'transaction'; sourceId: string }) => void;
}

export default function GstUrdBillsSummary({
  materials,
  transactions,
  projects,
  selectedProjectId,
  currentUser,
  onUpdateMaterialBillType,
  onAddBillTransaction,
  onDeleteBill,
}: GstUrdBillsSummaryProps) {
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
  const [deleteBillTarget, setDeleteBillTarget] = useState<UnifiedBillItem | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'gst' | 'urd' | 'by-code' | 'by-vendor'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProject, setFilterProject] = useState<string>(selectedProjectId);
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterGstRate, setFilterGstRate] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'vendor'>('date-desc');

  // Modal States
  const [isRecordBillOpen, setIsRecordBillOpen] = useState(false);
  const [selectedBillForSlip, setSelectedBillForSlip] = useState<UnifiedBillItem | null>(null);
  const [editingBill, setEditingBill] = useState<UnifiedBillItem | null>(null);

  // New Bill Form State
  const [newBillType, setNewBillType] = useState<BillType>('GST');
  const [newBillProjectId, setNewBillProjectId] = useState<string>(
    selectedProjectId !== 'all' ? selectedProjectId : projects[0]?.id || ''
  );
  const [newBillMaterialId, setNewBillMaterialId] = useState<string>('');
  const [newBillCustomMatName, setNewBillCustomMatName] = useState('');
  const [newBillCode, setNewBillCode] = useState('001');
  const [newBillCategory, setNewBillCategory] = useState('Structural');
  const [newBillUnit, setNewBillUnit] = useState('Bags');
  const [newBillQty, setNewBillQty] = useState<number | ''>(100);
  const [newBillRate, setNewBillRate] = useState<number | ''>(430);
  const [newBillGstRate, setNewBillGstRate] = useState<number>(18);
  const [newBillNumber, setNewBillNumber] = useState('');
  const [newBillVendor, setNewBillVendor] = useState('');
  const [newBillVendorGstin, setNewBillVendorGstin] = useState('');
  const [newBillDate, setNewBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [newBillNotes, setNewBillNotes] = useState('');
  const [newBillInvoiceFileName, setNewBillInvoiceFileName] = useState('');
  const [newBillInvoiceUrl, setNewBillInvoiceUrl] = useState('');

  // Keep project filter in sync with top dropdown if changed
  useMemo(() => {
    setFilterProject(selectedProjectId);
  }, [selectedProjectId]);

  const getProjectName = (pId: string) => {
    const p = projects.find((proj) => proj.id === pId);
    return p ? p.name : 'Unknown Project';
  };

  // Compile Unified Bill List from materials and addition transactions
  const allBills: UnifiedBillItem[] = useMemo(() => {
    const list: UnifiedBillItem[] = [];

    // 1. Inward Transactions (Additions)
    transactions
      .filter((t) => t.type === 'addition')
      .forEach((tx) => {
        const mat = materials.find((m) => m.id === tx.materialId);
        const resolvedType = resolveTransactionBillType(tx, mat);
        const code = mat ? resolveMaterialCode(mat) : '001';
        const group = mat?.materialGroup || 'General Construction Materials';
        const category = mat?.category || 'Structural';
        const unit = mat?.unit || 'Units';
        const qty = tx.quantity || 0;
        const rate = tx.rate || mat?.unitCost || 0;
        const gstRate = resolvedType === 'GST' ? (tx.gstRate !== undefined ? tx.gstRate : 18) : 0;
        
        const financials = calculateBillFinancials(
          resolvedType,
          qty,
          rate,
          gstRate,
          tx.totalPrice
        );

        list.push({
          id: `tx-bill-${tx.id}`,
          sourceType: 'transaction',
          sourceId: tx.id,
          projectId: tx.projectId,
          projectName: getProjectName(tx.projectId),
          materialId: tx.materialId,
          materialName: mat ? mat.name : 'Stock Inward Material',
          materialCode: code,
          materialGroup: group,
          category,
          billType: resolvedType,
          billNumber: tx.billNumber || (resolvedType === 'GST' ? `GST-INV-${tx.id.replace('tx-', '')}` : `URD-VCH-${tx.id.replace('tx-', '')}`),
          date: tx.date || '2026-07-15',
          vendorName: tx.vendorName || mat?.vendorName || (resolvedType === 'GST' ? 'Authorized Tax Supplier' : 'Local Unregistered Vendor'),
          vendorGstin: tx.vendorGstin || mat?.vendorGstin,
          quantity: qty,
          unit,
          unitRate: rate,
          baseAmount: tx.baseAmount || financials.baseAmount,
          gstRate,
          gstAmount: tx.gstAmount !== undefined ? tx.gstAmount : financials.gstAmount,
          cgstAmount: financials.cgstAmount,
          sgstAmount: financials.sgstAmount,
          totalAmount: tx.totalPrice || financials.totalAmount,
          notes: tx.notes,
          invoiceUrl: tx.invoiceUrl,
          invoiceFileName: tx.invoiceFileName,
          operator: tx.operator,
        });
      });

    // 2. Initial Stock Materials (for baseline inventory purchases)
    materials.forEach((mat) => {
      // If material has initial stock > 0, include baseline procurement bill
      // Opening stock entered by bulk upload is not a purchase bill, so it is not listed here
      if (mat.currentStock > 0 && mat.billNumber !== 'OPENING-STOCK' && !mat.baseBillRemoved) {
        const resolvedType = resolveMaterialBillType(mat);
        const code = resolveMaterialCode(mat);
        const group = mat.materialGroup || 'General Construction Materials';
        const gstRate = resolvedType === 'GST' ? (mat.gstRate !== undefined ? mat.gstRate : 18) : 0;
        
        const financials = calculateBillFinancials(
          resolvedType,
          mat.currentStock,
          mat.unitCost,
          gstRate,
          mat.totalPrice
        );

        list.push({
          id: `mat-bill-${mat.id}`,
          sourceType: 'material',
          sourceId: mat.id,
          projectId: mat.projectId,
          projectName: getProjectName(mat.projectId),
          materialId: mat.id,
          materialName: mat.name,
          materialCode: code,
          materialGroup: group,
          category: mat.category,
          billType: resolvedType,
          billNumber: mat.billNumber || (resolvedType === 'GST' ? `GST-INV-${mat.id.slice(-6)}` : `URD-VCH-${mat.id.slice(-6)}`),
          date: mat.rateHistory?.[0]?.date || '2026-07-01',
          vendorName: mat.vendorName || (resolvedType === 'GST' ? 'Registered Material Distributor' : 'Local Unregistered Quarry / Kiln'),
          vendorGstin: mat.vendorGstin,
          quantity: mat.currentStock,
          unit: mat.unit,
          unitRate: mat.unitCost,
          baseAmount: mat.baseAmount || financials.baseAmount,
          gstRate,
          gstAmount: mat.gstAmount !== undefined ? mat.gstAmount : financials.gstAmount,
          cgstAmount: financials.cgstAmount,
          sgstAmount: financials.sgstAmount,
          totalAmount: mat.totalPrice || financials.totalAmount,
          notes: 'Base stock initial catalog procurement',
        });
      }
    });

    return list;
  }, [materials, transactions, projects]);

  // Filtered Bills
  const filteredBills = useMemo(() => {
    return allBills
      .filter((bill) => {
        // Project filter
        if (filterProject !== 'all' && bill.projectId !== filterProject) return false;

        // Sub-tab filter
        if (activeSubTab === 'gst' && bill.billType !== 'GST') return false;
        if (activeSubTab === 'urd' && bill.billType !== 'URD') return false;

        // Category filter
        if (filterCategory !== 'All' && bill.category !== filterCategory) return false;

        // GST Rate filter
        if (filterGstRate !== 'All') {
          if (filterGstRate === 'URD' && bill.billType !== 'URD') return false;
          if (filterGstRate !== 'URD' && (bill.billType !== 'GST' || bill.gstRate !== Number(filterGstRate))) {
            return false;
          }
        }

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchBill = bill.billNumber.toLowerCase().includes(q);
          const matchVendor = bill.vendorName.toLowerCase().includes(q);
          const matchMat = bill.materialName.toLowerCase().includes(q);
          const matchCode = bill.materialCode.toLowerCase().includes(q);
          const matchGstin = bill.vendorGstin?.toLowerCase().includes(q);
          if (!matchBill && !matchVendor && !matchMat && !matchCode && !matchGstin) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'date-desc') return new Date(b.date).getTime() - new Date(a.date).getTime();
        if (sortBy === 'date-asc') return new Date(a.date).getTime() - new Date(b.date).getTime();
        if (sortBy === 'amount-desc') return b.totalAmount - a.totalAmount;
        if (sortBy === 'amount-asc') return a.totalAmount - b.totalAmount;
        if (sortBy === 'vendor') return a.vendorName.localeCompare(b.vendorName);
        return 0;
      });
  }, [allBills, filterProject, activeSubTab, filterCategory, filterGstRate, searchQuery, sortBy]);

  // The register lists the 20 most recent bills; older ones only on request
  const [showOlderBills, setShowOlderBills] = useState(false);
  const RECENT_BILLS = 20;
  const visibleBills = useMemo(() => {
    if (showOlderBills || filteredBills.length <= RECENT_BILLS) return filteredBills;
    const recentIds = new Set(
      [...filteredBills]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, RECENT_BILLS)
        .map((b) => b.id)
    );
    return filteredBills.filter((b) => recentIds.has(b.id));
  }, [filteredBills, showOlderBills]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalSpend = 0;
    let totalGstInvoiced = 0;
    let totalGstBase = 0;
    let totalGstTax = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let gstCount = 0;

    let totalUrdSpend = 0;
    let urdCount = 0;

    // Based on filtered project scope (or all)
    const scopeBills = filterProject === 'all' 
      ? allBills 
      : allBills.filter(b => b.projectId === filterProject);

    scopeBills.forEach((b) => {
      totalSpend += b.totalAmount;
      if (b.billType === 'GST') {
        gstCount++;
        totalGstInvoiced += b.totalAmount;
        totalGstBase += b.baseAmount;
        totalGstTax += b.gstAmount;
        totalCgst += b.cgstAmount;
        totalSgst += b.sgstAmount;
      } else {
        urdCount++;
        totalUrdSpend += b.totalAmount;
      }
    });

    const gstPercentage = totalSpend > 0 ? (totalGstInvoiced / totalSpend) * 100 : 0;
    const urdPercentage = totalSpend > 0 ? (totalUrdSpend / totalSpend) * 100 : 0;

    return {
      totalSpend,
      totalBillsCount: scopeBills.length,
      gstCount,
      totalGstInvoiced,
      totalGstBase,
      totalGstTax,
      totalCgst,
      totalSgst,
      gstPercentage,
      urdCount,
      totalUrdSpend,
      urdPercentage,
    };
  }, [allBills, filterProject]);

  // Group by Code for code-wise breakdown view
  const codeWiseData = useMemo(() => {
    const map = new Map<string, {
      code: string;
      groupName: string;
      totalSpend: number;
      gstSpend: number;
      gstTax: number;
      urdSpend: number;
      gstCount: number;
      urdCount: number;
      bills: UnifiedBillItem[];
    }>();

    filteredBills.forEach((b) => {
      const existing = map.get(b.materialCode) || {
        code: b.materialCode,
        groupName: b.materialGroup,
        totalSpend: 0,
        gstSpend: 0,
        gstTax: 0,
        urdSpend: 0,
        gstCount: 0,
        urdCount: 0,
        bills: [],
      };

      existing.totalSpend += b.totalAmount;
      if (b.billType === 'GST') {
        existing.gstSpend += b.totalAmount;
        existing.gstTax += b.gstAmount;
        existing.gstCount++;
      } else {
        existing.urdSpend += b.totalAmount;
        existing.urdCount++;
      }
      existing.bills.push(b);
      map.set(b.materialCode, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.totalSpend - a.totalSpend);
  }, [filteredBills]);

  // Group by Vendor for vendor-wise view
  const vendorWiseData = useMemo(() => {
    const map = new Map<string, {
      vendorName: string;
      vendorGstin?: string;
      totalSpend: number;
      gstSpend: number;
      urdSpend: number;
      billsCount: number;
      primaryType: BillType;
      bills: UnifiedBillItem[];
    }>();

    filteredBills.forEach((b) => {
      const vKey = b.vendorName.trim().toLowerCase();
      const existing = map.get(vKey) || {
        vendorName: b.vendorName,
        vendorGstin: b.vendorGstin,
        totalSpend: 0,
        gstSpend: 0,
        urdSpend: 0,
        billsCount: 0,
        primaryType: b.billType,
        bills: [],
      };

      existing.totalSpend += b.totalAmount;
      if (b.billType === 'GST') existing.gstSpend += b.totalAmount;
      else existing.urdSpend += b.totalAmount;
      existing.billsCount++;
      if (b.vendorGstin) existing.vendorGstin = b.vendorGstin;
      existing.bills.push(b);
      map.set(vKey, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.totalSpend - a.totalSpend);
  }, [filteredBills]);

  // Live calculation for the Add Bill modal
  const newBillFinancials = useMemo(() => {
    const qty = Number(newBillQty) || 0;
    const rate = Number(newBillRate) || 0;
    return calculateBillFinancials(newBillType, qty, rate, newBillGstRate);
  }, [newBillType, newBillQty, newBillRate, newBillGstRate]);

  // Handle Submission of New Bill Record
  const handleRecordBillSubmit = (e: FormEvent) => {
    e.preventDefault();

    const targetMat = materials.find((m) => m.id === newBillMaterialId);
    const finalMatName = targetMat ? targetMat.name : (newBillCustomMatName.trim() || 'Purchased Construction Resource');
    const finalQty = Number(newBillQty) || 1;
    const finalRate = Number(newBillRate) || 0;

    const financials = calculateBillFinancials(
      newBillType,
      finalQty,
      finalRate,
      newBillGstRate
    );

    const generatedNumber = newBillNumber.trim() || (newBillType === 'GST' ? `GST-INV-${Date.now().toString().slice(-5)}` : `URD-VCH-${Date.now().toString().slice(-5)}`);

    if (onAddBillTransaction && targetMat) {
      onAddBillTransaction({
        projectId: newBillProjectId,
        materialId: targetMat.id,
        type: 'addition',
        quantity: finalQty,
        rate: finalRate,
        totalPrice: financials.totalAmount,
        baseAmount: financials.baseAmount,
        gstRate: newBillType === 'GST' ? newBillGstRate : 0,
        gstAmount: financials.gstAmount,
        billType: newBillType,
        billNumber: generatedNumber,
        vendorName: newBillVendor.trim() || (newBillType === 'GST' ? 'Authorized GST Supplier' : 'Local Unregistered Dealer'),
        vendorGstin: newBillVendorGstin.trim() || undefined,
        invoiceUrl: newBillInvoiceUrl || undefined,
        invoiceFileName: newBillInvoiceFileName || undefined,
        date: newBillDate,
        notes: newBillNotes.trim() || `Inward Bill ${generatedNumber} (${newBillType})`,
        operator: currentUser?.name || 'Site Engineer',
      });
    }

    // Reset & Close
    setIsRecordBillOpen(false);
    setNewBillNumber('');
    setNewBillVendor('');
    setNewBillVendorGstin('');
    setNewBillNotes('');
    setNewBillInvoiceFileName('');
    setNewBillInvoiceUrl('');
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = [
      'Bill Type',
      'Bill Number',
      'Date',
      'Project',
      'Material Code',
      'Material Name',
      'Category',
      'Vendor Name',
      'Vendor GSTIN',
      'Quantity',
      'Unit',
      'Unit Rate (Rs)',
      'Taxable Base Amount (Rs)',
      'GST Rate (%)',
      'GST Amount (Rs)',
      'CGST (Rs)',
      'SGST (Rs)',
      'Grand Total Amount (Rs)',
      'Notes',
    ];

    const rows = filteredBills.map((b) => [
      b.billType,
      `"${b.billNumber}"`,
      b.date,
      `"${b.projectName}"`,
      `"#${b.materialCode}"`,
      `"${b.materialName}"`,
      `"${b.category}"`,
      `"${b.vendorName}"`,
      `"${b.vendorGstin || 'N/A'}"`,
      b.quantity,
      b.unit,
      b.unitRate,
      b.baseAmount,
      b.billType === 'GST' ? `${b.gstRate}%` : '0% (URD)',
      b.gstAmount,
      b.cgstAmount,
      b.sgstAmount,
      b.totalAmount,
      `"${b.notes || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `GST_URD_Bills_Register_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200" id="gst-urd-bills-container">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#23408e] text-white flex items-center justify-center shrink-0">
            <Receipt size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">GST &amp; URD Bill Details &amp; Financial Register</h1>
            <p className="text-xs text-slate-500">
              Tax invoices from registered vendors (GST with input credit) and unregistered dealer purchases (URD non-tax vouchers) with running totals.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {[
            {
              id: 'btn-print-bills-report',
              label: 'Print Tax Register',
              icon: <Printer size={18} />,
              onClick: () => window.print(),
              cls: 'border border-slate-300 text-slate-700 bg-white hover:bg-slate-50',
            },
            {
              id: 'btn-export-bills-csv',
              label: 'Export Register (CSV)',
              icon: <Download size={18} />,
              onClick: handleExportCsv,
              cls: 'border border-[#23408e] text-[#23408e] bg-white hover:bg-[#f5f8fd]',
            },
            {
              id: 'btn-record-new-bill',
              label: 'Record GST / URD Bill',
              icon: <Plus size={19} />,
              onClick: () => {
                if (materials.length > 0) {
                  setNewBillMaterialId(materials[0].id);
                  setNewBillUnit(materials[0].unit);
                  setNewBillRate(materials[0].unitCost);
                }
                setIsRecordBillOpen(true);
              },
              cls: 'bg-[#23408e] hover:bg-[#1b3170] text-white',
            },
          ].map((b) => (
            <div key={b.id} className="relative group">
              <button
                id={b.id}
                type="button"
                onClick={b.onClick}
                aria-label={b.label}
                className={`w-10 h-10 rounded-lg inline-flex items-center justify-center cursor-pointer transition-colors focus:outline-hidden focus:ring-2 focus:ring-[#23408e]/30 ${b.cls}`}
              >
                {b.icon}
              </button>
              {/* Name shown on hover / keyboard focus */}
              <span
                role="tooltip"
                className="pointer-events-none absolute right-0 top-full mt-2 z-30 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
              >
                {b.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total spend */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between min-w-0">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Invoiced Procurement</span>
            <p className="text-2xl font-bold text-slate-900 mt-1 break-words">Rs. {metrics.totalSpend.toLocaleString('en-IN')}</p>
            <span className="text-[11px] text-slate-500">
              Across {metrics.totalBillsCount} inward &amp; catalogue bills ({getProjectName(filterProject)})
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span className="text-[#23408e]">GST {metrics.gstPercentage.toFixed(1)}%</span>
              <span className="text-amber-700">URD {metrics.urdPercentage.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden flex">
              <div className="bg-[#23408e] h-full transition-all duration-500" style={{ width: `${metrics.gstPercentage}%` }} />
              <div className="bg-amber-400 h-full transition-all duration-500" style={{ width: `${metrics.urdPercentage}%` }} />
            </div>
          </div>
        </div>

        {/* GST */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">GST Invoices</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2] whitespace-nowrap">
                {metrics.gstCount} bills • {metrics.gstPercentage.toFixed(1)}%
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1 break-words">Rs. {metrics.totalGstInvoiced.toLocaleString('en-IN')}</p>
            <span className="text-[11px] text-slate-500">Total GST invoiced (tax inclusive)</span>
          </div>
          <dl className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-[11px] text-slate-500">Taxable base value</dt>
              <dd className="font-semibold text-slate-900">Rs. {metrics.totalGstBase.toLocaleString('en-IN')}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">GST paid (input credit)</dt>
              <dd className="font-semibold text-[#23408e]">Rs. {metrics.totalGstTax.toLocaleString('en-IN')}</dd>
            </div>
            <div className="col-span-2 text-[11px] text-slate-500 flex items-center gap-2">
              <span>CGST: Rs. {metrics.totalCgst.toLocaleString('en-IN')}</span>
              <span>•</span>
              <span>SGST: Rs. {metrics.totalSgst.toLocaleString('en-IN')}</span>
            </div>
          </dl>
        </div>

        {/* URD */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">URD Bills</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-amber-50 text-amber-800 border-amber-200 whitespace-nowrap">
                {metrics.urdCount} vouchers • {metrics.urdPercentage.toFixed(1)}%
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1 break-words">Rs. {metrics.totalUrdSpend.toLocaleString('en-IN')}</p>
            <span className="text-[11px] text-slate-500">Unregistered dealer purchases (0% tax)</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500">Tax type</span>
              <span className="font-semibold text-slate-900">Nil / Non-GST cash voucher</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">
              For local quarries, sanla, sand and unregistered artisan supplies under Section 9(4).
            </p>
          </div>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto" id="bill-type-subtabs" role="tablist">
        {(
          [
            ['all', 'subtab-all-bills', <Layers key="i" size={14} />, `All Bills (${allBills.length})`],
            ['gst', 'subtab-gst-bills', <span key="i" className="w-2 h-2 rounded-full bg-[#23408e]" />, `GST Invoices (${metrics.gstCount})`],
            ['urd', 'subtab-urd-bills', <span key="i" className="w-2 h-2 rounded-full bg-amber-400" />, `URD Vouchers (${metrics.urdCount})`],
            ['by-code', 'subtab-code-breakdown', <Hash key="i" size={14} />, 'Code-wise Breakdown'],
            ['by-vendor', 'subtab-vendor-breakdown', <Building2 key="i" size={14} />, 'Vendor Register'],
          ] as const
        ).map(([tab, id, icon, label]) => (
          <button
            key={tab}
            id={id}
            role="tab"
            aria-selected={activeSubTab === tab}
            onClick={() => setActiveSubTab(tab)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
              activeSubTab === tab ? 'border-[#23408e] text-[#23408e]' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Search and filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            id="input-search-bills"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by bill #, vendor, material or code"
            aria-label="Search bills"
            className="flex-1 min-w-0 text-sm py-1 focus:outline-hidden"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={13} className="text-slate-500" />
          <select
            id="select-bill-project"
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            aria-label="Filter by project"
            className="bg-white border border-slate-300 text-slate-800 text-sm rounded-lg px-3 py-1.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20 cursor-pointer"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            id="select-bill-tax-rate"
            value={filterGstRate}
            onChange={(e) => setFilterGstRate(e.target.value)}
            aria-label="Filter by tax rate"
            className="bg-white border border-slate-300 text-slate-800 text-sm rounded-lg px-3 py-1.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20 cursor-pointer"
          >
            <option value="All">Tax Rate: All Rates</option>
            <option value="18">18% GST Standard</option>
            <option value="28">28% GST Heavy/Luxury</option>
            <option value="12">12% GST Works</option>
            <option value="5">5% GST Basic</option>
            <option value="URD">0% URD (Unregistered)</option>
          </select>
          <select
            id="select-bill-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            aria-label="Sort bills"
            className="bg-white border border-slate-300 text-slate-800 text-sm rounded-lg px-3 py-1.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20 cursor-pointer"
          >
            <option value="date-desc">Date (Newest First)</option>
            <option value="date-asc">Date (Oldest First)</option>
            <option value="amount-desc">Amount (Highest First)</option>
            <option value="amount-asc">Amount (Lowest First)</option>
            <option value="vendor">Vendor Name (A-Z)</option>
          </select>
        </div>
      </div>

      {/* VIEW 1: All Bills / GST / URD Table */}
      {(activeSubTab === 'all' || activeSubTab === 'gst' || activeSubTab === 'urd') && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Receipt size={16} className="text-[#23408e]" />
              {activeSubTab === 'all' && 'Consolidated GST & URD Bills Register'}
              {activeSubTab === 'gst' && 'GST Registered Tax Invoices'}
              {activeSubTab === 'urd' && 'URD Unregistered Dealer Vouchers'}
              <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-slate-100 text-slate-700 border-slate-200">
                {visibleBills.length < filteredBills.length ? `${visibleBills.length} most recent of ${filteredBills.length}` : `${filteredBills.length} records`}
              </span>
            </h3>

            <div className="text-xs text-slate-500">
              Total Invoiced:{' '}
              <strong className="text-slate-900 font-bold">
                Rs. {filteredBills.reduce((acc, b) => acc + b.totalAmount, 0).toLocaleString('en-IN')}
              </strong>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" id="gst-urd-bills-table">
              <thead>
                <tr className="bg-[#23408e] text-white text-xs font-semibold uppercase tracking-wide">
                  <th className="px-3 py-3 w-8" aria-label="Details" />
                  <th className="px-3 py-3">Bill # &amp; Date</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Material</th>
                  <th className="px-3 py-3">Vendor</th>
                  <th className="px-3 py-3 text-right">Grand Total</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {filteredBills.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                      No GST or URD bills match your search criteria.
                    </td>
                  </tr>
                ) : (
                  visibleBills.map((bill) => {
                    const isGst = bill.billType === 'GST';
                    const isOpen = expandedBillId === bill.id;
                    const toggle = () => setExpandedBillId(isOpen ? null : bill.id);
                    const iconBtn = 'p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-[#23408e] hover:border-[#c9d6f2] hover:bg-[#f5f8fd] transition-colors cursor-pointer';
                    return (
                      <Fragment key={bill.id}>
                        <tr
                          id={`bill-row-${bill.id}`}
                          onClick={toggle}
                          className={`border-b border-slate-100 hover:bg-[#f5f8fd] transition-colors cursor-pointer ${isOpen ? 'bg-[#f5f8fd]' : ''}`}
                        >
                          <td className="px-3 py-3 text-slate-400">
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              aria-label={isOpen ? 'Hide bill details' : 'Show bill details'}
                              onClick={(e) => { e.stopPropagation(); toggle(); }}
                              className="cursor-pointer hover:text-slate-700"
                            >
                              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="font-semibold text-slate-900 font-mono text-xs">{bill.billNumber}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">{bill.date}</div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {isGst ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]">
                                GST {bill.gstRate}%
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-amber-50 text-amber-800 border-amber-200">
                                URD
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-semibold text-slate-900">{bill.materialName}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {bill.quantity.toLocaleString('en-IN')} {bill.unit} @ Rs. {bill.unitRate.toLocaleString('en-IN')}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-slate-700 min-w-[160px]">{bill.vendorName}</td>
                          <td className="px-3 py-3 text-right whitespace-nowrap font-semibold text-slate-900">
                            Rs. {bill.totalAmount.toLocaleString('en-IN')}
                          </td>
                          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                id={`btn-view-slip-${bill.id}`}
                                onClick={() => setSelectedBillForSlip(bill)}
                                aria-label="View bill slip"
                                title="View printable tax invoice / URD slip"
                                className={iconBtn}
                              >
                                <FileText size={14} />
                              </button>
                              {bill.sourceType === 'material' && onUpdateMaterialBillType && (
                                <button
                                  id={`btn-edit-bill-${bill.id}`}
                                  onClick={() => setEditingBill(bill)}
                                  aria-label="Edit bill"
                                  title="Change bill type (GST/URD) or invoice details"
                                  className={iconBtn}
                                >
                                  <Edit3 size={14} />
                                </button>
                              )}
                              {onDeleteBill && (
                                <button
                                  id={`btn-delete-bill-${bill.id}`}
                                  onClick={() => setDeleteBillTarget(bill)}
                                  aria-label={`Delete bill ${bill.billNumber}`}
                                  title="Delete this bill"
                                  className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-colors cursor-pointer"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr id={`bill-details-${bill.id}`} className="bg-[#f5f8fd] border-b border-slate-200">
                            <td />
                            <td colSpan={6} className="px-3 pb-4 pt-1">
                              <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-3 text-sm">
                                {[
                                  ['Site / Project', bill.projectName],
                                  ['Material code', `#${bill.materialCode} - ${bill.materialGroup}`],
                                  ['Category', bill.category],
                                  ['Vendor GSTIN', bill.vendorGstin || (isGst ? '—' : 'Unregistered supplier')],
                                  ['Bill type', isGst ? `GST tax invoice (${bill.gstRate}%)` : 'URD voucher (0% tax)'],
                                  ['Quantity', `${bill.quantity.toLocaleString('en-IN')} ${bill.unit}`],
                                  ['Rate', `Rs. ${bill.unitRate.toLocaleString('en-IN')} / ${bill.unit}`],
                                  ['Taxable value', `Rs. ${bill.baseAmount.toLocaleString('en-IN')}`],
                                  ['GST', isGst ? `Rs. ${bill.gstAmount.toLocaleString('en-IN')} (CGST ${bill.cgstAmount.toLocaleString('en-IN')} + SGST ${bill.sgstAmount.toLocaleString('en-IN')})` : 'Nil'],
                                  ['Grand total', `Rs. ${bill.totalAmount.toLocaleString('en-IN')}`],
                                ].map(([k, v]) => (
                                  <div key={k} className="min-w-0">
                                    <dt className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{k}</dt>
                                    <dd className="text-slate-900 mt-0.5 break-words">{v}</dd>
                                  </div>
                                ))}
                                <div className="col-span-2 sm:col-span-3 lg:col-span-4 min-w-0">
                                  <dt className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Notes</dt>
                                  <dd className="text-slate-700 mt-0.5">{bill.notes || '—'}{bill.operator ? ` (recorded by ${bill.operator})` : ''}</dd>
                                </div>
                                <div className="min-w-0">
                                  <dt className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Invoice file</dt>
                                  <dd className="mt-0.5">
                                    {bill.invoiceUrl ? (
                                      <a href={bill.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-[#23408e] font-semibold hover:underline">
                                        {bill.invoiceFileName || 'View invoice'}
                                      </a>
                                    ) : (
                                      <span className="text-slate-500">None</span>
                                    )}
                                  </dd>
                                </div>
                              </dl>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {filteredBills.length > RECENT_BILLS && (
            <div className="px-4 py-2.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                {showOlderBills
                  ? `Showing all ${filteredBills.length} bills.`
                  : `Showing the ${RECENT_BILLS} most recent of ${filteredBills.length} bills. Totals above include all of them.`}
              </span>
              <button
                id="btn-toggle-older-bills"
                type="button"
                onClick={() => setShowOlderBills((v) => !v)}
                className="font-semibold text-[#23408e] hover:underline cursor-pointer"
              >
                {showOlderBills ? `Show only the ${RECENT_BILLS} most recent` : `Show ${filteredBills.length - RECENT_BILLS} older bills`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Delete bill confirmation */}
      <AnimatePresence>
        {deleteBillTarget && (
          <motion.div
            key="delete-bill-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50"
            onClick={() => setDeleteBillTarget(null)}
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-bill-title"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4"
            >
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 size={18} />
                </span>
                <div className="min-w-0">
                  <h3 id="delete-bill-title" className="text-base font-bold text-slate-900">Delete this bill?</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    <strong className="text-slate-900">{deleteBillTarget.billNumber}</strong> ({deleteBillTarget.date}) - {deleteBillTarget.materialName},{' '}
                    {deleteBillTarget.quantity.toLocaleString('en-IN')} {deleteBillTarget.unit}, Rs. {deleteBillTarget.totalAmount.toLocaleString('en-IN')} from {deleteBillTarget.vendorName}.
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    {deleteBillTarget.sourceType === 'transaction'
                      ? `The purchase entry is deleted too: the stock of ${deleteBillTarget.materialName} at ${deleteBillTarget.projectName} goes down by ${deleteBillTarget.quantity.toLocaleString('en-IN')} ${deleteBillTarget.unit}. This cannot be undone.`
                      : 'This opening-stock bill is removed from the register. The material and its stock are not changed. This cannot be undone.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  id="btn-cancel-delete-bill"
                  type="button"
                  autoFocus
                  onClick={() => setDeleteBillTarget(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-sm font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-confirm-delete-bill"
                  type="button"
                  onClick={() => {
                    onDeleteBill?.({ sourceType: deleteBillTarget.sourceType, sourceId: deleteBillTarget.sourceId });
                    if (expandedBillId === deleteBillTarget.id) setExpandedBillId(null);
                    setDeleteBillTarget(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* VIEW 2: Material Code Wise Breakdown */}
      {activeSubTab === 'by-code' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Hash size={16} className="text-[#23408e]" />
                Material Code Wise GST vs URD Procurement Summary
              </h3>
              <p className="text-xs text-slate-500">
                Analysis of tax compliant GST invoices vs non-tax URD vouchers aggregated by master material code (#001, #002...)
              </p>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]">
              {codeWiseData.length} Material Groups
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {codeWiseData.map((item) => {
              const gstPct = item.totalSpend > 0 ? (item.gstSpend / item.totalSpend) * 100 : 0;
              const urdPct = item.totalSpend > 0 ? (item.urdSpend / item.totalSpend) * 100 : 0;
              return (
                <div
                  key={item.code}
                  className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:border-[#c9d6f2] transition-colors flex flex-col justify-between space-y-4"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-[#23408e] text-white font-mono font-semibold text-xs rounded">
                          #{item.code}
                        </span>
                        <h4 className="font-semibold text-slate-900 text-sm">{item.groupName}</h4>
                      </div>
                      <span className="text-sm font-bold text-slate-900">
                        Rs. {item.totalSpend.toLocaleString('en-IN')}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-3 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold">
                        <span className="text-[#23408e]">GST: Rs. {item.gstSpend.toLocaleString('en-IN')} ({gstPct.toFixed(0)}%)</span>
                        <span className="text-amber-700">URD: Rs. {item.urdSpend.toLocaleString('en-IN')} ({urdPct.toFixed(0)}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden flex">
                        <div className="bg-[#23408e] h-full" style={{ width: `${gstPct}%` }} />
                        <div className="bg-amber-400 h-full" style={{ width: `${urdPct}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 text-xs">
                    <div className="bg-[#f5f8fd] p-2.5 rounded-lg border border-[#d9e3f5]">
                      <span className="text-[11px] text-slate-500 block">GST Invoices ({item.gstCount})</span>
                      <span className="font-semibold text-slate-900 text-sm">Rs. {item.gstSpend.toLocaleString('en-IN')}</span>
                      <span className="text-[11px] text-[#23408e] block mt-0.5">Tax: Rs. {item.gstTax.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100">
                      <span className="text-[11px] text-slate-500 block">URD Vouchers ({item.urdCount})</span>
                      <span className="font-semibold text-slate-900 text-sm">Rs. {item.urdSpend.toLocaleString('en-IN')}</span>
                      <span className="text-[11px] text-amber-700 block mt-0.5">0% Tax / Local</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 3: Vendor Register */}
      {activeSubTab === 'by-vendor' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building2 size={16} className="text-[#23408e]" />
              Vendor & Supplier Invoicing Register
            </h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-slate-100 text-slate-700 border-slate-200">
              {vendorWiseData.length} Vendors
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" id="vendor-bills-table">
              <thead>
                <tr className="bg-[#23408e] text-white text-xs font-semibold uppercase tracking-wide">
                  <th className="px-5 py-3.5">Vendor Name</th>
                  <th className="px-4 py-3.5">GSTIN / Status</th>
                  <th className="px-4 py-3.5 text-center">Bills Count</th>
                  <th className="px-4 py-3.5 text-right">GST Purchases</th>
                  <th className="px-4 py-3.5 text-right">URD Purchases</th>
                  <th className="px-5 py-3.5 text-right">Total Invoiced Amount</th>
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {vendorWiseData.map((v) => (
                  <tr key={v.vendorName} className="border-b border-slate-100 last:border-0 hover:bg-[#f5f8fd] transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-slate-900">
                      {v.vendorName}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {v.vendorGstin ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-mono font-semibold bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]">
                          {v.vendorGstin}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-amber-50 text-amber-800 border-amber-200">
                          Unregistered Vendor (URD)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center text-slate-700">
                      {v.billsCount}
                    </td>
                    <td className="px-4 py-3.5 text-right text-slate-800">
                      Rs. {v.gstSpend.toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3.5 text-right text-slate-800">
                      Rs. {v.urdSpend.toLocaleString('en-IN')}
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-slate-900">
                      Rs. {v.totalSpend.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: Record New GST / URD Bill */}
      <AnimatePresence>
        {isRecordBillOpen && (
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center z-50 p-4"
            id="record-bill-modal"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-xl rounded-2xl p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-[#23408e] text-white inline-flex items-center justify-center">
                    <Receipt size={18} />
                  </span>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-950">Record Inward Purchase Bill</h3>
                    <p className="text-xs text-slate-500">Choose between GST Tax Invoice or URD Cash Voucher</p>
                  </div>
                </div>
                <button
                  id="close-record-bill-modal"
                  onClick={() => setIsRecordBillOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleRecordBillSubmit} className="space-y-4 mt-4">
                {/* 1. Prominent Bill Type Selector */}
                <div>
                  <label className="block text-xs font-black text-slate-900 uppercase tracking-wider mb-2">
                    1. Select Bill Type *
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      id="choose-bill-type-gst"
                      onClick={() => {
                        setNewBillType('GST');
                        if (newBillGstRate === 0) setNewBillGstRate(18);
                      }}
                      className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                        newBillType === 'GST'
                          ? 'border-emerald-600 bg-emerald-50/80 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-emerald-950 uppercase tracking-wider">
                          GST Tax Invoice
                        </span>
                        <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                          newBillType === 'GST' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                        }`}>
                          {newBillType === 'GST' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-800 font-medium mt-1">
                        Registered Vendor with GSTIN. Input Tax Credit (ITC) claimable.
                      </p>
                    </button>

                    <button
                      type="button"
                      id="choose-bill-type-urd"
                      onClick={() => {
                        setNewBillType('URD');
                        setNewBillGstRate(0);
                      }}
                      className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                        newBillType === 'URD'
                          ? 'border-amber-500 bg-amber-50/80 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-amber-950 uppercase tracking-wider">
                          URD Bill / Voucher
                        </span>
                        <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                          newBillType === 'URD' ? 'border-amber-500 bg-amber-500' : 'border-slate-300'
                        }`}>
                          {newBillType === 'URD' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-800 font-medium mt-1">
                        Unregistered Dealer / Non-GST local sourcing. 0% Tax.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Project & Material Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Site / Project *
                    </label>
                    <select
                      id="new-bill-project"
                      value={newBillProjectId}
                      onChange={(e) => setNewBillProjectId(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-bold rounded-xl px-3 py-2.5 focus:outline-hidden cursor-pointer"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Material *
                    </label>
                    <select
                      id="new-bill-material"
                      value={newBillMaterialId}
                      onChange={(e) => {
                        const mId = e.target.value;
                        setNewBillMaterialId(mId);
                        const found = materials.find((m) => m.id === mId);
                        if (found) {
                          setNewBillUnit(found.unit);
                          setNewBillRate(found.unitCost);
                          setNewBillCode(resolveMaterialCode(found));
                        }
                      }}
                      className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-bold rounded-xl px-3 py-2.5 focus:outline-hidden cursor-pointer"
                    >
                      {materials
                        .filter((m) => newBillProjectId === 'all' || m.projectId === newBillProjectId)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            #{resolveMaterialCode(m)} - {m.name} ({m.unit})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Bill / Invoice # and Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      {newBillType === 'GST' ? 'GST Invoice Number *' : 'URD Voucher Number *'}
                    </label>
                    <input
                      id="new-bill-number-input"
                      type="text"
                      required
                      value={newBillNumber}
                      onChange={(e) => setNewBillNumber(e.target.value)}
                      placeholder={newBillType === 'GST' ? 'e.g. INV-2026/894' : 'e.g. URD-VCH-102'}
                      className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-bold rounded-xl px-3 py-2.5 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Bill Date *
                    </label>
                    <input
                      id="new-bill-date-input"
                      type="date"
                      required
                      value={newBillDate}
                      onChange={(e) => setNewBillDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-bold rounded-xl px-3 py-2.5 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Vendor Name and GSTIN */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Vendor / Supplier Name *
                    </label>
                    <input
                      id="new-bill-vendor-input"
                      type="text"
                      required
                      value={newBillVendor}
                      onChange={(e) => setNewBillVendor(e.target.value)}
                      placeholder={newBillType === 'GST' ? 'e.g. UltraTech Cement Ltd' : 'e.g. Local Quarry Traders'}
                      className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-medium rounded-xl px-3 py-2.5 focus:outline-hidden"
                    />
                  </div>

                  {newBillType === 'GST' ? (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Vendor GSTIN
                      </label>
                      <input
                        id="new-bill-vendor-gstin"
                        type="text"
                        value={newBillVendorGstin}
                        onChange={(e) => setNewBillVendorGstin(e.target.value)}
                        placeholder="e.g. 27AABCT3518Q1Z4"
                        className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-mono font-bold rounded-xl px-3 py-2.5 focus:outline-hidden"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Dealer Status
                      </label>
                      <input
                        type="text"
                        disabled
                        value="Unregistered Dealer (0% Tax)"
                        className="w-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold rounded-xl px-3 py-2.5"
                      />
                    </div>
                  )}
                </div>

                {/* Qty, Rate, GST Rate */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Quantity ({newBillUnit}) *
                    </label>
                    <input
                      id="new-bill-qty-input"
                      type="number"
                      min="0.01"
                      step="any"
                      required
                      value={newBillQty}
                      onChange={(e) => setNewBillQty(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-bold rounded-xl px-3 py-2.5 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Rate / Unit (Rs) *
                    </label>
                    <input
                      id="new-bill-rate-input"
                      type="number"
                      min="0.01"
                      step="any"
                      required
                      value={newBillRate}
                      onChange={(e) => setNewBillRate(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-bold rounded-xl px-3 py-2.5 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      GST Rate (%)
                    </label>
                    {newBillType === 'GST' ? (
                      <select
                        id="new-bill-gst-rate-select"
                        value={newBillGstRate}
                        onChange={(e) => setNewBillGstRate(Number(e.target.value))}
                        className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-bold rounded-xl px-3 py-2.5 focus:outline-hidden cursor-pointer"
                      >
                        <option value={18}>18% Standard</option>
                        <option value={28}>28% Heavy/Luxury</option>
                        <option value={12}>12% Works</option>
                        <option value={5}>5% Basic</option>
                        <option value={0}>0% Nil</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        disabled
                        value="0% (URD)"
                        className="w-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold rounded-xl px-3 py-2.5"
                      />
                    )}
                  </div>
                </div>

                {/* Financial Summary Preview Box */}
                <div className={`p-4 rounded-xl border ${newBillType === 'GST' ? 'bg-emerald-50/70 border-emerald-200' : 'bg-amber-50/70 border-amber-200'}`}>
                  <div className="text-xs font-extrabold uppercase tracking-wider mb-2 text-slate-900 flex items-center justify-between">
                    <span>Live Bill Calculation</span>
                    <span className="text-[10px] font-bold text-slate-500">Auto-Computed</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold block">Taxable Base:</span>
                      <span className="font-extrabold text-slate-900">
                        Rs. {newBillFinancials.baseAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold block">
                        {newBillType === 'GST' ? `GST (${newBillGstRate}%):` : 'Tax:'}
                      </span>
                      <span className="font-medium text-[#23408e]">
                        {newBillType === 'GST' ? `+ Rs. ${newBillFinancials.gstAmount.toLocaleString('en-IN')}` : 'Rs. 0 (Nil)'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold block">Grand Total:</span>
                      <span className="font-semibold text-slate-900">
                        Rs. {newBillFinancials.totalAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Notes & File Attachment */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Notes / Remarks
                  </label>
                  <input
                    id="new-bill-notes-input"
                    type="text"
                    value={newBillNotes}
                    onChange={(e) => setNewBillNotes(e.target.value)}
                    placeholder="e.g. Delivery Challan #8841 / Approved for Slab Work"
                    className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-medium rounded-xl px-3 py-2 focus:outline-hidden"
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-200">
                  <button
                    id="btn-cancel-record-bill"
                    type="button"
                    onClick={() => setIsRecordBillOpen(false)}
                    className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    id="btn-submit-record-bill"
                    type="submit"
                    className="flex-1 bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold py-2.5 rounded-lg transition-colors cursor-pointer"
                  >
                    Save & Record Bill
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: View Printable Slip / Voucher */}
      <AnimatePresence>
        {selectedBillForSlip && (
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
            id="bill-slip-modal"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-2xl p-6 shadow-2xl border border-slate-200"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 text-white font-black text-xs rounded-lg uppercase tracking-wider ${
                    selectedBillForSlip.billType === 'GST' ? 'bg-emerald-600' : 'bg-amber-600'
                  }`}>
                    {selectedBillForSlip.billType === 'GST' ? 'GST TAX INVOICE' : 'URD PURCHASE VOUCHER'}
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-500">
                    #{selectedBillForSlip.billNumber}
                  </span>
                </div>
                <button
                  id="close-bill-slip-modal"
                  onClick={() => setSelectedBillForSlip(null)}
                  className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Printable Slip Content */}
              <div className="py-5 space-y-4 text-xs">
                <div className="flex justify-between items-start pb-4 border-b border-slate-100">
                  <div>
                    <h4 className="text-base font-extrabold text-slate-950">
                      {selectedBillForSlip.projectName}
                    </h4>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Site Inward Purchase Register Slip
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-slate-700 block">Date: {selectedBillForSlip.date}</span>
                    <span className="text-[10px] text-slate-400 font-medium">Logged by: {selectedBillForSlip.operator || 'Site Manager'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block uppercase">Vendor / Supplier:</span>
                    <span className="font-bold text-slate-900 text-xs">{selectedBillForSlip.vendorName}</span>
                    {selectedBillForSlip.vendorGstin && (
                      <span className="text-[10px] font-mono text-emerald-800 block mt-0.5">
                        GSTIN: {selectedBillForSlip.vendorGstin}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block uppercase">Material Resource:</span>
                    <span className="font-semibold text-slate-900">
                      #{selectedBillForSlip.materialCode} - {selectedBillForSlip.materialName}
                    </span>
                    <span className="text-[10px] text-slate-500 block">{selectedBillForSlip.category}</span>
                  </div>
                </div>

                {/* Line Item Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[#23408e] text-[11px] font-semibold uppercase text-white">
                      <tr>
                        <th className="p-2.5">Particulars</th>
                        <th className="p-2.5 text-right">Qty</th>
                        <th className="p-2.5 text-right">Rate</th>
                        <th className="p-2.5 text-right">Base (Rs)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="p-2.5 font-bold text-slate-900">{selectedBillForSlip.materialName}</td>
                        <td className="p-2.5 text-right">{selectedBillForSlip.quantity} {selectedBillForSlip.unit}</td>
                        <td className="p-2.5 text-right">Rs. {selectedBillForSlip.unitRate}</td>
                        <td className="p-2.5 text-right font-bold">Rs. {selectedBillForSlip.baseAmount.toLocaleString('en-IN')}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Financial Summary */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-slate-600">
                    <span>Taxable Base Value:</span>
                    <span className="font-bold">Rs. {selectedBillForSlip.baseAmount.toLocaleString('en-IN')}</span>
                  </div>

                  {selectedBillForSlip.billType === 'GST' ? (
                    <>
                      <div className="flex justify-between text-emerald-800">
                        <span>CGST ({(selectedBillForSlip.gstRate / 2)}%):</span>
                        <span className="font-bold">Rs. {selectedBillForSlip.cgstAmount.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-emerald-800">
                        <span>SGST ({(selectedBillForSlip.gstRate / 2)}%):</span>
                        <span className="font-bold">Rs. {selectedBillForSlip.sgstAmount.toLocaleString('en-IN')}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between text-amber-800">
                      <span>URD Purchase Tax (0% Nil):</span>
                      <span className="font-bold">Rs. 0</span>
                    </div>
                  )}

                  <div className="flex justify-between text-base font-black text-slate-950 pt-2 border-t border-slate-200">
                    <span>Grand Total Invoiced:</span>
                    <span className="text-emerald-950">Rs. {selectedBillForSlip.totalAmount.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {selectedBillForSlip.notes && (
                  <p className="text-[11px] text-slate-500 italic bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    Note: {selectedBillForSlip.notes}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200">
                <button
                  id="btn-close-voucher-slip"
                  onClick={() => setSelectedBillForSlip(null)}
                  className="w-full bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold py-2.5 rounded-lg cursor-pointer transition-colors text-center"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: Edit Bill Reclassification */}
      <AnimatePresence>
        {editingBill && (
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center z-50 p-4"
            id="edit-bill-type-modal"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl border border-slate-200"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h3 className="text-base font-extrabold text-slate-950 flex items-center gap-2">
                  <Edit3 size={18} className="text-amber-600" />
                  Edit Bill Type & Details
                </h3>
                <button
                  id="close-edit-bill-modal"
                  onClick={() => setEditingBill(null)}
                  className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="py-4 space-y-4 text-xs">
                <p className="text-slate-600 font-medium">
                  Update invoice classification for <strong className="text-slate-950 font-bold">{editingBill.materialName}</strong>:
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Bill Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBill({
                          ...editingBill,
                          billType: 'GST',
                          gstRate: 18,
                        });
                      }}
                      className={`p-2.5 rounded-xl border font-bold text-xs cursor-pointer ${
                        editingBill.billType === 'GST'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-black'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      GST Tax Invoice
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBill({
                          ...editingBill,
                          billType: 'URD',
                          gstRate: 0,
                        });
                      }}
                      className={`p-2.5 rounded-xl border font-bold text-xs cursor-pointer ${
                        editingBill.billType === 'URD'
                          ? 'border-amber-500 bg-amber-50 text-amber-950 font-black'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      URD Voucher
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Bill / Voucher #
                  </label>
                  <input
                    type="text"
                    value={editingBill.billNumber}
                    onChange={(e) => setEditingBill({ ...editingBill, billNumber: e.target.value })}
                    className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-bold rounded-xl px-3 py-2 focus:outline-hidden"
                  />
                </div>

                {editingBill.billType === 'GST' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Vendor GSTIN
                    </label>
                    <input
                      type="text"
                      value={editingBill.vendorGstin || ''}
                      onChange={(e) => setEditingBill({ ...editingBill, vendorGstin: e.target.value })}
                      placeholder="e.g. 27AABCT3518Q1Z4"
                      className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-mono font-bold rounded-xl px-3 py-2 focus:outline-hidden"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingBill(null)}
                  className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-2.5 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onUpdateMaterialBillType && editingBill.materialId) {
                      onUpdateMaterialBillType(
                        editingBill.materialId,
                        editingBill.billType,
                        editingBill.billNumber,
                        editingBill.gstRate,
                        editingBill.vendorGstin
                      );
                    }
                    setEditingBill(null);
                  }}
                  className="flex-1 bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold py-2.5 rounded-lg cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
