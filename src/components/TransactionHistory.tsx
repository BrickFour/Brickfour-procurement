import { useState, useMemo, useEffect, FormEvent } from 'react';
import { InventoryTransaction, Material, Project } from '../types';
import {
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  User,
  FileText,
  Trash2,
  Plus,
  X,
  Filter,
  Layers,
  Clock,
  TrendingUp,
  BarChart3,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type TimeframeMode = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'all';

export interface PeriodBucket {
  id: string;
  title: string;
  subtitle?: string;
  startDateStr: string; // YYYY-MM-DD
  endDateStr: string;   // YYYY-MM-DD
  isCurrent?: boolean;
}

interface TransactionHistoryProps {
  transactions: InventoryTransaction[];
  materials: Material[];
  projects: Project[];
  selectedProjectId: string;
  onAddTransaction: (tx: Omit<InventoryTransaction, 'id' | 'date'> & { date?: string }) => void;
  onRemoveTransaction: (id: string) => void;
  todayOnlyFilter?: boolean;
  onClearTodayFilter?: () => void;
  onToggleTodayFilter?: (enable: boolean) => void;
}

// Utility functions for string dates YYYY-MM-DD
function getTodayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysToStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const resY = dt.getFullYear();
  const resM = String(dt.getMonth() + 1).padStart(2, '0');
  const resD = String(dt.getDate()).padStart(2, '0');
  return `${resY}-${resM}-${resD}`;
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

function getMonthName(monthIndex: number): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[(monthIndex + 12) % 12];
}

function getLastDayOfMonth(year: number, monthZeroIndexed: number): number {
  return new Date(year, monthZeroIndexed + 1, 0).getDate();
}

export default function TransactionHistory({
  transactions,
  materials,
  projects,
  selectedProjectId,
  onAddTransaction,
  onRemoveTransaction,
  todayOnlyFilter,
  onClearTodayFilter,
  onToggleTodayFilter,
}: TransactionHistoryProps) {
  const todayStr = useMemo(() => getTodayStr(), []);

  // Timeframe Filter Mode: 'daily' (7 days), 'weekly' (4 weeks), 'monthly' (3 months), 'quarterly' (4 quarters), 'yearly' (all years), 'all'
  const [timeframeMode, setTimeframeMode] = useState<TimeframeMode>('daily');
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'addition' | 'consumption'>('all');
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [deleteTxTargetId, setDeleteTxTargetId] = useState<string | null>(null);

  // Form States
  const [formMaterialId, setFormMaterialId] = useState('');
  const [formType, setFormType] = useState<'addition' | 'consumption'>('consumption');
  const [formQty, setFormQty] = useState<number | ''>('');
  const [formRate, setFormRate] = useState<number | ''>('');
  const [formTotalPrice, setFormTotalPrice] = useState<number | ''>('');
  const [formVendor, setFormVendor] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formOperator, setFormOperator] = useState('');
  const [formDate, setFormDate] = useState(todayStr);
  const [formInvoiceFileName, setFormInvoiceFileName] = useState('');
  const [formInvoiceUrl, setFormInvoiceUrl] = useState('');

  // Sync todayOnlyFilter prop if triggered from parent
  useEffect(() => {
    if (todayOnlyFilter) {
      setTimeframeMode('daily');
      setSelectedBucketId(`daily-0`);
    }
  }, [todayOnlyFilter]);

  // Filtered materials for modal dropdown
  const availableMaterials = materials.filter(
    (m) => selectedProjectId === 'all' || m.projectId === selectedProjectId
  );

  // Calculate Period Buckets according to selected timeframeMode
  const periodBuckets = useMemo<PeriodBucket[]>(() => {
    const [currY, currM, currD] = todayStr.split('-').map(Number);

    if (timeframeMode === 'daily') {
      // Last 7 Days Daily Ledger
      const buckets: PeriodBucket[] = [];
      for (let i = 0; i < 7; i++) {
        const dateStr = addDaysToStr(todayStr, -i);
        let title = formatDateShort(dateStr);
        if (i === 0) title = 'Today';
        else if (i === 1) title = 'Yesterday';

        buckets.push({
          id: `daily-${i}`,
          title,
          subtitle: formatDateDisplay(dateStr),
          startDateStr: dateStr,
          endDateStr: dateStr,
          isCurrent: i === 0,
        });
      }
      return buckets;
    }

    if (timeframeMode === 'weekly') {
      // Last 4 Weeks Weekly Ledger
      const buckets: PeriodBucket[] = [];
      const labels = ['Week 1 (Current)', 'Week 2 (1 Wk Ago)', 'Week 3 (2 Wks Ago)', 'Week 4 (3 Wks Ago)'];
      for (let i = 0; i < 4; i++) {
        const endStr = addDaysToStr(todayStr, -(i * 7));
        const startStr = addDaysToStr(todayStr, -(i * 7 + 6));

        buckets.push({
          id: `weekly-${i}`,
          title: labels[i],
          subtitle: `${formatDateShort(startStr)} - ${formatDateShort(endStr)}`,
          startDateStr: startStr,
          endDateStr: endStr,
          isCurrent: i === 0,
        });
      }
      return buckets;
    }

    if (timeframeMode === 'monthly') {
      // Last 3 Months Monthly Ledger
      const buckets: PeriodBucket[] = [];
      for (let i = 0; i < 3; i++) {
        const dateObj = new Date(currY, currM - 1 - i, 1);
        const y = dateObj.getFullYear();
        const m = dateObj.getMonth(); // 0-indexed
        const lastDay = getLastDayOfMonth(y, m);

        const startStr = `${y}-${String(m + 1).padStart(2, '0')}-01`;
        const endStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        const monthName = dateObj.toLocaleDateString('en-US', { month: 'long' });

        const subtitles = ['Current Month', '1 Month Ago', '2 Months Ago'];

        buckets.push({
          id: `monthly-${i}`,
          title: `${monthName} ${y}`,
          subtitle: subtitles[i],
          startDateStr: startStr,
          endDateStr: endStr,
          isCurrent: i === 0,
        });
      }
      return buckets;
    }

    if (timeframeMode === 'quarterly') {
      // Last 4 Quarters Quarterly Ledger
      const buckets: PeriodBucket[] = [];
      const currentQuarterIndex = Math.floor((currM - 1) / 3); // 0, 1, 2, 3 for Q1, Q2, Q3, Q4

      for (let i = 0; i < 4; i++) {
        let qIdx = currentQuarterIndex - i;
        let qYear = currY;
        while (qIdx < 0) {
          qIdx += 4;
          qYear -= 1;
        }

        const startMonthZeroIndexed = qIdx * 3;
        const endMonthZeroIndexed = qIdx * 3 + 2;
        const lastDay = getLastDayOfMonth(qYear, endMonthZeroIndexed);

        const startStr = `${qYear}-${String(startMonthZeroIndexed + 1).padStart(2, '0')}-01`;
        const endStr = `${qYear}-${String(endMonthZeroIndexed + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const qLabels = ['Current Quarter', '1 Qtr Ago', '2 Qtrs Ago', '3 Qtrs Ago'];

        buckets.push({
          id: `quarterly-${i}`,
          title: `Q${qIdx + 1} ${qYear}`,
          subtitle: `${getMonthName(startMonthZeroIndexed)} - ${getMonthName(endMonthZeroIndexed)} ${qYear} (${qLabels[i]})`,
          startDateStr: startStr,
          endDateStr: endStr,
          isCurrent: i === 0,
        });
      }
      return buckets;
    }

    if (timeframeMode === 'yearly') {
      // All Years Yearly Ledger from start year
      let minYear = currY;
      transactions.forEach((tx) => {
        if (tx.date) {
          const y = parseInt(tx.date.split('-')[0], 10);
          if (!isNaN(y) && y < minYear) {
            minYear = y;
          }
        }
      });
      projects.forEach((p) => {
        if (p.startDate) {
          const y = parseInt(p.startDate.split('-')[0], 10);
          if (!isNaN(y) && y < minYear) {
            minYear = y;
          }
        }
      });

      // Ensure at least 2 years visible if minYear equals currY
      if (minYear === currY) {
        minYear = currY - 1;
      }

      const buckets: PeriodBucket[] = [];
      for (let y = currY; y >= minYear; y--) {
        buckets.push({
          id: `yearly-${y}`,
          title: `Year ${y}`,
          subtitle: y === currY ? 'Current Year Ledger' : `Historical Ledger (${y})`,
          startDateStr: `${y}-01-01`,
          endDateStr: `${y}-12-31`,
          isCurrent: y === currY,
        });
      }
      return buckets;
    }

    return [];
  }, [timeframeMode, todayStr, transactions, projects]);

  // Overall date boundaries for the selected timeframeMode
  const timeframeDateBounds = useMemo(() => {
    if (periodBuckets.length === 0) return null;
    const allStart = periodBuckets.map((b) => b.startDateStr).sort()[0];
    const allEnd = periodBuckets.map((b) => b.endDateStr).sort().reverse()[0];
    return { start: allStart, end: allEnd };
  }, [periodBuckets]);

  // Compute aggregated stats for each period bucket
  const bucketSummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        additionsCount: number;
        consumptionCount: number;
        additionsQty: number;
        consumptionQty: number;
        totalLogs: number;
      }
    >();

    periodBuckets.forEach((b) => {
      let addCount = 0;
      let consCount = 0;
      let addQty = 0;
      let consQty = 0;

      transactions.forEach((tx) => {
        const projMatches = selectedProjectId === 'all' || tx.projectId === selectedProjectId;
        if (projMatches && tx.date >= b.startDateStr && tx.date <= b.endDateStr) {
          if (tx.type === 'addition') {
            addCount++;
            addQty += tx.quantity;
          } else {
            consCount++;
            consQty += tx.quantity;
          }
        }
      });

      map.set(b.id, {
        additionsCount: addCount,
        consumptionCount: consCount,
        additionsQty: addQty,
        consumptionQty: consQty,
        totalLogs: addCount + consCount,
      });
    });

    return map;
  }, [periodBuckets, transactions, selectedProjectId]);

  // Filter transactions based on project, timeframe, bucket selection, type, and text search
  const filteredTransactions = useMemo(() => {
    const selectedBucket = periodBuckets.find((b) => b.id === selectedBucketId);

    return transactions
      .filter((tx) => {
        const projectMatches = selectedProjectId === 'all' || tx.projectId === selectedProjectId;
        if (!projectMatches) return false;

        const typeMatches = typeFilter === 'all' || tx.type === typeFilter;
        if (!typeMatches) return false;

        // Date Filter based on Timeframe Mode & selected Bucket
        if (selectedBucket) {
          if (tx.date < selectedBucket.startDateStr || tx.date > selectedBucket.endDateStr) {
            return false;
          }
        } else if (timeframeMode !== 'all' && timeframeDateBounds) {
          if (tx.date < timeframeDateBounds.start || tx.date > timeframeDateBounds.end) {
            return false;
          }
        }

        // Search text matching
        if (searchQuery.trim() !== '') {
          const q = searchQuery.toLowerCase();
          const material = materials.find((m) => m.id === tx.materialId);
          const materialName = material ? material.name.toLowerCase() : '';
          const notesMatch = tx.notes.toLowerCase().includes(q);
          const operatorMatch = tx.operator.toLowerCase().includes(q);
          const materialMatch = materialName.includes(q);
          if (!notesMatch && !operatorMatch && !materialMatch) return false;
        }

        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [
    transactions,
    selectedProjectId,
    typeFilter,
    selectedBucketId,
    periodBuckets,
    timeframeMode,
    timeframeDateBounds,
    searchQuery,
    materials,
  ]);

  const handleLogTransaction = (e: FormEvent) => {
    e.preventDefault();
    const qtyNum = Number(formQty);
    if (!formMaterialId || formQty === '' || isNaN(qtyNum) || qtyNum <= 0 || !formOperator.trim()) {
      alert('Please fill in all required fields with valid values.');
      return;
    }

    if (!formNotes.trim()) {
      alert('Please insert a compulsory reason / note for this stock movement.');
      return;
    }

    const selectedMat = materials.find((m) => m.id === formMaterialId);
    if (!selectedMat) return;

    if (formType === 'consumption' && qtyNum > selectedMat.currentStock) {
      alert('please insert valid values');
      return;
    }

    const rateVal = formType === 'addition' ? (Number(formRate) || selectedMat.unitCost) : undefined;
    const computedTotal = formType === 'addition'
      ? (formTotalPrice !== '' && !isNaN(Number(formTotalPrice)) ? Number(formTotalPrice) : (rateVal! * qtyNum))
      : undefined;

    onAddTransaction({
      projectId: selectedMat.projectId,
      materialId: formMaterialId,
      type: formType,
      quantity: qtyNum,
      notes: formNotes.trim(),
      operator: formOperator.trim(),
      date: formDate,
      rate: rateVal,
      totalPrice: computedTotal,
      vendorName: formType === 'addition' ? (formVendor.trim() || selectedMat.vendorName || 'Authorized Vendor') : undefined,
      invoiceUrl: formType === 'addition' ? formInvoiceUrl : undefined,
      invoiceFileName: formType === 'addition' ? formInvoiceFileName : undefined,
    });

    // Reset Form
    setFormMaterialId('');
    setFormType('consumption');
    setFormQty('');
    setFormRate('');
    setFormTotalPrice('');
    setFormVendor('');
    setFormNotes('');
    setFormOperator('');
    setFormInvoiceFileName('');
    setFormInvoiceUrl('');
    setFormDate(todayStr);
    setIsLogOpen(false);
  };

  const getMaterialDetails = (matId: string) => {
    const mat = materials.find((m) => m.id === matId);
    return mat ? { name: mat.name, unit: mat.unit } : { name: 'Deleted Material', unit: '' };
  };

  const getProjectName = (projId: string) => {
    const p = projects.find((x) => x.id === projId);
    return p ? p.name : 'Unknown Site';
  };

  const selectedBucketObj = periodBuckets.find((b) => b.id === selectedBucketId);

  return (
    <div className="space-y-5 animate-in fade-in duration-200" id="transactions-log-container">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#23408e] text-white flex items-center justify-center shrink-0">
            <Calendar size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Action Logs &amp; Material Ledger</h1>
            <p className="text-xs text-slate-500">Record of material arrivals, consumption and historical site balances.</p>
          </div>
        </div>
        <button
          id="btn-open-log-transaction"
          onClick={() => {
            if (availableMaterials.length > 0) {
              setFormMaterialId(availableMaterials[0].id);
            }
            setIsLogOpen(true);
          }}
          className="px-4 py-2.5 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
        >
          <Plus size={16} /> Log Custom Action
        </button>
      </div>

      {/* Timeframe Filter Tab Bar */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
            <Clock size={13} className="text-[#23408e]" />
            Ledger Timeframe View
          </label>

          {(selectedBucketId || todayOnlyFilter) && (
            <button
              id="btn-reset-timeframe-filter"
              onClick={() => {
                setSelectedBucketId(null);
                if (onClearTodayFilter) onClearTodayFilter();
              }}
              className="text-xs font-semibold text-[#23408e] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw size={12} /> Clear Sub-Period Drilldown
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto" role="tablist">
          {(
            [
              { id: 'daily', label: 'Daily (7 Days)', desc: 'Last 7 Days' },
              { id: 'weekly', label: 'Weekly (4 Weeks)', desc: 'Last 4 Weeks' },
              { id: 'monthly', label: 'Monthly (3 Months)', desc: 'Last 3 Months' },
              { id: 'quarterly', label: 'Quarterly (4 Quarters)', desc: 'Last 4 Quarters' },
              { id: 'yearly', label: 'Yearly (All Years)', desc: 'From Start Year' },
              { id: 'all', label: 'All Records', desc: 'Complete History' },
            ] as const
          ).map((tf) => {
            const isActive = timeframeMode === tf.id;
            return (
              <button
                key={tf.id}
                id={`btn-timeframe-${tf.id}`}
                onClick={() => {
                  setTimeframeMode(tf.id);
                  setSelectedBucketId(null);
                  if (todayOnlyFilter && onClearTodayFilter) {
                    onClearTodayFilter();
                  }
                }}
                role="tab"
                aria-selected={isActive}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'border-[#23408e] text-[#23408e]'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <div>{tf.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Period Summary Cards Matrix (For Daily, Weekly, Monthly, Quarterly, Yearly) */}
      {timeframeMode !== 'all' && periodBuckets.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <BarChart3 size={15} className="text-[#23408e]" />
              {timeframeMode === 'daily' && 'Daily Ledger Summary (Last 7 Days)'}
              {timeframeMode === 'weekly' && 'Weekly Ledger Summary (Last 4 Weeks)'}
              {timeframeMode === 'monthly' && 'Monthly Ledger Summary (Last 3 Months)'}
              {timeframeMode === 'quarterly' && 'Quarterly Ledger Summary (Last 4 Quarters)'}
              {timeframeMode === 'yearly' && 'Yearly Ledger Summary (All Years from Start Year)'}
            </h3>

            <span className="text-xs text-slate-500">
              Click any card to filter transaction table
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
            {periodBuckets.map((bucket) => {
              const summary = bucketSummaries.get(bucket.id) || {
                additionsCount: 0,
                consumptionCount: 0,
                additionsQty: 0,
                consumptionQty: 0,
                totalLogs: 0,
              };

              const isSelected = selectedBucketId === bucket.id;

              return (
                <button
                  key={bucket.id}
                  id={`bucket-card-${bucket.id}`}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedBucketId(null);
                    } else {
                      setSelectedBucketId(bucket.id);
                    }
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-[#23408e] text-white border-[#23408e] shadow-sm'
                      : 'bg-white hover:bg-[#f5f8fd] hover:border-[#c9d6f2] border-slate-200 text-slate-900'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-xs font-black truncate ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                        {bucket.title}
                      </span>
                      {bucket.isCurrent && (
                        <span
                          className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          Current
                        </span>
                      )}
                    </div>
                    {bucket.subtitle && (
                      <p className={`text-[10px] mt-0.5 font-medium truncate ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                        {bucket.subtitle}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200/40 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className={`font-semibold ${isSelected ? 'text-emerald-300' : 'text-emerald-700'}`}>
                        + Additions:
                      </span>
                      <span className="font-bold">{summary.additionsCount}</span>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className={`font-semibold ${isSelected ? 'text-rose-300' : 'text-rose-700'}`}>
                        - Consumed:
                      </span>
                      <span className="font-bold">{summary.consumptionCount}</span>
                    </div>

                    <div
                      className={`text-[10px] font-black pt-1 flex items-center justify-between ${
                        isSelected ? 'text-slate-200' : 'text-slate-600'
                      }`}
                    >
                      <span>Logs: {summary.totalLogs}</span>
                      {isSelected && <span className="text-white font-semibold">Selected</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Drilldown Banner Notice */}
      <AnimatePresence>
        {selectedBucketObj && (
          <motion.div
            key="selected-bucket-drilldown-banner"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-[#f5f8fd] border border-[#d9e3f5] text-slate-700 px-4 py-2.5 rounded-lg flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5 text-sm">
              <Filter size={15} className="text-[#23408e] shrink-0" />
              <span>
                Filtered View Active for <strong className="text-slate-900">{selectedBucketObj.title}</strong> (
                {selectedBucketObj.subtitle}): {filteredTransactions.length} transaction
                {filteredTransactions.length !== 1 ? 's' : ''} found in date range [{selectedBucketObj.startDateStr} to{' '}
                {selectedBucketObj.endDateStr}].
              </span>
            </div>

            <button
              id="btn-clear-selected-bucket"
              onClick={() => {
                setSelectedBucketId(null);
                if (todayOnlyFilter && onClearTodayFilter) {
                  onClearTodayFilter();
                }
              }}
              className="px-3 py-1.5 rounded-lg border border-[#23408e] text-[#23408e] bg-white hover:bg-[#f5f8fd] text-xs font-semibold cursor-pointer shrink-0 flex items-center gap-1.5"
            >
              <X size={14} /> Show Full {timeframeMode.toUpperCase()} Range
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ledger table card: search, action type filter and table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Search className="text-slate-400 shrink-0" size={16} />
          <input
            id="search-transactions-input"
            type="text"
            placeholder="Search logs by operator, notes, or resource..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search ledger"
            className="flex-1 min-w-0 text-sm py-1 focus:outline-hidden"
          />
        </div>

        {/* Action Type Filter */}
        <div className="flex gap-1 bg-slate-100 border border-slate-200 p-1 rounded-lg self-start md:self-center shrink-0">
          {(['all', 'addition', 'consumption'] as const).map((type) => (
            <button
              key={type}
              id={`tx-filter-${type}`}
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                typeFilter === type
                  ? 'bg-[#23408e] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {type === 'all' ? 'All Activities' : type === 'addition' ? 'Additions Only' : 'Consumption Only'}
            </button>
          ))}
        </div>
      </div>

      {/* Action Logs List Table */}
      <div
        className="overflow-auto max-h-[calc(100vh-260px)] min-h-[380px] w-full relative"
        id="transactions-table-wrapper"
      >
        {filteredTransactions.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm space-y-2">
            <div>No logged transactions found for the active criteria.</div>
            {selectedBucketId && (
              <button
                onClick={() => setSelectedBucketId(null)}
                className="text-sm font-semibold text-[#23408e] hover:underline cursor-pointer"
              >
                Clear sub-period drilldown filter to see all transactions
              </button>
            )}
          </div>
        ) : (
          <table className="w-full min-w-[850px] text-left border-collapse" id="transactions-table">
            <thead className="sticky top-0 z-20 bg-[#23408e]">
              <tr className="bg-[#23408e] text-white text-xs font-semibold uppercase tracking-wide">
                <th className="py-3.5 px-3.5 sticky top-0 bg-[#23408e] text-white z-20">Date</th>
                <th className="py-3.5 px-3.5 sticky top-0 bg-[#23408e] text-white z-20">Resource Item</th>
                <th className="py-3.5 px-3.5 sticky top-0 bg-[#23408e] text-white z-20">Action Type</th>
                <th className="py-3.5 px-3.5 text-right sticky top-0 bg-[#23408e] text-white z-20">Quantity</th>
                <th className="py-3.5 px-3.5 sticky top-0 bg-[#23408e] text-white z-20">Purpose / Notes</th>
                <th className="py-3.5 px-3.5 sticky top-0 bg-[#23408e] text-white z-20">Site Personnel</th>
                {selectedProjectId === 'all' && (
                  <th className="py-3.5 px-3.5 sticky top-0 bg-[#23408e] text-white z-20">Construction Site</th>
                )}
                <th className="py-3.5 px-3.5 text-center sticky top-0 bg-[#23408e] text-white z-20">Delete</th>
              </tr>
            </thead>
            <tbody className="text-[13px]">
              {filteredTransactions.map((tx) => {
                const { name: matName, unit } = getMaterialDetails(tx.materialId);
                const isAddition = tx.type === 'addition';

                return (
                  <tr key={tx.id} id={`tx-row-${tx.id}`} className="border-b border-slate-100 last:border-0 hover:bg-[#f5f8fd] transition-colors">
                    {/* Date */}
                    <td className="py-3.5 px-3 font-semibold text-slate-700 whitespace-nowrap">{tx.date}</td>

                    {/* Material Name */}
                    <td className="py-3.5 px-3 font-semibold text-slate-900">{matName}</td>

                    {/* Action Type */}
                    <td className="py-3.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                          isAddition
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {isAddition ? (
                          <>
                            <ArrowUpRight size={10} /> Addition
                          </>
                        ) : (
                          <>
                            <ArrowDownLeft size={10} /> Consumed
                          </>
                        )}
                      </span>
                    </td>

                    {/* Quantity & Rate Total */}
                    <td
                      className={`py-3.5 px-3 text-right font-semibold ${
                        isAddition ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      <div>
                        {isAddition ? '+' : '-'}
                        {tx.quantity} <span className="text-[10px] font-bold text-slate-500 ml-0.5">{unit}</span>
                      </div>
                      {tx.rate !== undefined && tx.rate > 0 && (
                        <div className="text-[10px] font-extrabold text-slate-500 mt-0.5">
                          @ Rs. {tx.rate}/{unit}
                          {tx.totalPrice !== undefined && (
                            <span className="text-amber-700 font-extrabold ml-1">
                              (Rs. {tx.totalPrice.toLocaleString('en-IN')})
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Notes & Vendor & Invoice Proof */}
                    <td className="py-3.5 px-3 text-slate-700 max-w-xs" title={tx.notes}>
                      <div className="space-y-1">
                        <span className="flex items-center gap-1.5 truncate">
                          <FileText size={12} className="text-slate-400 shrink-0" />
                          {tx.notes}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {tx.vendorName && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold border border-slate-200">
                              Vendor: {tx.vendorName}
                            </span>
                          )}
                          {tx.invoiceFileName && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#eaf0fb] text-[#23408e] text-[10px] font-semibold border border-[#c9d6f2]">
                              📄 {tx.invoiceFileName}
                              {tx.invoiceUrl && (
                                <a
                                  href={tx.invoiceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline text-[#23408e] hover:text-[#1b3170]"
                                >
                                  [View]
                                </a>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Operator */}
                    <td className="py-3.5 px-3 text-slate-700 font-bold whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        <User size={12} className="text-slate-400 shrink-0" />
                        {tx.operator}
                      </span>
                    </td>

                    {/* Project Name (Only in consolidated 'all' view) */}
                    {selectedProjectId === 'all' && (
                      <td className="py-3.5 px-3 text-slate-600 font-bold truncate max-w-[130px]">
                        {getProjectName(tx.projectId)}
                      </td>
                    )}

                    {/* Delete Icon */}
                    <td className="py-3.5 px-3 text-center">
                      <button
                        id={`btn-delete-tx-${tx.id}`}
                        onClick={() => setDeleteTxTargetId(tx.id)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Revert transaction log"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      </div>

      {/* Log Transaction Dialog */}
      <AnimatePresence>
        {isLogOpen && (
          <motion.div
            key="log-tx-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
            id="log-tx-modal"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl border border-slate-200"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <h3 className="text-base font-bold text-slate-950 flex items-center gap-2">
                  <Plus className="text-slate-800" size={18} /> Record Material Allocation Log
                </h3>
                <button
                  id="close-log-tx-modal"
                  onClick={() => setIsLogOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {availableMaterials.length === 0 ? (
                <div className="py-6 text-center text-slate-500 text-sm">
                  No materials registered for this project yet. Please add resources to the catalog first!
                </div>
              ) : (
                <form onSubmit={handleLogTransaction} className="space-y-4 mt-4">
                  <div>
                    <label htmlFor="tx-material" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Resource Item *
                    </label>
                    <select
                      id="tx-material"
                      required
                      value={formMaterialId}
                      onChange={(e) => setFormMaterialId(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20"
                    >
                      {availableMaterials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.unit}) - Stock: {m.currentStock}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Log Action Type *
                      </label>
                      <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setFormType('consumption')}
                          className={`flex-1 text-xs font-bold py-2 rounded-lg cursor-pointer ${
                            formType === 'consumption'
                              ? 'bg-red-500 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-950'
                          }`}
                        >
                          Use Material
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormType('addition')}
                          className={`flex-1 text-xs font-bold py-2 rounded-lg cursor-pointer ${
                            formType === 'addition'
                              ? 'bg-emerald-500 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-950'
                          }`}
                        >
                          Add Stock
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="tx-qty" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Quantity *
                      </label>
                      <input
                        id="tx-qty"
                        type="number"
                        step="any"
                        min="0.001"
                        required
                        value={formQty}
                        onChange={(e) => setFormQty(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 4.0"
                        className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20"
                      />
                      {(() => {
                        const selMat = materials.find((m) => m.id === formMaterialId);
                        if (formType === 'consumption' && selMat && Number(formQty) > selMat.currentStock) {
                          return (
                            <p className="text-xs text-red-600 font-extrabold mt-1">
                              please insert valid values
                            </p>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>

                  {formType === 'addition' && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="tx-rate" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Rate / Unit Cost (Rs) *
                          </label>
                          <input
                            id="tx-rate"
                            type="number"
                            step="any"
                            min="0"
                            value={formRate}
                            onChange={(e) => {
                              const r = e.target.value === '' ? '' : Number(e.target.value);
                              setFormRate(r);
                              if (formTotalPrice === '') {
                                setFormTotalPrice((Number(r) || 0) * (Number(formQty) || 0));
                              }
                            }}
                            placeholder="e.g. 420"
                            className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e]"
                          />
                        </div>

                        <div>
                          <label htmlFor="tx-total-price" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Total Price (Rs)
                          </label>
                          <input
                            id="tx-total-price"
                            type="number"
                            step="any"
                            min="0"
                            value={
                              formTotalPrice !== ''
                                ? formTotalPrice
                                : (Number(formRate) || 0) * (Number(formQty) || 0)
                            }
                            onChange={(e) => setFormTotalPrice(e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="Rate × Qty"
                            className="w-full bg-amber-50 border border-amber-300 text-amber-950 font-bold text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <label htmlFor="tx-vendor" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Vendor / Supplier Name
                          </label>
                          <input
                            id="tx-vendor"
                            type="text"
                            value={formVendor}
                            onChange={(e) => setFormVendor(e.target.value)}
                            placeholder="e.g. UltraTech Cement / Tata Tiscon"
                            className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e]"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Invoice Upload / Delivery Proof
                          </label>
                          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                            <input
                              id="tx-invoice-file"
                              type="file"
                              accept="image/*,.pdf"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setFormInvoiceFileName(file.name);
                                  setFormInvoiceUrl(URL.createObjectURL(file));
                                }
                              }}
                              className="hidden"
                            />
                            <label
                              htmlFor="tx-invoice-file"
                              className="px-3 py-1.5 bg-[#23408e] hover:bg-[#1b3170] text-white text-xs font-semibold rounded-lg cursor-pointer shrink-0"
                            >
                              Choose Invoice
                            </label>
                            {formInvoiceFileName ? (
                              <span className="text-xs text-emerald-700 font-bold truncate">
                                ✓ {formInvoiceFileName}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">Optional invoice photo or PDF</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="tx-operator" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        In-Charge Personnel *
                      </label>
                      <input
                        id="tx-operator"
                        type="text"
                        required
                        value={formOperator}
                        onChange={(e) => setFormOperator(e.target.value)}
                        placeholder="e.g. Rajesh Patil"
                        className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20"
                      />
                    </div>

                    <div>
                      <label htmlFor="tx-date" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Record Date
                      </label>
                      <input
                        id="tx-date"
                        type="date"
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="tx-notes" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Action Purpose / Reason Note * (Compulsory)
                    </label>
                    <textarea
                      id="tx-notes"
                      rows={2}
                      required
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="e.g. Columns reinforcement on First Floor slab (Required)"
                      className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20"
                    />
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-slate-200">
                    <button
                      id="btn-cancel-log-tx"
                      type="button"
                      onClick={() => setIsLogOpen(false)}
                      className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold py-3 rounded-xl transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      id="btn-submit-log-tx"
                      type="submit"
                      className="flex-1 bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold py-3 rounded-lg transition-colors cursor-pointer"
                    >
                      Record Log
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Transaction Confirmation Modal */}
      <AnimatePresence>
        {deleteTxTargetId && (
          <motion.div
            key="delete-tx-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center z-50 p-4"
            id="delete-tx-modal"
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
                  <h3 className="text-base font-extrabold text-slate-950">Revert Action Log</h3>
                  <p className="text-xs text-slate-500 font-medium">Stock adjustments will be restored</p>
                </div>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed my-3 font-medium">
                Are you sure you want to delete this activity log? Deleting this log will automatically adjust and restore the material stock back to its previous balance.
              </p>

              <div className="flex gap-2.5 mt-5">
                <button
                  id="btn-cancel-delete-tx"
                  type="button"
                  onClick={() => setDeleteTxTargetId(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-confirm-delete-tx"
                  type="button"
                  onClick={() => {
                    onRemoveTransaction(deleteTxTargetId);
                    setDeleteTxTargetId(null);
                  }}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold py-2.5 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Revert Log
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
