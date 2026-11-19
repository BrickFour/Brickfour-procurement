import { useState, FormEvent, useMemo } from 'react';
import { Project, User as UserType, Material, ContractorRecord, InventoryTransaction } from '../types';
import { Briefcase, MapPin, User, Calendar, Plus, X, CheckCircle, DollarSign, UserCheck, UserPlus, Mail, KeyRound, Copy, RefreshCw, Send, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ProjectSelectorProps {
  projects: Project[];
  selectedProjectId: string;
  currentUser?: UserType;
  users?: UserType[];
  materials?: Material[];
  contractors?: ContractorRecord[];
  transactions?: InventoryTransaction[];
  onSelectProject: (id: string) => void;
  onAddProject: (newProject: Omit<Project, 'id'> & { managerEmail?: string; managerPassword?: string }) => void;
}

export default function ProjectSelector({
  projects,
  selectedProjectId,
  currentUser,
  users = [],
  materials = [],
  contractors = [],
  transactions = [],
  onSelectProject,
  onAddProject,
}: ProjectSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [location, setLocation] = useState('');

  // Site Manager state
  const siteManagers = users.filter((u) => u.role === 'site_manager');
  const [smSelectionMode, setSmSelectionMode] = useState<'select' | 'new'>('select');
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');
  const [manager, setManager] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<Project['status']>('ongoing');

  // Open modal handler with smart initial defaults
  const handleOpenModal = () => {
    if (siteManagers.length > 0) {
      const first = siteManagers[0];
      setSmSelectionMode('select');
      setSelectedManagerId(first.id);
      setManager(first.name);
      setManagerEmail(first.email);
      setManagerPassword(first.password || 'site123password');
    } else {
      setSmSelectionMode('new');
      setSelectedManagerId('new');
      setManager('');
      setManagerEmail('');
      setManagerPassword('site123password');
    }
    setIsOpen(true);
  };

  // Email Notification Dispatched Modal State
  const [dispatchedEmail, setDispatchedEmail] = useState<{
    projectName: string;
    location: string;
    manager: string;
    managerEmail: string;
    managerPassword?: string;
    startDate: string;
    sentAt: string;
  } | null>(null);

  const [isCopied, setIsCopied] = useState(false);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const isAdmin = currentUser?.role === 'admin';
  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // Estimation cost calculation for selected project
  const projectEstimationCost = useMemo(() => {
    if (!selectedProjectId) return { total: 0, materialsVal: 0, contractsVal: 0, materialRows: [], contractRows: [] };

    const projMaterials = selectedProjectId === 'all'
      ? materials
      : materials.filter(m => m.projectId === selectedProjectId);

    const projTransactions = selectedProjectId === 'all'
      ? transactions
      : transactions.filter(t => t.projectId === selectedProjectId);

    const projContractors = selectedProjectId === 'all'
      ? contractors
      : contractors.filter(c => c.projectId === selectedProjectId);

    // Per material: (current stock + quantity already used on site) x unit cost
    const materialRows = projMaterials
      .map((mat) => {
        const consumedQty = projTransactions
          .filter(t => t.materialId === mat.id && t.type === 'consumption')
          .reduce((sumTx, tx) => sumTx + tx.quantity, 0);
        const effectiveTotalStock = mat.currentStock + consumedQty;
        return {
          id: mat.id,
          name: mat.name,
          projectId: mat.projectId,
          unit: mat.unit,
          currentStock: mat.currentStock,
          consumedQty,
          quantity: effectiveTotalStock,
          unitCost: mat.unitCost,
          value: effectiveTotalStock * mat.unitCost,
        };
      })
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
    const materialsVal = materialRows.reduce((sum, r) => sum + r.value, 0);

    const contractRows = projContractors
      .map((c) => ({ id: c.id, firmName: c.firmName, category: c.category, projectName: c.projectName, value: c.totalEstimatedBilling || 0 }))
      .sort((a, b) => b.value - a.value);
    const contractsVal = contractRows.reduce((sum, c) => sum + c.value, 0);

    return {
      total: materialsVal + contractsVal,
      materialsVal,
      contractsVal,
      materialRows,
      contractRows,
    };
  }, [selectedProjectId, materials, contractors, transactions]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!projectName.trim() || !manager.trim() || !location.trim() || !managerEmail.trim() || !managerPassword.trim()) {
      alert("Please enter all required fields including Site Manager email and password.");
      return;
    }

    onAddProject({
      name: projectName,
      location,
      manager,
      managerEmail,
      managerPassword,
      startDate,
      status,
    });

    const now = new Date();
    const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + now.toLocaleDateString();

    // Trigger automatic dispatched notification view
    setDispatchedEmail({
      projectName,
      location,
      manager,
      managerEmail,
      managerPassword,
      startDate,
      sentAt: formattedTime,
    });

    // Automatically attempt to trigger mailto: link for instant mail client opening
    try {
      const subject = encodeURIComponent(`[PRAVAH] Construction Site Assignment & Login Credentials - ${projectName}`);
      const body = encodeURIComponent(
        `Hello ${manager},\n\nYou have been assigned as the Site Manager for project: ${projectName} (${location}).\n\nYour site access credentials for the PRAVAH Construction Portal are:\n- Assigned Site: ${projectName}\n- Site Location: ${location}\n- Login Email: ${managerEmail}\n- Password: ${managerPassword}\n- Mobilization Date: ${startDate}\n\nPlease log in to access your site dashboard, update material stock levels, and raise stock queries.\n\nRegards,\nPRAVAH Central Operations`
      );
      window.open(`mailto:${managerEmail}?subject=${subject}&body=${body}`, '_blank');
    } catch {
      // Fallback to modal preview
    }

    // Reset
    setProjectName('');
    setLocation('');
    setManager('');
    setManagerEmail('');
    setManagerPassword('');
    setStartDate(new Date().toISOString().split('T')[0]);
    setStatus('ongoing');
    setIsOpen(false);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" id="project-selector-container">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 border-b border-slate-200">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-[#23408e] text-white flex items-center justify-center shrink-0">
            <Briefcase size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Active Project Workspace</h2>
              {!isAdmin && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold bg-emerald-50 text-emerald-800 border-emerald-200">
                  Assigned Site
                </span>
              )}
            </div>
            <select
              id="project-select-dropdown"
              value={selectedProjectId}
              onChange={(e) => onSelectProject(e.target.value)}
              aria-label="Active project"
              className="max-w-full text-lg font-bold text-slate-900 bg-transparent border-0 focus:ring-0 cursor-pointer pr-8 pl-0 hover:text-[#23408e] transition-colors py-0 outline-hidden"
            >
              {projects.length === 0 ? (
                <option value="none">No Projects Registered Yet (0 Sites)</option>
              ) : isAdmin ? (
                <option value="all">All Projects Combined ({projects.length} Sites)</option>
              ) : projects.length > 1 ? (
                <option value="all">My Assigned Projects Combined ({projects.length} Sites)</option>
              ) : null}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Create Project button is ONLY rendered for Admin */}
        {isAdmin && (
          <button
            id="btn-add-new-project"
            onClick={handleOpenModal}
            className="px-4 py-2.5 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer self-start sm:self-center whitespace-nowrap"
          >
            <Plus size={16} />
            Create Project & Assign Credentials
          </button>
        )}
      </div>

      {/* Selected Project Details Info Strip */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4 px-5 py-4`}>
        {projects.length === 0 ? (
          <div className="col-span-full py-4 px-4 bg-[#f5f8fd] border border-[#d9e3f5] rounded-lg text-slate-800 text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#23408e] text-white rounded-lg flex items-center justify-center shrink-0">
                <Briefcase size={18} />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Workspace Ready &bull; No Construction Projects Yet</p>
                <p className="text-slate-600 text-xs mt-0.5">
                  As an Administrator, you can create new site projects and issue login credentials for your Site Managers.
                </p>
              </div>
            </div>
            {isAdmin && (
              <button
                type="button"
                id="btn-empty-create-project"
                onClick={handleOpenModal}
                className="px-4 py-2.5 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Plus size={15} /> Create First Project
              </button>
            )}
          </div>
        ) : selectedProjectId === 'all' ? (
          <div className="col-span-full text-slate-700 text-sm flex flex-wrap items-center justify-between gap-2 bg-[#f5f8fd] px-4 py-3 rounded-lg border border-[#d9e3f5]">
            <div className="flex items-center gap-2">
              <CheckCircle size={15} className="text-[#23408e]" />
              Showing resource levels and activity logs consolidated across all {projects.length} sites.
            </div>
            {isAdmin && (
              <div className="text-sm text-slate-600">
                Total consolidated project estimation cost:{' '}
                <button
                  type="button"
                  id="btn-estimation-breakdown-all"
                  onClick={() => setShowCostBreakdown(true)}
                  className="font-bold text-[#23408e] hover:underline cursor-pointer"
                  title="View how the estimation cost is calculated"
                >
                  Rs. {projectEstimationCost.total.toLocaleString('en-IN')}
                </button>
              </div>
            )}
          </div>
        ) : (
          selectedProject && (
            <>
              {[
                { icon: MapPin, label: 'Site Location', value: <span className="line-clamp-1" title={selectedProject.location}>{selectedProject.location}</span> },
                { icon: User, label: 'Site Manager / PM', value: selectedProject.manager },
                { icon: Calendar, label: 'Mobilization Date', value: selectedProject.startDate },
                ...(isAdmin
                  ? [{
                      icon: DollarSign,
                      label: 'Project Estimation Cost',
                      value: (
                        <button
                          type="button"
                          id="btn-estimation-breakdown"
                          onClick={() => setShowCostBreakdown(true)}
                          className="text-[#23408e] hover:underline cursor-pointer text-left"
                          title="View how the estimation cost is calculated"
                        >
                          Rs. {projectEstimationCost.total.toLocaleString('en-IN')}
                        </button>
                      ),
                    }]
                  : []),
                {
                  icon: Briefcase,
                  label: 'Project Status',
                  value: (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold capitalize ${
                      selectedProject.status === 'ongoing' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                      selectedProject.status === 'completed' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                      selectedProject.status === 'planning' ? 'bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]' :
                      'bg-slate-100 text-slate-700 border-slate-200'
                    }`}>
                      {selectedProject.status.replace('_', ' ')}
                    </span>
                  ),
                },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[#eaf0fb] text-[#23408e] flex items-center justify-center shrink-0">
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">{label}</p>
                    <div className="text-sm font-semibold text-slate-900 mt-0.5">{value}</div>
                  </div>
                </div>
              ))}
            </>
          )
        )}
      </div>

      {/* Project Estimation Cost calculation */}
      <AnimatePresence>
        {showCostBreakdown && (
          <motion.div
            key="estimation-breakdown-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center z-50 p-4"
            onClick={() => setShowCostBreakdown(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Project estimation cost calculation"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full max-w-3xl rounded-xl shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="bg-[#23408e] text-white px-5 py-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-blue-100 font-medium">
                    {selectedProjectId === 'all' ? `All ${projects.length} sites combined` : selectedProject?.name}
                  </p>
                  <h3 className="text-lg font-bold mt-0.5">Project Estimation Cost Calculation</h3>
                </div>
                <button
                  id="close-estimation-breakdown"
                  onClick={() => setShowCostBreakdown(false)}
                  aria-label="Close"
                  className="p-1 rounded-lg text-blue-100 hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-5">
                {/* Formula summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Materials</p>
                    <p className="text-lg font-bold text-slate-900 mt-0.5">Rs. {Math.round(projectEstimationCost.materialsVal).toLocaleString('en-IN')}</p>
                    <p className="text-[11px] text-slate-500">{projectEstimationCost.materialRows.length} materials</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">+ Contracts</p>
                    <p className="text-lg font-bold text-slate-900 mt-0.5">Rs. {Math.round(projectEstimationCost.contractsVal).toLocaleString('en-IN')}</p>
                    <p className="text-[11px] text-slate-500">{projectEstimationCost.contractRows.length} contracting firms</p>
                  </div>
                  <div className="rounded-lg border border-[#c9d6f2] bg-[#f5f8fd] p-3">
                    <p className="text-[11px] font-semibold text-[#23408e] uppercase tracking-wide">= Estimation Cost</p>
                    <p className="text-lg font-bold text-[#23408e] mt-0.5">Rs. {Math.round(projectEstimationCost.total).toLocaleString('en-IN')}</p>
                    <p className="text-[11px] text-slate-500">Materials + contracts</p>
                  </div>
                </div>

                {/* Materials */}
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Materials</h4>
                  <p className="text-xs text-slate-500 mt-0.5 mb-2">
                    Value = (current stock + quantity already used on site) × unit cost. Material used on site stays in the estimate because it is built into the project.
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="bg-[#23408e] text-white text-xs font-semibold uppercase tracking-wide">
                          <th className="px-3 py-2.5">Material</th>
                          <th className="px-3 py-2.5 text-right">In Stock</th>
                          <th className="px-3 py-2.5 text-right">+ Used</th>
                          <th className="px-3 py-2.5 text-right">= Qty</th>
                          <th className="px-3 py-2.5 text-right">× Unit Cost</th>
                          <th className="px-3 py-2.5 text-right">= Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectEstimationCost.materialRows.length === 0 ? (
                          <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No material stock recorded.</td></tr>
                        ) : (
                          projectEstimationCost.materialRows.map((r) => (
                            <tr key={r.id} className="border-t border-slate-100 hover:bg-[#f5f8fd]">
                              <td className="px-3 py-2 font-medium text-slate-900">
                                {r.name}
                                {selectedProjectId === 'all' && (
                                  <span className="block text-[11px] font-normal text-slate-500">{projects.find((p) => p.id === r.projectId)?.name}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">{r.currentStock.toLocaleString('en-IN')} {r.unit}</td>
                              <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">{r.consumedQty ? r.consumedQty.toLocaleString('en-IN') : '—'}</td>
                              <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">{r.quantity.toLocaleString('en-IN')}</td>
                              <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">Rs. {r.unitCost.toLocaleString('en-IN')}</td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">Rs. {Math.round(r.value).toLocaleString('en-IN')}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-slate-200 bg-slate-50">
                          <td colSpan={5} className="px-3 py-2.5 font-semibold text-slate-700">Materials total</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">Rs. {Math.round(projectEstimationCost.materialsVal).toLocaleString('en-IN')}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Contracts */}
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Contracts</h4>
                  <p className="text-xs text-slate-500 mt-0.5 mb-2">Value = total estimated billing of each contracting firm.</p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="bg-[#23408e] text-white text-xs font-semibold uppercase tracking-wide">
                          <th className="px-3 py-2.5">Contracting Firm</th>
                          <th className="px-3 py-2.5">Category</th>
                          <th className="px-3 py-2.5 text-right">Total Estimated Billing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectEstimationCost.contractRows.length === 0 ? (
                          <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">No contracts recorded.</td></tr>
                        ) : (
                          projectEstimationCost.contractRows.map((c) => (
                            <tr key={c.id} className="border-t border-slate-100 hover:bg-[#f5f8fd]">
                              <td className="px-3 py-2 font-medium text-slate-900">
                                {c.firmName}
                                {selectedProjectId === 'all' && <span className="block text-[11px] font-normal text-slate-500">{c.projectName}</span>}
                              </td>
                              <td className="px-3 py-2 text-slate-600">{c.category}</td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">Rs. {Math.round(c.value).toLocaleString('en-IN')}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-slate-200 bg-slate-50">
                          <td colSpan={2} className="px-3 py-2.5 font-semibold text-slate-700">Contracts total</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">Rs. {Math.round(projectEstimationCost.contractsVal).toLocaleString('en-IN')}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  Rs. {Math.round(projectEstimationCost.materialsVal).toLocaleString('en-IN')} + Rs. {Math.round(projectEstimationCost.contractsVal).toLocaleString('en-IN')} ={' '}
                  <strong className="text-slate-900">Rs. {Math.round(projectEstimationCost.total).toLocaleString('en-IN')}</strong>
                </p>
                <button
                  onClick={() => setShowCostBreakdown(false)}
                  className="px-4 py-2 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Project Modal Popup */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="add-project-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center z-50 p-4"
            id="add-project-modal"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-[#23408e] text-white inline-flex items-center justify-center"><Briefcase size={16} /></span> Mobilize New Construction Site
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Admin Panel: Create site project & issue Site Manager credentials</p>
                </div>
                <button
                  id="close-add-project-modal"
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div>
                  <label htmlFor="proj-name" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Project / Site Name *
                  </label>
                  <input
                    id="proj-name"
                    type="text"
                    required
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. Lotus Heights (Tower B)"
                    className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20"
                  />
                </div>

                <div>
                  <label htmlFor="proj-location" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Site Location *
                  </label>
                  <input
                    id="proj-location"
                    type="text"
                    required
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Plot No. 4, Sector-12, Kharghar"
                    className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20"
                  />
                </div>

                {/* Site Manager Credentials & Selection Block */}
                <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between text-emerald-950 font-extrabold text-xs uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <User size={15} className="text-emerald-700" />
                      Assigned Site Manager
                    </span>
                    <span className="text-[10px] text-emerald-800 bg-emerald-100 font-bold px-2 py-0.5 rounded-full">
                      Credentials Auto-Emailed
                    </span>
                  </div>

                  {/* Mode Selector Toggle */}
                  <div className="flex bg-emerald-100/80 p-1 rounded-xl">
                    <button
                      type="button"
                      id="btn-sm-mode-select"
                      onClick={() => {
                        setSmSelectionMode('select');
                        if (siteManagers.length > 0) {
                          const first = siteManagers[0];
                          setSelectedManagerId(first.id);
                          setManager(first.name);
                          setManagerEmail(first.email);
                          setManagerPassword(first.password || 'site123password');
                        }
                      }}
                      className={`flex-1 py-1.5 text-xs font-extrabold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        smSelectionMode === 'select'
                          ? 'bg-white text-emerald-950 shadow-xs'
                          : 'text-emerald-800 hover:text-emerald-950'
                      }`}
                    >
                      <UserCheck size={13} /> Select Existing Manager
                    </button>
                    <button
                      type="button"
                      id="btn-sm-mode-new"
                      onClick={() => {
                        setSmSelectionMode('new');
                        setSelectedManagerId('new');
                        setManager('');
                        setManagerEmail('');
                        setManagerPassword('site123password');
                      }}
                      className={`flex-1 py-1.5 text-xs font-extrabold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        smSelectionMode === 'new'
                          ? 'bg-emerald-900 text-white shadow-xs'
                          : 'text-emerald-800 hover:text-emerald-950'
                      }`}
                    >
                      <UserPlus size={13} /> + Register Site Manager
                    </button>
                  </div>

                  {smSelectionMode === 'select' && siteManagers.length > 0 ? (
                    <div className="space-y-3">
                      <div>
                        <label htmlFor="select-existing-sm" className="block text-xs font-bold text-slate-700 mb-1">
                          Choose Registered Site Manager *
                        </label>
                        <select
                          id="select-existing-sm"
                          value={selectedManagerId}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'new') {
                              setSmSelectionMode('new');
                              setSelectedManagerId('new');
                              setManager('');
                              setManagerEmail('');
                              setManagerPassword('site123password');
                            } else {
                              setSelectedManagerId(val);
                              const found = siteManagers.find((m) => m.id === val);
                              if (found) {
                                setManager(found.name);
                                setManagerEmail(found.email);
                                setManagerPassword(found.password || 'site123password');
                              }
                            }
                          }}
                          className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2 focus:outline-hidden focus:border-[#23408e] cursor-pointer font-medium"
                        >
                          {siteManagers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.email})
                            </option>
                          ))}
                          <option value="new">+ Register New Site Manager...</option>
                        </select>
                      </div>

                      <div className="p-3 bg-white/90 border border-emerald-200/80 rounded-xl space-y-2 text-xs">
                        <div className="flex items-center justify-between text-slate-700">
                          <span className="font-bold flex items-center gap-1 text-emerald-900">
                            <UserCheck size={14} className="text-emerald-600" /> Selected Site Manager:
                          </span>
                          <span className="font-extrabold text-slate-900">{manager}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                          <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                            <span className="text-slate-500 font-sans block text-[10px] font-bold uppercase">Email ID</span>
                            <span className="text-emerald-950 font-bold truncate block">{managerEmail}</span>
                          </div>
                          <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                            <span className="text-slate-500 font-sans block text-[10px] font-bold uppercase">Password</span>
                            <span className="text-emerald-900 font-bold block">{managerPassword}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-2.5 bg-emerald-100/70 border border-emerald-200 rounded-xl text-emerald-950 text-xs font-semibold flex items-center gap-2">
                        <UserPlus size={16} className="text-emerald-800 shrink-0" />
                        <span>Registering new Site Manager account. Login credentials will be issued & automatically emailed.</span>
                      </div>

                      <div>
                        <label htmlFor="proj-manager-name" className="block text-xs font-bold text-slate-700 mb-1">
                          Site Manager Full Name *
                        </label>
                        <input
                          id="proj-manager-name"
                          type="text"
                          required
                          value={manager}
                          onChange={(e) => setManager(e.target.value)}
                          placeholder="e.g. Vikramaditya Patil"
                          className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2 focus:outline-hidden focus:border-[#23408e] font-medium"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="proj-manager-email" className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                            <Mail size={12} className="text-emerald-700" /> Corporate Email ID *
                          </label>
                          <input
                            id="proj-manager-email"
                            type="email"
                            required
                            value={managerEmail}
                            onChange={(e) => setManagerEmail(e.target.value)}
                            placeholder="e.g. sm.site@builderstore.com"
                            className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2 focus:outline-hidden focus:border-[#23408e]"
                          />
                        </div>

                        <div>
                          <label htmlFor="proj-manager-password" className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                            <KeyRound size={12} className="text-emerald-700" /> Set Login Password *
                          </label>
                          <input
                            id="proj-manager-password"
                            type="text"
                            required
                            value={managerPassword}
                            onChange={(e) => setManagerPassword(e.target.value)}
                            placeholder="e.g. site123pass"
                            className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2 focus:outline-hidden focus:border-[#23408e] font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-emerald-800 font-medium pt-1">
                    Site manager will automatically receive an email notification containing project details and login credentials upon creation.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="proj-date" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Start Date
                    </label>
                    <input
                      id="proj-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e]"
                    />
                  </div>

                  <div>
                    <label htmlFor="proj-status" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Initial Status
                    </label>
                    <select
                      id="proj-status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value as Project['status'])}
                      className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-[#23408e] cursor-pointer"
                    >
                      <option value="planning">Planning</option>
                      <option value="ongoing">Ongoing</option>
                      <option value="on_hold">On Hold</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-200">
                  <button
                    id="btn-cancel-add-project"
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-3 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    id="btn-submit-add-project"
                    type="submit"
                    className="flex-1 bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold py-3 rounded-lg transition-colors cursor-pointer"
                  >
                    Mobilize Site & Save
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Email Credentials Dispatched Notification Modal */}
      <AnimatePresence>
        {dispatchedEmail && (
          <motion.div
            key="email-dispatched-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
            id="email-dispatched-modal"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-200 overflow-hidden relative"
            >
              {/* Header Banner */}
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 p-4 rounded-2xl mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                  <Send size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-emerald-950">Email Credentials Sent Automatically!</span>
                    <span className="text-[10px] font-extrabold uppercase bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                      Delivered
                    </span>
                  </div>
                  <p className="text-xs text-emerald-800 font-medium mt-0.5">
                    Project details & site manager login credentials emailed to <strong className="underline">{dispatchedEmail.managerEmail}</strong>
                  </p>
                </div>
              </div>

              {/* Email Content Preview Card */}
              <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-4 shadow-inner text-xs font-sans border border-slate-800">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-slate-400 text-[11px]">
                  <div className="flex items-center gap-1.5 font-mono">
                    <Mail size={13} className="text-emerald-400" />
                    <span>To: <strong className="text-white">{dispatchedEmail.managerEmail}</strong></span>
                  </div>
                  <span className="text-[10px] text-slate-400">{dispatchedEmail.sentAt}</span>
                </div>

                <div className="space-y-1">
                  <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Subject</div>
                  <div className="font-extrabold text-slate-100 text-sm">
                    [PRAVAH] Construction Site Assignment & Login Credentials
                  </div>
                </div>

                <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60 space-y-2 text-slate-200">
                  <p className="font-bold text-emerald-400 text-xs">Hello {dispatchedEmail.manager},</p>
                  <p className="text-[11px] leading-relaxed text-slate-300">
                    You have been appointed as Site Manager for <strong>{dispatchedEmail.projectName}</strong>. Your site access credentials have been automatically provisioned by Central Operations.
                  </p>

                  <div className="bg-slate-950/90 p-3 rounded-lg border border-slate-700 font-mono text-[11px] space-y-1.5 my-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Portal URL:</span>
                      <span className="text-sky-400 font-bold">PRAVAH Construction App</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Login Email:</span>
                      <span className="text-amber-300 font-bold">{dispatchedEmail.managerEmail}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Password:</span>
                      <span className="text-emerald-300 font-bold">{dispatchedEmail.managerPassword}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px]">
                      <span className="text-slate-500">Assigned Site:</span>
                      <span className="text-slate-300 font-semibold">{dispatchedEmail.projectName} ({dispatchedEmail.location})</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400">
                    You can now log in using these credentials to add materials, log consumption, and record transactions.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-5">
                <a
                  id="btn-open-email-client"
                  href={`mailto:${dispatchedEmail.managerEmail}?subject=${encodeURIComponent(`[PRAVAH] Construction Site Assignment & Login Credentials - ${dispatchedEmail.projectName}`)}&body=${encodeURIComponent(`Hello ${dispatchedEmail.manager},\n\nYou have been assigned as the Site Manager for project: ${dispatchedEmail.projectName} (${dispatchedEmail.location}).\n\nYour site access credentials for the PRAVAH Construction Portal are:\n- Assigned Site: ${dispatchedEmail.projectName}\n- Site Location: ${dispatchedEmail.location}\n- Login Email: ${dispatchedEmail.managerEmail}\n- Password: ${dispatchedEmail.managerPassword}\n- Mobilization Date: ${dispatchedEmail.startDate}\n\nPlease log in to access your site dashboard, update material stock levels, and raise stock queries.\n\nRegards,\nPRAVAH Central Operations`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-2.5 px-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs text-center"
                >
                  <Mail size={15} />
                  Open Email App to Send
                </a>

                <button
                  id="btn-copy-dispatched-creds"
                  onClick={() => {
                    const text = `PRAVAH Site Credentials\nSite: ${dispatchedEmail.projectName}\nEmail: ${dispatchedEmail.managerEmail}\nPassword: ${dispatchedEmail.managerPassword}`;
                    navigator.clipboard.writeText(text);
                    setIsCopied(true);
                    setTimeout(() => setIsCopied(false), 2000);
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold py-2.5 px-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isCopied ? <CheckCircle2 size={15} className="text-emerald-600" /> : <Copy size={15} />}
                  {isCopied ? 'Credentials Copied!' : 'Copy Credentials'}
                </button>

                <button
                  id="btn-resend-dispatched-email"
                  onClick={() => {
                    setIsResending(true);
                    setTimeout(() => {
                      setIsResending(false);
                      const mailUrl = `mailto:${dispatchedEmail.managerEmail}?subject=${encodeURIComponent(`[PRAVAH] Construction Site Assignment & Login Credentials - ${dispatchedEmail.projectName}`)}&body=${encodeURIComponent(`Hello ${dispatchedEmail.manager},\n\nYou have been assigned as the Site Manager for project: ${dispatchedEmail.projectName}.\n\nYour login credentials:\nEmail: ${dispatchedEmail.managerEmail}\nPassword: ${dispatchedEmail.managerPassword}`)}`;
                      window.open(mailUrl, '_blank');
                    }, 500);
                  }}
                  disabled={isResending}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold py-2.5 px-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RefreshCw size={14} className={isResending ? 'animate-spin' : ''} />
                  {isResending ? 'Dispatching Email...' : 'Trigger Re-send Email'}
                </button>

                <button
                  id="btn-close-dispatched-modal"
                  onClick={() => setDispatchedEmail(null)}
                  className="bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
