import { useState, useMemo, FormEvent } from 'react';
import { ContractorRecord, ContractorCategory, Project, User, ContractorBill } from '../types';
import { Search, Filter, Plus, FileText, ArrowUpRight, HelpCircle, ShieldCheck, X, CheckCircle2, Clock, AlertTriangle, Building2, UserCheck, DollarSign, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ProcurementContractsProps {
  contractors: ContractorRecord[];
  projects: Project[];
  selectedProjectId: string;
  currentUser?: User;
  onAddContractor: (newContractor: Omit<ContractorRecord, 'id' | 'createdAt'>) => void;
  onUpdateContractorBilling: (
    contractorId: string,
    updates: {
      currentBilling?: number;
      pastBilling?: number;
      currentBillingStatus?: ContractorRecord['currentBillingStatus'];
      statusReason?: string;
      newPastBill?: Omit<ContractorBill, 'id'>;
    }
  ) => void;
  onOpenRaiseQueryModalForContractor?: (contractorId: string, projectId: string, firmName: string) => void;
  onDeleteContractor?: (contractorId: string) => void;
}

const CATEGORY_OPTIONS: ContractorCategory[] = [
  'Civil & Concrete',
  'Electrical Works',
  'Plumbing & Sanitation',
  'Steel & Structural',
  'Interior & Finishing',
  'HVAC & Firefighting',
  'Earthworks',
  'Others',
];

const BILLING_STATUS_OPTIONS: ContractorRecord['currentBillingStatus'][] = [
  'Submitted',
  'Verified',
  'Approved',
  'Under Audit',
  'Query Raised',
  'Payment Processing',
];

export default function ProcurementContracts({
  contractors,
  projects,
  selectedProjectId,
  currentUser,
  onAddContractor,
  onUpdateContractorBilling,
  onOpenRaiseQueryModalForContractor,
  onDeleteContractor,
}: ProcurementContractsProps) {
  const [deleteTarget, setDeleteTarget] = useState<ContractorRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ContractorCategory | 'All'>('All');
  const [isAddContractorOpen, setIsAddContractorOpen] = useState(false);

  // Modal states
  const [activePastBillsContractor, setActivePastBillsContractor] = useState<ContractorRecord | null>(null);
  const [activeActionContractor, setActiveActionContractor] = useState<ContractorRecord | null>(null);

  // New Contractor Form state
  const [newFirmName, setNewFirmName] = useState('');
  const [newCategory, setNewCategory] = useState<ContractorCategory>('Civil & Concrete');
  const [customCategory, setCustomCategory] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [newContactPerson, setNewContactPerson] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newTotalEstimated, setNewTotalEstimated] = useState<number | ''>(5000000);
  const [newPastBilling, setNewPastBilling] = useState<number | ''>(1000000);
  const [newCurrentBilling, setNewCurrentBilling] = useState<number | ''>(250000);

  // Action status form state for selected contractor
  const [actionStatus, setActionStatus] = useState<ContractorRecord['currentBillingStatus']>('Submitted');
  const [actionReason, setActionReason] = useState('');
  const [actionCurrentAmount, setActionCurrentAmount] = useState<number | ''>('');

  // New Bill modal state inside Past Bills modal
  const [isAddBillOpen, setIsAddBillOpen] = useState(false);
  const [newBillNumber, setNewBillNumber] = useState('');
  const [newBillDate, setNewBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [newBillAmount, setNewBillAmount] = useState<number | ''>('');
  const [newBillStatus, setNewBillStatus] = useState<ContractorBill['status']>('Approved');
  const [newBillNotes, setNewBillNotes] = useState('');

  const isAdmin = currentUser?.role === 'admin';

  // Filter contractors based on project, category, search query
  const filteredContractors = useMemo(() => {
    return contractors.filter((c) => {
      // Project filter
      if (selectedProjectId !== 'all' && c.projectId !== selectedProjectId) {
        return false;
      }
      // Category filter
      if (selectedCategory !== 'All' && c.category !== selectedCategory) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = c.firmName.toLowerCase().includes(q);
        const matchesCategory = c.category.toLowerCase().includes(q);
        const matchesProject = c.projectName.toLowerCase().includes(q);
        const matchesContact = (c.contactPerson || '').toLowerCase().includes(q);
        if (!matchesName && !matchesCategory && !matchesProject && !matchesContact) {
          return false;
        }
      }
      return true;
    });
  }, [contractors, selectedProjectId, selectedCategory, searchQuery]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalEst = 0;
    let totalPast = 0;
    let totalCurr = 0;
    let totalPending = 0;

    filteredContractors.forEach((c) => {
      const pending = Math.max(0, c.totalEstimatedBilling - c.pastBilling - c.currentBilling);
      totalEst += c.totalEstimatedBilling;
      totalPast += c.pastBilling;
      totalCurr += c.currentBilling;
      totalPending += pending;
    });

    return { totalEst, totalPast, totalCurr, totalPending };
  }, [filteredContractors]);

  // Handle Add Contractor Submit
  const handleAddContractorSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!newFirmName.trim()) return;

    const targetProjId = newProjectId || (selectedProjectId !== 'all' ? selectedProjectId : projects[0]?.id || 'p-1');
    const targetProj = projects.find((p) => p.id === targetProjId);

    const finalCategory = newCategory === 'Others' ? (customCategory.trim() || 'Others') : newCategory;
    const estVal = Number(newTotalEstimated) || 0;
    const pastVal = Number(newPastBilling) || 0;
    const currVal = Number(newCurrentBilling) || 0;

    onAddContractor({
      firmName: newFirmName.trim(),
      category: finalCategory,
      projectId: targetProjId,
      projectName: targetProj?.name || 'Site Project',
      contactPerson: newContactPerson.trim() || undefined,
      phone: newPhone.trim() || undefined,
      email: newEmail.trim() || undefined,
      totalEstimatedBilling: estVal,
      pastBilling: pastVal,
      currentBilling: currVal,
      currentBillingStatus: 'Submitted',
      statusReason: 'Initial contract mobilization',
      pastBills: pastVal > 0 ? [
        {
          id: `bill-${Date.now()}-0`,
          billNumber: `RA-BILL-01`,
          date: new Date().toISOString().split('T')[0],
          amount: pastVal,
          status: 'Paid',
          notes: 'Mobilization advance & initial phase billing',
        }
      ] : [],
    });

    // Reset Form
    setNewFirmName('');
    setNewCategory('Civil & Concrete');
    setCustomCategory('');
    setNewContactPerson('');
    setNewPhone('');
    setNewEmail('');
    setNewTotalEstimated(5000000);
    setNewPastBilling(1000000);
    setNewCurrentBilling(250000);
    setIsAddContractorOpen(false);
  };

  // Handle Action Modal Update
  const handleActionUpdate = () => {
    if (!activeActionContractor) return;

    const newCurrAmount = actionCurrentAmount !== '' ? Number(actionCurrentAmount) : activeActionContractor.currentBilling;

    onUpdateContractorBilling(activeActionContractor.id, {
      currentBilling: newCurrAmount,
      currentBillingStatus: actionStatus,
      statusReason: actionReason.trim() || undefined,
    });

    setActiveActionContractor(null);
  };

  // Handle Add Past Bill Entry
  const handleAddPastBillSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!activePastBillsContractor || !newBillAmount) return;

    const billAmt = Number(newBillAmount);
    const billNo = newBillNumber.trim() || `RA-BILL-${(activePastBillsContractor.pastBills.length + 1).toString().padStart(2, '0')}`;

    onUpdateContractorBilling(activePastBillsContractor.id, {
      newPastBill: {
        billNumber: billNo,
        date: newBillDate,
        amount: billAmt,
        status: newBillStatus,
        notes: newBillNotes.trim() || undefined,
      }
    });

    // Update active contractor locally for modal view
    const updatedContractor = {
      ...activePastBillsContractor,
      pastBilling: activePastBillsContractor.pastBilling + billAmt,
      pastBills: [
        ...activePastBillsContractor.pastBills,
        {
          id: `bill-${Date.now()}`,
          billNumber: billNo,
          date: newBillDate,
          amount: billAmt,
          status: newBillStatus,
          notes: newBillNotes.trim() || undefined,
        }
      ]
    };
    setActivePastBillsContractor(updatedContractor);

    // Reset bill form
    setNewBillNumber('');
    setNewBillAmount('');
    setNewBillNotes('');
    setIsAddBillOpen(false);
  };

  // Format Helper
  const fmtCurrency = (val: number) => `Rs. ${val.toLocaleString('en-IN')}`;

  // Status Badge Helper (same pill style as Order Queries & Quotes)
  const STATUS_PILL: Record<string, { cls: string; icon: typeof Clock; label: string }> = {
    Approved: { cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', icon: CheckCircle2, label: 'Approved' },
    'Payment Processing': { cls: 'bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]', icon: DollarSign, label: 'Processing' },
    Verified: { cls: 'bg-sky-50 text-sky-800 border-sky-200', icon: UserCheck, label: 'Verified' },
    Submitted: { cls: 'bg-amber-50 text-amber-800 border-amber-200', icon: Clock, label: 'Submitted' },
    'Under Audit': { cls: 'bg-slate-100 text-slate-700 border-slate-200', icon: ShieldCheck, label: 'Under Audit' },
    'Query Raised': { cls: 'bg-rose-50 text-rose-700 border-rose-200', icon: AlertTriangle, label: 'Disputed / Query' },
  };
  const getStatusBadge = (status: ContractorRecord['currentBillingStatus']) => {
    const s = STATUS_PILL[status] || { cls: 'bg-slate-100 text-slate-700 border-slate-200', icon: Clock, label: status };
    const Icon = s.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${s.cls}`}>
        <Icon size={11} /> {s.label}
      </span>
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200" id="procurement-contracts-section">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#23408e] text-white flex items-center justify-center shrink-0">
            <Building2 size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Contracts &amp; Contracting Firms</h1>
            <p className="text-xs text-slate-500">Track vendor packages, past billing history, active current bills, and pending commitments.</p>
          </div>
        </div>
        <button
          id="btn-add-contractor"
          onClick={() => setIsAddContractorOpen(true)}
          className="px-4 py-2.5 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
        >
          <Plus size={16} /> Add Contractor Firm
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Contract Value', value: fmtCurrency(metrics.totalEst), hint: `${filteredContractors.length} contracting firm${filteredContractors.length === 1 ? '' : 's'}` },
          { label: 'Total Disbursed / Past Billing', value: fmtCurrency(metrics.totalPast), hint: 'Bills already paid' },
          { label: 'Current Active Billing', value: fmtCurrency(metrics.totalCurr), hint: 'Bills in process' },
          { label: 'Total Pending Balance', value: fmtCurrency(metrics.totalPending), hint: 'Contract value not yet billed' },
        ].map((k) => (
          <div key={k.label} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm min-w-0">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{k.label}</span>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 break-words">{k.value}</p>
            <span className="text-[11px] text-slate-500">{k.hint}</span>
          </div>
        ))}
      </div>

      {/* Contracts table card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Search size={16} className="text-slate-400 shrink-0" />
            <input
              id="search-contractors-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contracting firm, contact person, or category"
              aria-label="Search contractors"
              className="flex-1 min-w-0 text-sm py-1 focus:outline-hidden"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Filter size={13} className="text-slate-500" />
            <label htmlFor="filter-contractor-category" className="text-xs font-semibold text-slate-500">
              Category
            </label>
            <select
              id="filter-contractor-category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as any)}
              className="bg-white border border-slate-300 text-slate-800 text-sm rounded-lg px-3 py-1.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20 cursor-pointer"
            >
              <option value="All">All Categories ({contractors.length})</option>
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-[#23408e] text-white text-xs font-semibold uppercase tracking-wide">
                <th className="px-4 py-3 text-center w-12">Sr. No</th>
                <th className="px-4 py-3 min-w-[200px]">Contracting Firm Name</th>
                <th className="px-4 py-3 min-w-[140px]">Category</th>
                <th className="px-4 py-3 min-w-[150px]">Site &amp; Projects</th>
                <th className="px-4 py-3 text-right min-w-[140px]">Past Billing</th>
                <th className="px-4 py-3 text-right min-w-[140px]">Current Billing</th>
                <th className="px-4 py-3 text-right min-w-[150px]">Total Estimated Billing</th>
                <th className="px-4 py-3 text-right min-w-[140px]">Pending Billing</th>
                <th className="px-4 py-3 text-center min-w-[220px]">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredContractors.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-sm text-slate-500">
                    No contractor firm records found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredContractors.map((c, idx) => {
                  const pending = Math.max(0, c.totalEstimatedBilling - c.pastBilling - c.currentBilling);

                  return (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-[#f5f8fd] transition-colors align-top">
                      <td className="px-4 py-3 text-center text-xs text-slate-500">{idx + 1}</td>

                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{c.firmName}</p>
                        {c.contactPerson && (
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Contact: {c.contactPerson} {c.phone ? `(${c.phone})` : ''}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-slate-100 text-slate-700 border-slate-200 whitespace-nowrap">
                          {c.category}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-slate-600">{c.projectName}</td>

                      <td className="px-4 py-3 text-right">
                        <p className="font-medium text-slate-900">{fmtCurrency(c.pastBilling)}</p>
                        <button
                          id={`btn-past-bills-${c.id}`}
                          onClick={() => setActivePastBillsContractor(c)}
                          className="mt-1 text-xs font-semibold text-[#23408e] hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <FileText size={12} />
                          Past Bills ({c.pastBills.length})
                        </button>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <p className="font-medium text-slate-900">{fmtCurrency(c.currentBilling)}</p>
                        <div className="mt-1">{getStatusBadge(c.currentBillingStatus)}</div>
                      </td>

                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {fmtCurrency(c.totalEstimatedBilling)}
                      </td>

                      <td className="px-4 py-3 text-right font-semibold text-[#23408e]">
                        {fmtCurrency(pending)}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            id={`btn-action-status-${c.id}`}
                            onClick={() => {
                              setActiveActionContractor(c);
                              setActionStatus(c.currentBillingStatus);
                              setActionReason(c.statusReason || '');
                              setActionCurrentAmount(c.currentBilling);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            title="Update current billing status or reason"
                          >
                            <ArrowUpRight size={13} /> Status &amp; Reason
                          </button>
                          <button
                            id={`btn-raise-query-contractor-${c.id}`}
                            onClick={() => {
                              if (onOpenRaiseQueryModalForContractor) {
                                onOpenRaiseQueryModalForContractor(c.id, c.projectId, c.firmName);
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg border border-[#23408e] text-[#23408e] bg-white hover:bg-[#f5f8fd] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                            title="Raise a query regarding this contractor billing"
                          >
                            <HelpCircle size={13} /> Query
                          </button>
                          {onDeleteContractor && (
                            <button
                              id={`btn-delete-contractor-${c.id}`}
                              onClick={() => setDeleteTarget(c)}
                              aria-label={`Delete ${c.firmName}`}
                              title="Delete this contract"
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 cursor-pointer transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                        {c.statusReason && (
                          <p className="text-[11px] text-slate-500 mt-1.5 max-w-[220px] mx-auto truncate" title={c.statusReason}>
                            Reason: {c.statusReason}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirmation */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            key="delete-contractor-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50"
            onClick={() => setDeleteTarget(null)}
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-contractor-title"
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
                  <h3 id="delete-contractor-title" className="text-base font-bold text-slate-900">Delete this contract?</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    <strong className="text-slate-900">{deleteTarget.firmName}</strong> ({deleteTarget.category}, {deleteTarget.projectName}) and its billing history
                    will be removed. The contract value of {fmtCurrency(deleteTarget.totalEstimatedBilling)} will no longer count towards the project estimation cost.
                  </p>
                  <p className="text-xs text-slate-500 mt-2">This cannot be undone.</p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  id="btn-cancel-delete-contractor"
                  type="button"
                  autoFocus
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-sm font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-confirm-delete-contractor"
                  type="button"
                  onClick={() => {
                    onDeleteContractor?.(deleteTarget.id);
                    setDeleteTarget(null);
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

      {/* MODAL 1: ADD CONTRACTOR MODAL */}
      <AnimatePresence>
        {isAddContractorOpen && (
          <motion.div
            key="add-contractor-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-[#23408e] text-white inline-flex items-center justify-center">
                    <Building2 size={18} />
                  </span>
                  <h3 className="text-base font-extrabold text-slate-950">Add New Contracting Firm</h3>
                </div>
                <button
                  onClick={() => setIsAddContractorOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAddContractorSubmit} className="space-y-4">
                <div>
                  <label htmlFor="add-firm-name" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Contracting Firm Name *
                  </label>
                  <input
                    id="add-firm-name"
                    type="text"
                    required
                    value={newFirmName}
                    onChange={(e) => setNewFirmName(e.target.value)}
                    placeholder="e.g. Apex Structural Concrete Ltd"
                    className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="add-contractor-cat" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Category *
                    </label>
                    <select
                      id="add-contractor-cat"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as ContractorCategory)}
                      className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] font-medium"
                    >
                      {CATEGORY_OPTIONS.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="add-contractor-project" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Site / Project *
                    </label>
                    <select
                      id="add-contractor-project"
                      value={newProjectId || (selectedProjectId !== 'all' ? selectedProjectId : projects[0]?.id)}
                      onChange={(e) => setNewProjectId(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] font-medium"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {newCategory === 'Others' && (
                  <div>
                    <label htmlFor="add-custom-cat" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Custom Category Name
                    </label>
                    <input
                      id="add-custom-cat"
                      type="text"
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      placeholder="Specify specialized category"
                      className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5"
                    />
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="add-contact-person" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Contact Person
                    </label>
                    <input
                      id="add-contact-person"
                      type="text"
                      value={newContactPerson}
                      onChange={(e) => setNewContactPerson(e.target.value)}
                      placeholder="e.g. Ramesh Kumar"
                      className="w-full bg-white border border-slate-300 text-slate-950 text-xs rounded-xl px-3 py-2"
                    />
                  </div>
                  <div>
                    <label htmlFor="add-phone" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Phone Number
                    </label>
                    <input
                      id="add-phone"
                      type="text"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="+91 9876543210"
                      className="w-full bg-white border border-slate-300 text-slate-950 text-xs rounded-xl px-3 py-2"
                    />
                  </div>
                  <div>
                    <label htmlFor="add-email" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Email Address
                    </label>
                    <input
                      id="add-email"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="vendor@company.com"
                      className="w-full bg-white border border-slate-300 text-slate-950 text-xs rounded-xl px-3 py-2"
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <p className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Contract Budget & Billing Setup</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="add-est-billing" className="block text-[11px] font-bold text-slate-600 mb-1">
                        Total Estimated Budget (Rs) *
                      </label>
                      <input
                        id="add-est-billing"
                        type="number" step="any"
                        min="0"
                        required
                        value={newTotalEstimated}
                        onChange={(e) => setNewTotalEstimated(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-black rounded-xl px-3 py-2"
                      />
                    </div>
                    <div>
                      <label htmlFor="add-past-billing" className="block text-[11px] font-bold text-slate-600 mb-1">
                        Initial Past Billing (Rs)
                      </label>
                      <input
                        id="add-past-billing"
                        type="number" step="any"
                        min="0"
                        value={newPastBilling}
                        onChange={(e) => setNewPastBilling(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-bold rounded-xl px-3 py-2"
                      />
                    </div>
                    <div>
                      <label htmlFor="add-curr-billing" className="block text-[11px] font-bold text-slate-600 mb-1">
                        Current Bill (Rs)
                      </label>
                      <input
                        id="add-curr-billing"
                        type="number" step="any"
                        min="0"
                        value={newCurrentBilling}
                        onChange={(e) => setNewCurrentBilling(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-amber-50 border border-amber-300 text-amber-950 text-xs font-black rounded-xl px-3 py-2"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setIsAddContractorOpen(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold rounded-lg cursor-pointer flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Register Contractor Firm
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL 2: PAST BILLS BREAKDOWN MODAL */}
      <AnimatePresence>
        {activePastBillsContractor && (
          <motion.div
            key="past-bills-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-extrabold text-slate-950">
                    Past Billing History — {activePastBillsContractor.firmName}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Category: <strong className="text-slate-900">{activePastBillsContractor.category}</strong> | Site: <strong className="text-slate-900">{activePastBillsContractor.projectName}</strong>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setActivePastBillsContractor(null);
                    setIsAddBillOpen(false);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Total Past Billing Summary Card */}
              <div className="p-4 bg-[#f5f8fd] border border-[#d9e3f5] rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Accumulated Past Billing</p>
                  <p className="text-xl font-bold text-slate-900">{fmtCurrency(activePastBillsContractor.pastBilling)}</p>
                </div>
                <button
                  id="btn-add-past-bill-entry"
                  onClick={() => setIsAddBillOpen(!isAddBillOpen)}
                  className="px-3 py-2 bg-[#23408e] hover:bg-[#1b3170] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Plus size={14} /> Add Historical Invoice Record
                </button>
              </div>

              {/* Inline Form to Add Past Bill */}
              {isAddBillOpen && (
                <form onSubmit={handleAddPastBillSubmit} className="p-4 bg-slate-50 border border-slate-300 rounded-xl space-y-3">
                  <p className="text-xs font-extrabold text-slate-900">Record New Historic Bill Payment</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Bill Number</label>
                      <input
                        type="text"
                        value={newBillNumber}
                        onChange={(e) => setNewBillNumber(e.target.value)}
                        placeholder="RA-BILL-03"
                        className="w-full bg-white border border-slate-300 text-xs font-bold rounded-xl px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Billing Date</label>
                      <input
                        type="date"
                        value={newBillDate}
                        onChange={(e) => setNewBillDate(e.target.value)}
                        className="w-full bg-white border border-slate-300 text-xs font-medium rounded-xl px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Amount (Rs) *</label>
                      <input
                        type="number" step="any"
                        min="1"
                        required
                        value={newBillAmount}
                        onChange={(e) => setNewBillAmount(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="500000"
                        className="w-full bg-white border border-slate-300 text-xs font-black text-emerald-900 rounded-xl px-3 py-2"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Bill Remarks / Work Description</label>
                    <input
                      type="text"
                      value={newBillNotes}
                      onChange={(e) => setNewBillNotes(e.target.value)}
                      placeholder="e.g. Cleared 3rd floor column concreting RA bill"
                      className="w-full bg-white border border-slate-300 text-xs rounded-xl px-3 py-2"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsAddBillOpen(false)}
                      className="px-3 py-1.5 border border-slate-300 text-xs font-bold rounded-xl hover:bg-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-[#23408e] hover:bg-[#1b3170] text-white text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Save Bill Entry
                    </button>
                  </div>
                </form>
              )}

              {/* Past Bills Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#23408e] text-white font-semibold uppercase tracking-wide text-[11px]">
                    <tr>
                      <th className="p-3">BILL NO</th>
                      <th className="p-3">DATE</th>
                      <th className="p-3 text-right">AMOUNT (RS)</th>
                      <th className="p-3 text-center">STATUS</th>
                      <th className="p-3">REMARKS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {activePastBillsContractor.pastBills.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-400">
                          No historic bills logged yet. Click "Add Historical Invoice Record" to record past payments.
                        </td>
                      </tr>
                    ) : (
                      activePastBillsContractor.pastBills.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-50">
                          <td className="p-3 font-extrabold text-slate-900">{b.billNumber}</td>
                          <td className="p-3 text-slate-600">{b.date}</td>
                          <td className="p-3 text-right font-black text-emerald-800">{fmtCurrency(b.amount)}</td>
                          <td className="p-3 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              {b.status}
                            </span>
                          </td>
                          <td className="p-3 text-slate-500 italic max-w-xs truncate">{b.notes || 'N/A'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setActivePastBillsContractor(null)}
                  className="px-4 py-2 bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold rounded-lg cursor-pointer"
                >
                  Close History View
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL 3: ACTION & CURRENT BILL STATUS UPDATE MODAL */}
      <AnimatePresence>
        {activeActionContractor && (
          <motion.div
            key="action-contractor-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-extrabold text-slate-950">Update Billing Action & Reason</h3>
                  <p className="text-xs text-slate-500 font-medium">{activeActionContractor.firmName}</p>
                </div>
                <button
                  onClick={() => setActiveActionContractor(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="action-curr-amt" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Current Bill Amount (Rs)
                  </label>
                  <input
                    id="action-curr-amt"
                    type="number" step="any"
                    min="0"
                    value={actionCurrentAmount}
                    onChange={(e) => setActionCurrentAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-amber-50 border border-amber-300 text-amber-950 text-sm font-black rounded-xl px-3.5 py-2.5"
                  />
                </div>

                <div>
                  <label htmlFor="action-status-select" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Current Billing Status *
                  </label>
                  <select
                    id="action-status-select"
                    value={actionStatus}
                    onChange={(e) => setActionStatus(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 text-slate-950 text-sm font-bold rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e]"
                  >
                    {BILLING_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="action-reason-input" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Reason / Remarks (Optional)
                  </label>
                  <textarea
                    id="action-reason-input"
                    rows={3}
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="Enter reason for delay, withholding, audit remarks, or approval note..."
                    className="w-full bg-white border border-slate-300 text-slate-950 text-xs rounded-xl p-3 focus:outline-hidden focus:border-[#23408e]"
                  />
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenRaiseQueryModalForContractor) {
                        onOpenRaiseQueryModalForContractor(
                          activeActionContractor.id,
                          activeActionContractor.projectId,
                          activeActionContractor.firmName
                        );
                      }
                      setActiveActionContractor(null);
                    }}
                    className="px-3 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 text-xs font-bold rounded-xl flex items-center gap-1"
                  >
                    <HelpCircle size={14} className="text-amber-700" /> Raise Dispute Query
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveActionContractor(null)}
                      className="px-3 py-2 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleActionUpdate}
                      className="px-4 py-2 bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold rounded-lg cursor-pointer"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
