import { useState, useMemo, FormEvent, useEffect } from 'react';
import { InternalTransferRecord, Project, Material, User } from '../types';
import {
  Search,
  Plus,
  Truck,
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
  Building2,
  Filter,
  ArrowUpDown,
  Upload,
  Mail,
  Send,
  Bell,
  Sparkles,
  PackageCheck,
  Check,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface InternalTransferProps {
  transfers: InternalTransferRecord[];
  projects: Project[];
  materials: Material[];
  selectedProjectId: string;
  currentUser?: User;
  onAddTransfer: (newTransfer: Omit<InternalTransferRecord, 'id' | 'createdAt'>) => void;
  onUpdateTransferStatus: (
    transferId: string,
    status: InternalTransferRecord['status'],
    photoUrl?: string,
    photoFileName?: string,
    notes?: string
  ) => void;
}

const CATEGORY_LIST = [
  'All',
  'Cement & Binding',
  'Steel & Metals',
  'Aggregates & Sand',
  'Masonry & Bricks',
  'Plumbing & Piping',
  'Electrical & Cables',
  'Finishes & Paint',
  'Formwork & Scaffolding',
  'Hardware & Tools',
  'Others',
];

const UNIT_OPTIONS = ['Bags', 'Ton', 'Kg', 'Nos.', 'Brass / Ton', 'Cubic Meter', 'Sq. Ft.', 'Litres', 'Meters', 'Bundles'];

const STATUS_OPTIONS: InternalTransferRecord['status'][] = [
  'Dispatched',
  'In Transit',
  'Received & Verified',
  'Rejected / Issue',
];

export default function InternalTransfer({
  transfers,
  projects,
  materials,
  selectedProjectId,
  currentUser,
  onAddTransfer,
  onUpdateTransferStatus,
}: InternalTransferProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [isAddTransferOpen, setIsAddTransferOpen] = useState(false);

  // Email Notification modal / popup state
  const [emailAlertModal, setEmailAlertModal] = useState<{
    isOpen: boolean;
    subject: string;
    sender: string;
    recipient: string;
    inwardProjectName: string;
    outwardProjectName: string;
    materialName: string;
    quantity: number;
    unit: string;
    vehicleNumber?: string;
    driverName?: string;
  } | null>(null);

  // Success Toast state
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Incoming Popup Modal state for receiving site manager
  const [incomingTransferPopup, setIncomingTransferPopup] = useState<InternalTransferRecord | null>(null);

  // Lightbox / Picture modal state
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; fileName?: string; title: string; transfer: InternalTransferRecord } | null>(null);

  // Status & Picture update modal state
  const [actionTransfer, setActionTransfer] = useState<InternalTransferRecord | null>(null);
  const [actionStatus, setActionStatus] = useState<InternalTransferRecord['status']>('In Transit');
  const [actionNotes, setActionNotes] = useState('');
  const [actionPhotoUrl, setActionPhotoUrl] = useState('');
  const [actionPhotoFileName, setActionPhotoFileName] = useState('');

  // New Transfer Form state
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('custom');
  const [formMaterialName, setFormMaterialName] = useState('');
  const [formCategory, setFormCategory] = useState('Cement & Binding');
  const [formOutwardProjectId, setFormOutwardProjectId] = useState('');
  const [formInwardProjectId, setFormInwardProjectId] = useState('');
  const [formQuantity, setFormQuantity] = useState<number | ''>(100);
  const [formUnit, setFormUnit] = useState('Bags');
  const [formRate, setFormRate] = useState<number | ''>(380);
  const [formVehicleNumber, setFormVehicleNumber] = useState('');
  const [formDriverName, setFormDriverName] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formTransferDate, setFormTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [formPhotoUrl, setFormPhotoUrl] = useState('');
  const [formPhotoFileName, setFormPhotoFileName] = useState('');

  // Autoselect Outward Site based on current project selection or assigned project
  const autoselectedOutwardProject = useMemo(() => {
    if (selectedProjectId !== 'all') {
      const matched = projects.find((p) => p.id === selectedProjectId);
      if (matched) return matched;
    }
    if (currentUser?.assignedProjectId) {
      const assigned = projects.find((p) => p.id === currentUser.assignedProjectId);
      if (assigned) return assigned;
    }
    return projects[0] || null;
  }, [selectedProjectId, currentUser, projects]);

  // Filter list of ongoing projects for Inward Site dropdown (excluding outward project)
  const ongoingInwardProjects = useMemo(() => {
    const outId = formOutwardProjectId || autoselectedOutwardProject?.id;
    return projects.filter((p) => p.id !== outId);
  }, [projects, formOutwardProjectId, autoselectedOutwardProject]);

  // Open modal and initialize form values
  const handleOpenNewTransferModal = () => {
    const outProjId = autoselectedOutwardProject?.id || projects[0]?.id || '';
    setFormOutwardProjectId(outProjId);

    // Pick first available inward project
    const availIn = projects.filter((p) => p.id !== outProjId);
    setFormInwardProjectId(availIn[0]?.id || '');

    // Reset fields
    setSelectedMaterialId('custom');
    setFormMaterialName('');
    setFormQuantity(100);
    setFormRate(380);
    setFormVehicleNumber('');
    setFormDriverName('');
    setFormNotes('');
    setFormPhotoUrl('');
    setFormPhotoFileName('');
    setIsAddTransferOpen(true);
  };

  // Populate fields when picking material from catalog
  const handleMaterialSelect = (matId: string) => {
    setSelectedMaterialId(matId);
    if (matId === 'custom') {
      setFormMaterialName('');
      return;
    }
    const mat = materials.find((m) => m.id === matId);
    if (mat) {
      setFormMaterialName(mat.name);
      setFormCategory(mat.category);
      setFormUnit(mat.unit);
      setFormRate(mat.unitCost);
    }
  };

  // Materials available for autoselected Outward Site
  const outwardSiteMaterials = useMemo(() => {
    const outId = formOutwardProjectId || autoselectedOutwardProject?.id;
    return materials.filter((m) => m.projectId === outId);
  }, [materials, formOutwardProjectId, autoselectedOutwardProject]);

  // Active incoming transfers awaiting receipt for currently selected or visible project
  const incomingPendingTransfers = useMemo(() => {
    return transfers.filter((t) => {
      const isPending = t.status === 'Dispatched' || t.status === 'In Transit';
      if (!isPending) return false;
      if (selectedProjectId !== 'all') {
        return t.inwardProjectId === selectedProjectId;
      }
      return true;
    });
  }, [transfers, selectedProjectId]);

  // Check and trigger pop-up for incoming transfers when viewing a specific site
  useEffect(() => {
    if (incomingPendingTransfers.length > 0 && !incomingTransferPopup && !emailAlertModal) {
      // Auto-popup the latest incoming transfer notice
      const firstPending = incomingPendingTransfers[0];
      setIncomingTransferPopup(firstPending);
    }
  }, [incomingPendingTransfers]);

  // Filter transfers for main table
  const filteredTransfers = useMemo(() => {
    return transfers.filter((t) => {
      // Project filter (matches if this project is either Outward or Inward site)
      if (selectedProjectId !== 'all') {
        if (t.outwardProjectId !== selectedProjectId && t.inwardProjectId !== selectedProjectId) {
          return false;
        }
      }
      // Category filter
      if (selectedCategory !== 'All' && t.category !== selectedCategory) {
        return false;
      }
      // Status filter
      if (selectedStatus !== 'All' && t.status !== selectedStatus) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesMat = t.materialName.toLowerCase().includes(q);
        const matchesCategory = t.category.toLowerCase().includes(q);
        const matchesOut = t.outwardProjectName.toLowerCase().includes(q);
        const matchesIn = t.inwardProjectName.toLowerCase().includes(q);
        const matchesVehicle = (t.vehicleNumber || '').toLowerCase().includes(q);
        const matchesNotes = (t.notes || '').toLowerCase().includes(q);
        if (!matchesMat && !matchesCategory && !matchesOut && !matchesIn && !matchesVehicle && !matchesNotes) {
          return false;
        }
      }
      return true;
    });
  }, [transfers, selectedProjectId, selectedCategory, selectedStatus, searchQuery]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalCount = filteredTransfers.length;
    let totalVal = 0;
    let verifiedCount = 0;
    let inTransitCount = 0;

    filteredTransfers.forEach((t) => {
      totalVal += t.amount;
      if (t.status === 'Received & Verified') verifiedCount++;
      if (t.status === 'In Transit' || t.status === 'Dispatched') inTransitCount++;
    });

    return { totalCount, totalVal, verifiedCount, inTransitCount };
  }, [filteredTransfers]);

  // Submit New Internal Transfer
  const handleAddTransferSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formMaterialName.trim() || !formOutwardProjectId || !formInwardProjectId || !formQuantity || !formRate) {
      alert('Please fill all required fields: Material Name, Outward Site, Inward Site, Quantity, and Rate.');
      return;
    }

    if (formOutwardProjectId === formInwardProjectId) {
      alert('Outward Site (From) and Inward Site (To) cannot be the same!');
      return;
    }

    const outProj = projects.find((p) => p.id === formOutwardProjectId);
    const inProj = projects.find((p) => p.id === formInwardProjectId);

    const qtyNum = Number(formQuantity);
    const rateNum = Number(formRate);
    const totalAmt = qtyNum * rateNum;

    onAddTransfer({
      materialId: selectedMaterialId !== 'custom' ? selectedMaterialId : undefined,
      materialName: formMaterialName.trim(),
      category: formCategory,
      outwardProjectId: formOutwardProjectId,
      outwardProjectName: outProj?.name || 'Outward Site',
      inwardProjectId: formInwardProjectId,
      inwardProjectName: inProj?.name || 'Inward Site',
      quantity: qtyNum,
      unit: formUnit,
      rate: rateNum,
      amount: totalAmt,
      status: 'Dispatched',
      transferDate: formTransferDate,
      vehicleNumber: formVehicleNumber.trim() || undefined,
      driverName: formDriverName.trim() || undefined,
      notes: formNotes.trim() || undefined,
      photoUrl: formPhotoUrl || undefined,
      photoFileName: formPhotoFileName || undefined,
    });

    // Close form modal
    setIsAddTransferOpen(false);

    // Trigger Email Dispatch Notification Modal
    const inManagerName = inProj?.manager || 'Receiving Site Manager';
    const inManagerEmail = inProj?.managerEmail || `${inProj?.name.toLowerCase().replace(/\s+/g, '')}@buildtrack.in`;

    setEmailAlertModal({
      isOpen: true,
      subject: `[DISPATCH NOTIFICATION] Material Transfer from ${outProj?.name} to ${inProj?.name}`,
      sender: `${currentUser?.name || 'Site Manager'} (${outProj?.name})`,
      recipient: `${inManagerName} (${inManagerEmail})`,
      inwardProjectName: inProj?.name || 'Inward Site',
      outwardProjectName: outProj?.name || 'Outward Site',
      materialName: formMaterialName.trim(),
      quantity: qtyNum,
      unit: formUnit,
      vehicleNumber: formVehicleNumber.trim() || undefined,
      driverName: formDriverName.trim() || undefined,
    });

    setSuccessToast(
      `✓ Internal Transfer dispatched! Quantity & estimation cost reduced for ${outProj?.name}. Email notification dispatched to ${inProj?.name}.`
    );
    setTimeout(() => setSuccessToast(null), 6000);
  };

  // Receive Material & Update Catalog
  const handleConfirmReceived = (transfer: InternalTransferRecord) => {
    onUpdateTransferStatus(transfer.id, 'Received & Verified', transfer.photoUrl, transfer.photoFileName, 'Received & verified by site manager');

    setIncomingTransferPopup(null);
    if (actionTransfer?.id === transfer.id) setActionTransfer(null);

    setSuccessToast(
      `✓ Material "${transfer.materialName}" (${transfer.quantity} ${transfer.unit}) received at ${transfer.inwardProjectName}! Added to Procurement and Contracts stock & estimation cost updated.`
    );
    setTimeout(() => setSuccessToast(null), 6000);
  };

  // Submit Action Status Update
  const handleActionSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!actionTransfer) return;

    if (actionStatus === 'Received & Verified') {
      handleConfirmReceived(actionTransfer);
    } else {
      onUpdateTransferStatus(
        actionTransfer.id,
        actionStatus,
        actionPhotoUrl || actionTransfer.photoUrl,
        actionPhotoFileName || actionTransfer.photoFileName,
        actionNotes.trim() || actionTransfer.notes
      );
      setSuccessToast(`Transfer status updated to "${actionStatus}"`);
      setTimeout(() => setSuccessToast(null), 4000);
    }

    setActionTransfer(null);
  };

  const fmtCurr = (val: number) => `Rs. ${val.toLocaleString('en-IN')}`;

  const renderStatusBadge = (status: InternalTransferRecord['status']) => {
    switch (status) {
      case 'Received & Verified':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap bg-emerald-50 text-emerald-800 border-emerald-200">
            <CheckCircle2 size={12} /> Received & Verified
          </span>
        );
      case 'In Transit':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap bg-amber-50 text-amber-800 border-amber-200">
            <Clock size={12} className="animate-spin" /> In Transit
          </span>
        );
      case 'Dispatched':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]">
            <Truck size={12} /> Dispatched
          </span>
        );
      case 'Rejected / Issue':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap bg-rose-50 text-rose-700 border-rose-200">
            <AlertTriangle size={12} /> Rejected / Issue
          </span>
        );
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800">{status}</span>;
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200" id="internal-transfer-section">
      {/* Toast Alert Feedback */}
      <AnimatePresence>
        {successToast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            role="status"
            className="flex items-start justify-between gap-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-lg px-4 py-2.5"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-emerald-600 shrink-0" />
              <span>{successToast}</span>
            </div>
            <button onClick={() => setSuccessToast(null)} aria-label="Dismiss" className="text-emerald-700 cursor-pointer">
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#23408e] text-white flex items-center justify-center shrink-0">
            <ArrowUpDown size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Internal Site-to-Site Material Transfer</h1>
            <p className="text-xs text-slate-500">Dispatch material between sites with automatic email notices, receiving-site stock updates and estimation cost balance.</p>
          </div>
        </div>
        <button
          id="btn-new-transfer"
          onClick={handleOpenNewTransferModal}
          className="px-4 py-2.5 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
        >
          <Plus size={16} /> Record New Internal Transfer
        </button>
      </div>

      {/* Incoming dispatches waiting to be received at this site */}
      {incomingPendingTransfers.length > 0 && (
        <div className="bg-[#f5f8fd] border border-[#d9e3f5] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
              <Bell size={18} />
            </span>
            <div className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-slate-900">Material en route to your site</p>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-amber-50 text-amber-800 border-amber-200">
                  {incomingPendingTransfers.length} incoming dispatch{incomingPendingTransfers.length === 1 ? '' : 'es'}
                </span>
              </div>
              <p className="text-slate-600 mt-0.5">
                {incomingPendingTransfers[0].materialName} ({incomingPendingTransfers[0].quantity} {incomingPendingTransfers[0].unit}) dispatched from{' '}
                <strong className="text-slate-800">{incomingPendingTransfers[0].outwardProjectName}</strong>
                {incomingPendingTransfers[0].vehicleNumber && ` via vehicle ${incomingPendingTransfers[0].vehicleNumber}`}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIncomingTransferPopup(incomingPendingTransfers[0])}
            className="px-3.5 py-2 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <Mail size={14} /> View Email Alert &amp; Receive
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Transfers Logged', value: metrics.totalCount, hint: 'Matching the filters' },
          { label: 'Total Transferred Value', value: fmtCurr(metrics.totalVal), hint: 'Quantity x rate' },
          { label: 'Received & Verified', value: metrics.verifiedCount, hint: 'Completed transfers' },
          { label: 'In Transit / Dispatched', value: metrics.inTransitCount, hint: 'Awaiting receipt' },
        ].map((k) => (
          <div key={k.label} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm min-w-0">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{k.label}</span>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 break-words">{k.value}</p>
            <span className="text-[11px] text-slate-500">{k.hint}</span>
          </div>
        ))}
      </div>

      {/* Transfers table card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Search size={16} className="text-slate-400 shrink-0" />
            <input
              id="search-transfers-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search material, outward/inward site, vehicle no, notes"
              aria-label="Search transfers"
              className="flex-1 min-w-0 text-sm py-1 focus:outline-hidden"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Filter size={13} className="text-slate-500" />
            <select
              id="filter-transfer-category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filter by category"
              className="bg-white border border-slate-300 text-slate-800 text-sm rounded-lg px-3 py-1.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20 cursor-pointer"
            >
              {CATEGORY_LIST.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'All' ? 'All Categories' : cat}
                </option>
              ))}
            </select>
            <select
              id="filter-transfer-status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              aria-label="Filter by status"
              className="bg-white border border-slate-300 text-slate-800 text-sm rounded-lg px-3 py-1.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20 cursor-pointer"
            >
              <option value="All">All Statuses</option>
              {STATUS_OPTIONS.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-[#23408e] text-white text-xs font-semibold uppercase tracking-wide">
                <th className="px-3 py-3 text-center w-12">Sr. No.</th>
                <th className="px-3 py-3 min-w-[170px]">Material / Description</th>
                <th className="px-3 py-3 min-w-[110px]">Category</th>
                <th className="px-3 py-3 min-w-[130px]">Outward From</th>
                <th className="px-3 py-3 min-w-[130px]">Inward To</th>
                <th className="px-3 py-3 text-right min-w-[90px]">Quantity</th>
                <th className="px-3 py-3 text-center min-w-[80px]">Unit</th>
                <th className="px-3 py-3 text-right min-w-[90px]">Rate (Rs)</th>
                <th className="px-3 py-3 text-right min-w-[110px]">Amount (Rs)</th>
                <th className="px-3 py-3 text-center min-w-[200px]">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransfers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-sm text-slate-500">
                    No internal material transfer records found.
                  </td>
                </tr>
              ) : (
                filteredTransfers.map((t, idx) => {
                  const calculatedAmount = t.quantity * t.rate;
                  const isPendingInward = (t.status === 'Dispatched' || t.status === 'In Transit') && selectedProjectId === t.inwardProjectId;

                  return (
                    <tr key={t.id} className={`border-b border-slate-100 last:border-0 hover:bg-[#f5f8fd] transition-colors align-top ${isPendingInward ? 'bg-amber-50/40' : ''}`}>
                      <td className="px-3 py-3 text-center text-xs text-slate-500">{idx + 1}</td>

                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-900">{t.materialName}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
                          <span>{t.transferDate}</span>
                          {t.vehicleNumber && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded border bg-slate-50 border-slate-200 text-slate-600 font-mono text-[10px]">
                              {t.vehicleNumber}
                            </span>
                          )}
                        </div>
                        {t.notes && (
                          <p className="text-[11px] text-slate-500 mt-1 max-w-[190px] truncate" title={t.notes}>
                            Note: {t.notes}
                          </p>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-slate-100 text-slate-700 border-slate-200 whitespace-nowrap">
                          {t.category}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-slate-700">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <ArrowUpRight size={14} className="text-rose-500 shrink-0" aria-label="Outward" />
                          <span className="truncate max-w-[120px]" title={t.outwardProjectName}>{t.outwardProjectName}</span>
                        </div>
                      </td>

                      <td className="px-3 py-3 text-slate-700">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <ArrowDownLeft size={14} className="text-emerald-600 shrink-0" aria-label="Inward" />
                          <span className="truncate max-w-[120px]" title={t.inwardProjectName}>{t.inwardProjectName}</span>
                        </div>
                      </td>

                      <td className="px-3 py-3 text-right font-medium text-slate-900">
                        {t.quantity.toLocaleString('en-IN')}
                      </td>

                      <td className="px-3 py-3 text-center text-slate-600">{t.unit}</td>

                      <td className="px-3 py-3 text-right text-slate-800">
                        Rs. {t.rate.toLocaleString('en-IN')}
                      </td>

                      <td className="px-3 py-3 text-right font-semibold text-slate-900">
                        {fmtCurr(calculatedAmount)}
                      </td>

                      <td className="px-3 py-3 text-center">
                        <div className="space-y-2">
                          <div className="flex items-center justify-center">{renderStatusBadge(t.status)}</div>
                          <div className="flex flex-wrap items-center justify-center gap-1.5">
                            {(t.status === 'Dispatched' || t.status === 'In Transit') && (
                              <button
                                id={`btn-receive-verify-${t.id}`}
                                onClick={() => handleConfirmReceived(t)}
                                className="px-2.5 py-1.5 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                                title="Click to receive & add stock to Procurement and Contracts"
                              >
                                <PackageCheck size={12} />
                                Receive &amp; Add Stock
                              </button>
                            )}

                            <button
                              id={`btn-manage-status-${t.id}`}
                              onClick={() => {
                                setActionTransfer(t);
                                setActionStatus(t.status);
                                setActionNotes(t.notes || '');
                                setActionPhotoUrl(t.photoUrl || '');
                                setActionPhotoFileName(t.photoFileName || '');
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-[#23408e] text-[#23408e] bg-white hover:bg-[#f5f8fd] text-xs font-semibold cursor-pointer"
                            >
                              Update
                            </button>

                            {t.photoUrl ? (
                              <button
                                id={`btn-view-photo-${t.id}`}
                                onClick={() =>
                                  setPreviewPhoto({
                                    url: t.photoUrl!,
                                    fileName: t.photoFileName,
                                    title: `${t.materialName} Delivery Proof`,
                                    transfer: t,
                                  })
                                }
                                className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                                title="View supporting dispatch/receipt picture"
                              >
                                <Camera size={12} />
                                Picture
                              </button>
                            ) : (
                              <button
                                id={`btn-upload-photo-${t.id}`}
                                onClick={() => {
                                  setActionTransfer(t);
                                  setActionStatus(t.status);
                                  setActionNotes(t.notes || '');
                                  setActionPhotoUrl(t.photoUrl || '');
                                  setActionPhotoFileName(t.photoFileName || '');
                                }}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                                title="Upload supporting picture or gate pass"
                              >
                                <Upload size={12} />
                                + Image
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: RECORD NEW INTERNAL TRANSFER */}
      <AnimatePresence>
        {isAddTransferOpen && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-[#23408e] text-white inline-flex items-center justify-center">
                    <Truck size={18} />
                  </span>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-950">Record Internal Material Transfer</h3>
                    <p className="text-xs text-slate-500 font-medium">Issue gate pass, notify receiving site manager & update catalog balances</p>
                  </div>
                </div>
                <button onClick={() => setIsAddTransferOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAddTransferSubmit} className="space-y-4">
                {/* Outward Site Allocation Box */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <p className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 size={14} className="text-slate-700" /> Site Transfer Allocation
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Outward From (Source Site Dropdown) */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="transfer-outward-site" className="block text-[11px] font-bold text-red-800 uppercase tracking-wider">
                          Outward From (Source Site) *
                        </label>
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-900 text-[9px] font-black rounded-xs uppercase">
                          Dispatch Site
                        </span>
                      </div>
                      <select
                        id="transfer-outward-site"
                        required
                        value={formOutwardProjectId || autoselectedOutwardProject?.id || ''}
                        onChange={(e) => {
                          const selectedOutId = e.target.value;
                          setFormOutwardProjectId(selectedOutId);
                          const availIn = projects.filter((p) => p.id !== selectedOutId);
                          if (availIn.length > 0 && formInwardProjectId === selectedOutId) {
                            setFormInwardProjectId(availIn[0].id);
                          }
                        }}
                        className="w-full bg-red-50 border border-red-300 text-red-950 text-xs font-extrabold rounded-xl px-3 py-2.5 focus:outline-hidden focus:border-red-700 cursor-pointer"
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.location})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Inward To - DROPDOWN OF ALL ONGOING PROJECTS */}
                    <div>
                      <label htmlFor="transfer-inward-site" className="block text-[11px] font-bold text-emerald-800 uppercase tracking-wider mb-1">
                        Inward To (Receiving Site Dropdown) *
                      </label>
                      <select
                        id="transfer-inward-site"
                        required
                        value={formInwardProjectId}
                        onChange={(e) => setFormInwardProjectId(e.target.value)}
                        className="w-full bg-white border border-emerald-300 text-emerald-950 text-xs font-extrabold rounded-xl px-3 py-2.5 focus:outline-hidden focus:border-emerald-700 cursor-pointer"
                      >
                        {ongoingInwardProjects.length === 0 ? (
                          <option value="">No other ongoing projects available</option>
                        ) : (
                          ongoingInwardProjects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.location}) — Mgr: {p.manager}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Select Material from Catalog or Custom Entry */}
                <div>
                  <label htmlFor="transfer-mat-select" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Select Material from {autoselectedOutwardProject?.name || 'Site'} Stock OR Custom Entry *
                  </label>
                  <select
                    id="transfer-mat-select"
                    value={selectedMaterialId}
                    onChange={(e) => handleMaterialSelect(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-950 text-xs font-bold rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] mb-2"
                  >
                    <option value="custom">+ Type Custom Material / Description</option>
                    {outwardSiteMaterials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.category}) — Avail: {m.currentStock} {m.unit} @ Rs.{m.unitCost}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="transfer-mat-name" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Material Name / Description *
                    </label>
                    <input
                      id="transfer-mat-name"
                      type="text"
                      required
                      value={formMaterialName}
                      onChange={(e) => setFormMaterialName(e.target.value)}
                      placeholder="e.g. OPC 53 Grade Cement Bags"
                      className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-bold rounded-xl px-3.5 py-2.5"
                    />
                  </div>

                  <div>
                    <label htmlFor="transfer-category" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Category *
                    </label>
                    <select
                      id="transfer-category"
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-bold rounded-xl px-3.5 py-2.5"
                    >
                      {CATEGORY_LIST.filter((c) => c !== 'All').map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Quantity, Unit, Rate, Amount */}
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label htmlFor="transfer-qty" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Quantity *
                    </label>
                    <input
                      id="transfer-qty"
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      value={formQuantity}
                      onChange={(e) => setFormQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-black rounded-xl px-3 py-2"
                    />
                  </div>

                  <div>
                    <label htmlFor="transfer-unit" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Unit *
                    </label>
                    <select
                      id="transfer-unit"
                      value={formUnit}
                      onChange={(e) => setFormUnit(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-bold rounded-xl px-3 py-2"
                    >
                      {UNIT_OPTIONS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="transfer-rate" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Rate / Unit (Rs) *
                    </label>
                    <input
                      id="transfer-rate"
                      type="number"
                      step="any"
                      min="0"
                      required
                      value={formRate}
                      onChange={(e) => setFormRate(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-white border border-slate-300 text-slate-950 text-xs font-black rounded-xl px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Calculated Amount
                    </label>
                    <div className="w-full bg-indigo-50 border border-indigo-200 text-indigo-950 font-black text-xs rounded-xl px-3 py-2 flex items-center">
                      {fmtCurr((Number(formQuantity) || 0) * (Number(formRate) || 0))}
                    </div>
                  </div>
                </div>

                {/* Vehicle & Driver Details */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="transfer-veh" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Vehicle / Truck No.
                    </label>
                    <input
                      id="transfer-veh"
                      type="text"
                      value={formVehicleNumber}
                      onChange={(e) => setFormVehicleNumber(e.target.value)}
                      placeholder="e.g. MH-12-PQ-4589"
                      className="w-full bg-white border border-slate-300 text-xs font-medium rounded-xl px-3 py-2"
                    />
                  </div>

                  <div>
                    <label htmlFor="transfer-driver" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Driver Name / Phone
                    </label>
                    <input
                      id="transfer-driver"
                      type="text"
                      value={formDriverName}
                      onChange={(e) => setFormDriverName(e.target.value)}
                      placeholder="e.g. Suresh Patil"
                      className="w-full bg-white border border-slate-300 text-xs font-medium rounded-xl px-3 py-2"
                    />
                  </div>

                  <div>
                    <label htmlFor="transfer-date" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Transfer Date *
                    </label>
                    <input
                      id="transfer-date"
                      type="date"
                      required
                      value={formTransferDate}
                      onChange={(e) => setFormTransferDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-xs font-bold rounded-xl px-3 py-2"
                    />
                  </div>
                </div>

                {/* Photo Upload */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Supporting Picture / Gate Pass Photo
                  </label>
                  <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <input
                      id="transfer-photo-file"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setFormPhotoFileName(file.name);
                          setFormPhotoUrl(URL.createObjectURL(file));
                        }
                      }}
                      className="hidden"
                    />
                    <label
                      htmlFor="transfer-photo-file"
                      className="px-3 py-1.5 bg-[#23408e] hover:bg-[#1b3170] text-white text-xs font-semibold rounded-lg cursor-pointer shrink-0 inline-flex items-center gap-1.5"
                    >
                      <Upload size={13} /> Choose Image
                    </label>
                    {formPhotoFileName ? (
                      <span className="text-xs text-emerald-700 font-bold truncate">✓ {formPhotoFileName}</span>
                    ) : (
                      <span className="text-xs text-slate-400">Upload gate pass or truck loading photo</span>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="transfer-notes" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Remarks / Purpose of Transfer
                  </label>
                  <input
                    id="transfer-notes"
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="e.g. Emergency site requirement for 4th floor slab casting"
                    className="w-full bg-white border border-slate-300 text-xs rounded-xl p-2.5"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setIsAddTransferOpen(false)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold rounded-lg cursor-pointer flex items-center gap-1.5"
                  >
                    <Send size={14} /> Dispatch & Send Email Notice
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: AUTOMATED EMAIL DISPATCH NOTIFICATION POPUP */}
      <AnimatePresence>
        {emailAlertModal && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 overflow-hidden"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-[#23408e] text-white inline-flex items-center justify-center">
                    <Mail size={18} />
                  </span>
                  <div>
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-900 text-[10px] font-black uppercase rounded-sm">
                      Automated System Dispatch Email
                    </span>
                    <h3 className="text-sm font-black text-slate-950 mt-0.5">Email Sent to Receiving Site Manager</h3>
                  </div>
                </div>
                <button onClick={() => setEmailAlertModal(null)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                  <X size={18} />
                </button>
              </div>

              <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2 text-xs font-mono">
                <div className="border-b border-slate-800 pb-2 space-y-1">
                  <p>
                    <strong className="text-slate-400">FROM:</strong> {emailAlertModal.sender}
                  </p>
                  <p>
                    <strong className="text-slate-400">TO:</strong> {emailAlertModal.recipient}
                  </p>
                  <p>
                    <strong className="text-slate-400">SUBJECT:</strong> {emailAlertModal.subject}
                  </p>
                </div>

                <div className="pt-2 space-y-2 text-slate-200 font-sans text-xs">
                  <p>Dear {emailAlertModal.inwardProjectName} Site Team,</p>
                  <p>
                    Please be advised that an internal material transfer has been dispatched from{' '}
                    <strong className="text-amber-300">{emailAlertModal.outwardProjectName}</strong>:
                  </p>
                  <div className="p-2.5 bg-slate-800 rounded-lg border border-slate-700 space-y-1 text-white">
                    <p>
                      • <strong>Material:</strong> {emailAlertModal.materialName}
                    </p>
                    <p>
                      • <strong>Quantity:</strong> {emailAlertModal.quantity} {emailAlertModal.unit}
                    </p>
                    {emailAlertModal.vehicleNumber && (
                      <p>
                        • <strong>Vehicle No:</strong> {emailAlertModal.vehicleNumber}
                      </p>
                    )}
                    {emailAlertModal.driverName && (
                      <p>
                        • <strong>Driver / Contact:</strong> {emailAlertModal.driverName}
                      </p>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 italic">
                    Please log into your site dashboard to click "Received & Verified" upon physical receipt to automatically increment your Resource
                    Catalog stock and estimation cost valuation.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end pt-2">
                <button
                  onClick={() => setEmailAlertModal(null)}
                  className="px-4 py-2 bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold rounded-lg cursor-pointer"
                >
                  Close & View Ledger
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: INCOMING DISPATCH POP-UP MODAL FOR RECEIVING SITE */}
      <AnimatePresence>
        {incomingTransferPopup && (
          <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-lg bg-[#23408e] text-white inline-flex items-center justify-center">
                    <Bell size={20} />
                  </span>
                  <h3 className="text-base font-bold text-slate-900">Material Transfer Alert</h3>
                </div>
                <button id="btn-close-incoming-popup" onClick={() => setIncomingTransferPopup(null)} aria-label="Close" className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              <div className="p-4 bg-[#f5f8fd] border border-[#d9e3f5] rounded-xl space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700">
                  <span>From: {incomingTransferPopup.outwardProjectName}</span>
                  <ArrowRight size={14} className="text-slate-400" />
                  <span className="text-right">To: {incomingTransferPopup.inwardProjectName}</span>
                </div>

                <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1.5 text-xs text-slate-900">
                  <p className="font-semibold text-sm text-slate-900">{incomingTransferPopup.materialName}</p>
                  <p className="font-bold text-slate-700">
                    Quantity: <span className="text-slate-900 font-semibold">{incomingTransferPopup.quantity} {incomingTransferPopup.unit}</span> @ Rs.{incomingTransferPopup.rate}/unit
                  </p>
                  <p className="font-semibold text-slate-900">Total Value: {fmtCurr(incomingTransferPopup.amount)}</p>
                  {incomingTransferPopup.vehicleNumber && (
                    <p className="text-[11px] text-slate-600">Vehicle No: <strong>{incomingTransferPopup.vehicleNumber}</strong></p>
                  )}
                  {incomingTransferPopup.driverName && (
                    <p className="text-[11px] text-slate-600">Driver: <strong>{incomingTransferPopup.driverName}</strong></p>
                  )}
                </div>

                <p className="text-[11px] text-slate-600">
                  Clicking "Received & Verified" will automatically add/increment this material in your <strong>Procurement and Contracts</strong> stock and adjust your site's estimation cost.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIncomingTransferPopup(null)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Remind Me Later
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmReceived(incomingTransferPopup)}
                  className="px-4 py-2 bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold rounded-lg cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                >
                  <PackageCheck size={16} /> Mark Received & Add to Catalog
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 4: MANAGE STATUS & SUPPORTING PICTURE MODAL */}
      <AnimatePresence>
        {actionTransfer && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-extrabold text-slate-950">Update Transfer Action & Status</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {actionTransfer.materialName} ({actionTransfer.quantity} {actionTransfer.unit})
                  </p>
                </div>
                <button onClick={() => setActionTransfer(null)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleActionSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Transfer Route</label>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between font-bold">
                    <span className="text-red-900">{actionTransfer.outwardProjectName}</span>
                    <ArrowRight size={14} className="text-slate-400" />
                    <span className="text-emerald-900">{actionTransfer.inwardProjectName}</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="action-status-select" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Current Transfer Status *
                  </label>
                  <select
                    id="action-status-select"
                    value={actionStatus}
                    onChange={(e) => setActionStatus(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 text-slate-950 text-sm font-bold rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e]"
                  >
                    {STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Supporting Image / Gate Pass Photo
                  </label>
                  <div className="space-y-2">
                    {actionPhotoUrl && (
                      <div className="relative rounded-xl overflow-hidden border border-slate-200 max-h-36 bg-slate-100 flex items-center justify-center">
                        <img src={actionPhotoUrl} alt="Transfer proof" className="object-cover h-36 w-full" />
                      </div>
                    )}
                    <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      <input
                        id="action-photo-file"
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setActionPhotoFileName(file.name);
                            setActionPhotoUrl(URL.createObjectURL(file));
                          }
                        }}
                        className="hidden"
                      />
                      <label
                        htmlFor="action-photo-file"
                        className="px-3 py-1.5 bg-[#23408e] hover:bg-[#1b3170] text-white text-xs font-semibold rounded-lg cursor-pointer shrink-0 inline-flex items-center gap-1.5"
                      >
                        <Upload size={13} /> {actionPhotoUrl ? 'Replace Photo' : 'Upload Image'}
                      </label>
                      <span className="text-xs text-slate-500 truncate">{actionPhotoFileName || 'No photo selected'}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="action-notes-input" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Verification Notes / Remarks
                  </label>
                  <textarea
                    id="action-notes-input"
                    rows={2}
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    placeholder="Enter receipt condition, gate pass verification, or damage note..."
                    className="w-full bg-white border border-slate-300 text-slate-950 text-xs rounded-xl p-2.5"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setActionTransfer(null)}
                    className="px-3 py-2 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="px-4 py-2 bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold rounded-lg cursor-pointer">
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 5: LIGHTBOX PHOTO PREVIEW */}
      <AnimatePresence>
        {previewPhoto && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full p-5 space-y-3 overflow-hidden"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <Camera size={18} className="text-emerald-700" />
                  <h3 className="text-sm font-extrabold text-slate-950">{previewPhoto.title}</h3>
                </div>
                <button onClick={() => setPreviewPhoto(null)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                  <X size={18} />
                </button>
              </div>

              <div className="rounded-xl overflow-hidden border border-slate-200 max-h-80 bg-slate-900 flex items-center justify-center">
                <img src={previewPhoto.url} alt={previewPhoto.title} className="max-h-80 w-full object-contain bg-black" />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between font-bold text-slate-900">
                  <span>Material: {previewPhoto.transfer.materialName}</span>
                  <span>
                    Qty: {previewPhoto.transfer.quantity} {previewPhoto.transfer.unit}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 text-[11px]">
                  <span>Outward: {previewPhoto.transfer.outwardProjectName}</span>
                  <span>Inward: {previewPhoto.transfer.inwardProjectName}</span>
                </div>
                {previewPhoto.transfer.vehicleNumber && (
                  <p className="text-[11px] text-slate-500">
                    Vehicle: <strong>{previewPhoto.transfer.vehicleNumber}</strong> | Driver:{' '}
                    <strong>{previewPhoto.transfer.driverName || 'N/A'}</strong>
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
