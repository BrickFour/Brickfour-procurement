import { useState, FormEvent, ChangeEvent, useEffect } from 'react';
import { Project, Material, User, SiteQuery } from '../types';
import { HelpCircle, X, Send, AlertTriangle, Building2, Package, Camera, UploadCloud, Trash2, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';

interface RaiseQueryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  projects: Project[];
  materials: Material[];
  selectedProjectId?: string;
  preselectedMaterialId?: string;
  onRaiseQuery: (newQuery: Omit<SiteQuery, 'id' | 'createdAt' | 'responses' | 'status'>) => void;
}

export default function RaiseQueryModal({
  isOpen,
  onClose,
  currentUser,
  projects,
  materials,
  selectedProjectId,
  preselectedMaterialId,
  onRaiseQuery,
}: RaiseQueryModalProps) {
  const [projectId, setProjectId] = useState<string>('');
  const [materialId, setMaterialId] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SiteQuery['category']>('Stock Deficit');
  const [urgency, setUrgency] = useState<SiteQuery['urgency']>('Medium');
  const [description, setDescription] = useState('');
  const [photoProofUrl, setPhotoProofUrl] = useState<string>('');
  const [photoError, setPhotoError] = useState<string>('');

  // Synchronize initial selections when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialProjId = selectedProjectId && selectedProjectId !== 'all'
        ? selectedProjectId
        : (projects[0]?.id || '');
      setProjectId(initialProjId);

      if (preselectedMaterialId) {
        setMaterialId(preselectedMaterialId);
        const mat = materials.find((m) => m.id === preselectedMaterialId);
        if (mat) {
          setSubject(`Query regarding ${mat.name} (Code: #${mat.materialCode || '001'})`);
          setDescription(`Site requirement query regarding ${mat.name}. Current stock: ${mat.currentStock} ${mat.unit}. Minimum reorder level: ${mat.minThreshold} ${mat.unit}. Please review procurement status or supply timeline.`);
        }
      } else {
        setMaterialId('');
        setSubject('');
        setDescription('');
      }
      setPhotoError('');
    }
  }, [isOpen, selectedProjectId, preselectedMaterialId, projects, materials]);

  const availableMaterials = materials.filter((m) => m.projectId === projectId);
  const selectedProj = projects.find((p) => p.id === projectId);
  const selectedMat = materials.find((m) => m.id === materialId);

  const handlePhotoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setPhotoError('Please select a valid image file (PNG, JPG, JPEG, WEBP).');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setPhotoProofUrl(reader.result as string);
        setPhotoError('');
      };
      reader.readAsDataURL(file);
    }
  };

  const applyQuickTemplate = (type: 'deficit' | 'quality' | 'delivery' | 'pricing') => {
    const matName = selectedMat?.name || 'materials';
    if (type === 'deficit') {
      setCategory('Stock Deficit');
      setUrgency('High');
      setSubject(`Urgent: Stock deficit for ${matName}`);
      setDescription(`Current inventory for ${matName} at ${selectedProj?.name || 'site'} is insufficient for upcoming work schedule. Immediate supply requisition needed.`);
    } else if (type === 'quality') {
      setCategory('Quality Issue');
      setUrgency('Medium');
      setSubject(`Quality / Specification query for ${matName}`);
      setDescription(`Received batch of ${matName} needs technical inspection / MTC certificate verification before batch approval.`);
    } else if (type === 'delivery') {
      setCategory('Delivery Delay');
      setUrgency('High');
      setSubject(`Delivery lead time enquiry for ${matName}`);
      setDescription(`Site operations await delivery schedule confirmation for ${matName} to avoid contractor labor idling.`);
    } else {
      setCategory('General Query');
      setUrgency('Low');
      setSubject(`Rate and supplier clarification for ${matName}`);
      setDescription(`Please clarify approved vendor rate contract and delivery terms for upcoming requirements of ${matName}.`);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!projectId || !subject.trim() || !description.trim()) return;

    onRaiseQuery({
      projectId,
      projectName: selectedProj?.name || 'Construction Site',
      materialId: materialId || undefined,
      materialName: selectedMat?.name || undefined,
      raisedByUserId: currentUser.id,
      raisedByName: currentUser.name,
      subject: subject.trim(),
      category,
      urgency,
      description: description.trim(),
      photoProofUrl: photoProofUrl || undefined,
    });

    // Reset
    setSubject('');
    setDescription('');
    setMaterialId('');
    setPhotoProofUrl('');
    setPhotoError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto" id="raise-query-modal">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden my-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0 bg-white z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs">
              <HelpCircle size={20} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-950">Raise Site Ticket / Query</h3>
              <p className="text-xs text-slate-500 font-medium">Notify Central Admin about delays, stock deficits, or quality issues</p>
            </div>
          </div>
          <button
            id="close-raise-query-modal"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Target Project & Linked Material Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="query-project-id" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Building2 size={13} className="text-amber-600" /> Target Project Site *
              </label>
              <select
                id="query-project-id"
                required
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setMaterialId(''); // reset material when project changes
                }}
                className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600/20 font-medium cursor-pointer shadow-2xs"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.location})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="query-material-id" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Package size={13} className="text-amber-600" /> Linked Material (Optional)
              </label>
              <select
                id="query-material-id"
                value={materialId}
                onChange={(e) => setMaterialId(e.target.value)}
                className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600/20 font-medium cursor-pointer shadow-2xs"
              >
                <option value="">-- General Site Issue / Not Material Specific --</option>
                {availableMaterials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} [{m.category} | Stock: {m.currentStock} {m.unit}]
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Subject */}
          <div>
            <label htmlFor="query-subject" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Query Title / Subject *
            </label>
            <input
              id="query-subject"
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Low TMT Steel Bar stock vs upcoming slab pour schedule"
              className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600/20 shadow-2xs"
            />
          </div>

          {/* Category & Urgency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="query-category" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Category
              </label>
              <select
                id="query-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as SiteQuery['category'])}
                className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600/20 cursor-pointer font-medium shadow-2xs"
              >
                <option value="Stock Deficit">Stock Deficit</option>
                <option value="Delivery Delay">Delivery Delay</option>
                <option value="Quality Issue">Quality Issue</option>
                <option value="Budget Approval">Budget Approval</option>
                <option value="General Query">General Query</option>
              </select>
            </div>

            <div>
              <label htmlFor="query-urgency" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <AlertTriangle size={13} className="text-amber-500" /> Urgency Level
              </label>
              <select
                id="query-urgency"
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as SiteQuery['urgency'])}
                className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600/20 cursor-pointer font-medium shadow-2xs"
              >
                <option value="Low">Low - Informational</option>
                <option value="Medium">Medium - Normal Attention</option>
                <option value="High">High - Impending Halt</option>
                <option value="Urgent">Urgent - Work Stopped</option>
              </select>
            </div>
          </div>

          {/* Quick Presets / Flexible Templates */}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">
              Quick Fill Presets (Flexible One-Click Setup):
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => applyQuickTemplate('deficit')}
                className="px-2.5 py-1 bg-white hover:bg-amber-100 border border-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-2xs"
              >
                ⚡ Stock Deficit
              </button>
              <button
                type="button"
                onClick={() => applyQuickTemplate('quality')}
                className="px-2.5 py-1 bg-white hover:bg-amber-100 border border-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-2xs"
              >
                ⚠️ Quality / Spec Check
              </button>
              <button
                type="button"
                onClick={() => applyQuickTemplate('delivery')}
                className="px-2.5 py-1 bg-white hover:bg-amber-100 border border-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-2xs"
              >
                🚚 Delivery Schedule
              </button>
              <button
                type="button"
                onClick={() => applyQuickTemplate('pricing')}
                className="px-2.5 py-1 bg-white hover:bg-amber-100 border border-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-2xs"
              >
                💰 Rate Clarification
              </button>
            </div>
          </div>

          {/* Detailed Description */}
          <div>
            <label htmlFor="query-description" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Issue Explanation / Required Action *
            </label>
            <textarea
              id="query-description"
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the situation on-site, batch numbers, supplier details, or estimated time impact..."
              className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl p-3.5 focus:outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600/20 font-sans resize-y min-h-[90px] shadow-2xs"
            />
          </div>

          {/* Upload Photo Proof Section (Optional) */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <label htmlFor="query-photo-input" className="block text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 cursor-pointer">
                <Camera size={15} className="text-amber-600" /> Site Photo Evidence (Optional)
              </label>
              {photoProofUrl && (
                <span className="text-[10px] text-emerald-700 font-extrabold flex items-center gap-1 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                  <CheckCircle2 size={12} /> Photo Attached
                </span>
              )}
            </div>

            {photoProofUrl ? (
              <div className="relative rounded-xl border border-emerald-300 bg-white p-3 flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={photoProofUrl}
                    alt="Uploaded site proof"
                    className="w-14 h-14 object-cover rounded-lg border border-slate-200 shadow-2xs shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">Site Photo Evidence Attached</p>
                    <p className="text-[11px] text-slate-500 font-medium">Ready for dispatch review</p>
                  </div>
                </div>
                <button
                  id="btn-remove-photo-proof"
                  type="button"
                  onClick={() => {
                    setPhotoProofUrl('');
                    setPhotoError('');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 transition-colors cursor-pointer text-xs font-bold flex items-center gap-1 border border-red-200 shrink-0 shadow-2xs"
                >
                  <Trash2 size={13} /> Remove
                </button>
              </div>
            ) : (
              <div>
                <label
                  htmlFor="query-photo-input"
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 border-dashed transition-all cursor-pointer bg-white hover:bg-amber-50/50 ${
                    photoError ? 'border-red-400 bg-red-50/30' : 'border-slate-300 hover:border-amber-500'
                  }`}
                >
                  <UploadCloud size={20} className={photoError ? 'text-red-500 mb-1' : 'text-amber-600 mb-1'} />
                  <p className="text-xs font-bold text-slate-900 text-center">
                    Click to attach site photo proof <span className="text-slate-400 font-normal">(Optional)</span>
                  </p>
                  <p className="text-[10px] text-slate-500 font-medium mt-0.5 text-center">
                    PNG, JPG, WEBP or capture photo if evidence is available
                  </p>
                  <input
                    id="query-photo-input"
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="sr-only"
                  />
                </label>
              </div>
            )}

            {photoError && (
              <p className="text-xs text-red-600 font-extrabold flex items-center gap-1 pt-0.5">
                <AlertTriangle size={13} /> {photoError}
              </p>
            )}
          </div>
        </form>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex gap-3 shrink-0">
          <button
            id="btn-cancel-raise-query"
            type="button"
            onClick={onClose}
            className="flex-1 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold py-3 rounded-xl transition-colors cursor-pointer border border-slate-300 shadow-2xs"
          >
            Cancel
          </button>
          <button
            id="btn-submit-raise-query"
            type="button"
            onClick={(e) => {
              // Trigger form submit via form element or handleSubmit
              const formEl = document.querySelector('#raise-query-modal form') as HTMLFormElement;
              if (formEl) {
                formEl.requestSubmit();
              }
            }}
            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold py-3 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Send size={14} /> Submit Ticket
          </button>
        </div>
      </motion.div>
    </div>
  );
}
