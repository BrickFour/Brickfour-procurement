import { useMemo, useState, FormEvent } from 'react';
import type { ProjectRequirement, User } from '../types';
import { departmentProjectId, submitRequestForApproval } from '../lib/rfqDispatch';
import { Plus, X, Send, ClipboardList, Loader2, CheckCircle2 } from 'lucide-react';

const CATEGORIES = ['Office Supplies', 'Stationery', 'IT Equipment & Software', 'Furniture', 'Marketing Material', 'Services', 'Others'];
const UNITS = ['Pieces', 'Boxes', 'Packets', 'Sets', 'Reams', 'Licences', 'Months', 'Kg', 'Liters', 'Units'];

/** How a request's progress is shown to the person who raised it */
function progress(pr: ProjectRequirement): { label: string; cls: string; detail?: string } {
  switch (pr.status) {
    case 'Awaiting Admin Approval':
      return { label: 'Waiting for admin approval', cls: 'bg-amber-50 text-amber-800 border-amber-200' };
    case 'Request Rejected':
      return {
        label: 'Rejected',
        cls: 'bg-rose-50 text-rose-800 border-rose-200',
        detail: `${pr.requestApproval?.decidedBy || 'Admin'}: "${pr.requestApproval?.comment || 'No reason given'}"`,
      };
    case 'Awarded':
      return {
        label: 'Ordered',
        cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        detail: pr.purchaseOrder ? `Purchase order ${pr.purchaseOrder.poNumber}` : undefined,
      };
    case 'Closed':
      return { label: 'Delivered', cls: 'bg-slate-100 text-slate-700 border-slate-200' };
    case 'Pending Approval':
      return { label: 'Approved - vendor being finalised', cls: 'bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]' };
    default:
      return {
        label: 'Approved - collecting quotations',
        cls: 'bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]',
        detail: pr.requestApproval?.decidedBy ? `Approved by ${pr.requestApproval.decidedBy}` : undefined,
      };
  }
}

const field =
  'w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#23408e]/30 focus:border-[#23408e]';

export default function DepartmentRequests({
  currentUser,
  prs,
  onCreatePR,
}: {
  currentUser: User;
  prs: ProjectRequirement[];
  onCreatePR: (pr: ProjectRequirement) => void;
}) {
  const department = currentUser.department || 'General';
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // The department's own requests (everyone in the department sees the team's requests)
  const mine = useMemo(
    () =>
      prs
        .filter((p) => p.department === department || p.raisedByUserId === currentUser.id)
        .sort((a, b) => String(b.requestApproval?.requestedAt || b.createdAt).localeCompare(String(a.requestApproval?.requestedAt || a.createdAt))),
    [prs, department, currentUser.id]
  );
  const waiting = mine.filter((p) => p.status === 'Awaiting Admin Approval').length;

  return (
    <div className="space-y-5">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#23408e] text-white flex items-center justify-center">
            <ClipboardList size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{department} Purchase Requests</h1>
            <p className="text-xs text-slate-500">
              Ask the purchase team to buy something for your department. An admin approves each request before quotations are requested from vendors.
            </p>
          </div>
        </div>
        <button
          id="btn-new-department-request"
          onClick={() => setOpen(true)}
          className="px-4 py-2.5 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
        >
          <Plus size={16} /> New Purchase Request
        </button>
      </div>

      {notice && (
        <div role="status" className="flex items-start justify-between gap-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-lg px-4 py-2.5">
          <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} /> {notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="text-emerald-700 cursor-pointer"><X size={15} /></button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Requests ({mine.length})</h2>
          {waiting > 0 && <span className="text-xs text-amber-800">{waiting} waiting for approval</span>}
        </div>
        {mine.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No requests yet. Use "New Purchase Request" to ask for something.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#23408e] text-white text-left text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 font-semibold">Item</th>
                  <th className="px-4 py-3 font-semibold">Request</th>
                  <th className="px-4 py-3 font-semibold text-right">Quantity</th>
                  <th className="px-4 py-3 font-semibold">Required By</th>
                  <th className="px-4 py-3 font-semibold">Raised By</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((pr) => {
                  const p = progress(pr);
                  return (
                    <tr key={pr.id} className="border-b border-slate-100 last:border-0 align-top">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{pr.materialName}</div>
                        <div className="text-xs text-slate-500">{pr.category}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{pr.id}<div className="font-sans text-slate-500">{pr.createdAt}</div></td>
                      <td className="px-4 py-3 text-right text-slate-800">{pr.quantity.toLocaleString('en-IN')} {pr.unit}</td>
                      <td className="px-4 py-3 text-slate-600">{pr.requiredDate}</td>
                      <td className="px-4 py-3 text-slate-600">{pr.raisedByName}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${p.cls}`}>{p.label}</span>
                        {p.detail && <div className="text-xs text-slate-500 mt-1 max-w-xs">{p.detail}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <NewRequestDialog
          currentUser={currentUser}
          department={department}
          onClose={() => setOpen(false)}
          onCreated={async (pr) => {
            onCreatePR(pr);
            await submitRequestForApproval(pr, currentUser);
            setOpen(false);
            setNotice(`Request ${pr.id} sent to the admins for approval. You will get an email when it is approved or rejected.`);
          }}
        />
      )}
    </div>
  );
}

function NewRequestDialog({
  currentUser,
  department,
  onClose,
  onCreated,
}: {
  currentUser: User;
  department: string;
  onClose: () => void;
  onCreated: (pr: ProjectRequirement) => Promise<void>;
}) {
  const inAWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const [item, setItem] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState(UNITS[0]);
  const [rate, setRate] = useState('');
  const [requiredDate, setRequiredDate] = useState(inAWeek);
  const [urgency, setUrgency] = useState<ProjectRequirement['urgency']>('Standard');
  const [specifications, setSpecifications] = useState('');
  const [purpose, setPurpose] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState(`Brickfour office - ${department} department`);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const qty = Number(quantity);
    if (!item.trim()) return setError('Please enter what you need.');
    if (!(qty > 0)) return setError('Please enter a quantity greater than 0.');
    if (!requiredDate) return setError('Please choose the date you need it by.');
    if (!purpose.trim()) return setError('Please say why it is needed, so the admin can approve it.');
    if (rate && !(Number(rate) >= 0)) return setError('Please enter a valid estimated rate, or leave it empty.');
    setBusy(true);
    const now = new Date();
    const pr: ProjectRequirement = {
      id: `PR-${now.getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      token: `TOK-${Math.floor(100000 + Math.random() * 900000)}`,
      projectId: departmentProjectId(department),
      projectName: `${department} Department`,
      department,
      materialName: item.trim().toUpperCase(),
      materialCode: '000',
      materialGroup: 'Department Purchases',
      category,
      quantity: qty,
      unit,
      requiredDate,
      ...(rate ? { targetBudgetRate: Number(rate) } : {}),
      urgency,
      specifications: specifications.trim() || item.trim(),
      purpose: purpose.trim(),
      deliveryAddress: deliveryAddress.trim() || `Brickfour office - ${department} department`,
      status: 'Awaiting Admin Approval',
      raisedByUserId: currentUser.id,
      raisedByName: currentUser.name,
      createdAt: now.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }),
      invitedVendorIds: [],
      requestApproval: {
        status: 'Pending',
        requestedBy: currentUser.name,
        requestedById: currentUser.id,
        requestedByRole: currentUser.role,
        department,
        requestedAt: now.toISOString(),
      },
    };
    try {
      await onCreated(pr);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <form noValidate onSubmit={submit} role="dialog" aria-label="New purchase request" className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">New purchase request</h3>
            <p className="text-xs text-slate-500 mt-0.5">{department} department • goes to the admins for approval</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            What do you need? *
            <input id="req-item" value={item} onChange={(e) => setItem(e.target.value)} maxLength={120} placeholder="e.g. A4 printer paper, laptop, office chairs" className={`${field} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-slate-700">
              Category
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${field} mt-1`}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Urgency
              <select value={urgency} onChange={(e) => setUrgency(e.target.value as ProjectRequirement['urgency'])} className={`${field} mt-1`}>
                <option>Standard</option>
                <option>High</option>
                <option>Immediate</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Quantity *
              <input id="req-qty" type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={`${field} mt-1`} />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Unit
              <select value={unit} onChange={(e) => setUnit(e.target.value)} className={`${field} mt-1`}>
                {UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Needed by *
              <input type="date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} className={`${field} mt-1`} />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Estimated rate (Rs. / unit)
              <input type="number" min="0" step="any" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Optional" className={`${field} mt-1`} />
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Why is it needed? *
            <textarea id="req-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={500} rows={2} placeholder="e.g. Two new joiners in the sales team need laptops" className={`${field} mt-1`} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Specifications / brand / model
            <textarea value={specifications} onChange={(e) => setSpecifications(e.target.value)} maxLength={1000} rows={2} placeholder="Optional: size, brand, model, colour..." className={`${field} mt-1`} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Deliver to
            <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} maxLength={200} className={`${field} mt-1`} />
          </label>
          {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-200 cursor-pointer">Cancel</button>
          <button type="submit" disabled={busy} className="px-5 py-2 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold disabled:opacity-60 cursor-pointer inline-flex items-center gap-2">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send for Approval
          </button>
        </div>
      </form>
    </div>
  );
}
