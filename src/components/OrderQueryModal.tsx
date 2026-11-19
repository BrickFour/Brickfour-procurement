import React, { useState, useEffect } from 'react';
import { Material, Project, User, Vendor, MarketPriceBenchmark, ProjectRequirement } from '../types';
import { resolveMaterialCode, resolveMaterialGroup } from '../lib/materialCodes';
import { getVendorsForMaterialCode, getMarketBenchmark, EVALUATION_CRITERIA_TEXT } from '../lib/vendorComparison';
import { sendEmailNotification } from '../services/emailService';
import { withVendorQuoteTokens, buildVendorQuoteUrl } from '../lib/vendorQuoteLinks';
import {
  X,
  ShoppingCart,
  Send,
  Building2,
  Calendar,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Minus,
  CheckCircle2,
  Users,
  Mail,
  Clock,
  CreditCard,
  FileText,
  Sparkles,
  ShieldCheck,
  Check,
  ExternalLink,
  Link2,
  RotateCw,
  Globe,
} from 'lucide-react';

interface OrderQueryModalProps {
  isOpen: boolean;
  onClose: () => void;
  material?: Material | null;
  materials: Material[];
  projects: Project[];
  currentUser: User;
  vendors: Vendor[];
  marketBenchmarks: MarketPriceBenchmark[];
  onCreatePR: (pr: ProjectRequirement) => void;
}

export default function OrderQueryModal({
  isOpen,
  onClose,
  material,
  materials,
  projects,
  currentUser,
  vendors,
  marketBenchmarks,
  onCreatePR,
}: OrderQueryModalProps) {
  // Selected project
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    material?.projectId || projects[0]?.id || ''
  );

  // Selected material
  const [selectedMatId, setSelectedMatId] = useState<string>(material?.id || '');

  // Active material object
  const activeMaterial = materials.find((m) => m.id === selectedMatId) || material;

  // Material Code & Group
  const matCode = activeMaterial ? resolveMaterialCode(activeMaterial) : '001';
  const matGroup = activeMaterial ? resolveMaterialGroup(matCode, activeMaterial) : 'General Materials';

  // Market Benchmark
  const marketBenchmark = getMarketBenchmark(matCode, marketBenchmarks);

  // Eligible vendors mapped to this material code
  const eligibleVendors = getVendorsForMaterialCode(matCode, vendors);

  // Form states
  const [quantity, setQuantity] = useState<number | ''>(() => {
    if (activeMaterial) {
      const deficit = Math.max(activeMaterial.minThreshold * 2 - activeMaterial.currentStock, activeMaterial.minThreshold);
      return deficit > 0 ? deficit : 100;
    }
    return 100;
  });

  const [unit, setUnit] = useState<string>(activeMaterial?.unit || 'Bags');
  const [targetBudgetRate, setTargetBudgetRate] = useState<number | ''>(
    activeMaterial?.unitCost || marketBenchmark?.currentMarketPrice || 380
  );

  // Required date defaults to 7 days from now
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 7);
  const [requiredDate, setRequiredDate] = useState<string>(defaultDate.toISOString().split('T')[0]);

  const [urgency, setUrgency] = useState<'Standard' | 'High' | 'Immediate'>('Standard');
  
  // Smart default specifications based on material
  const [specifications, setSpecifications] = useState<string>(() => {
    if (!activeMaterial) return 'Grade conforming to relevant IS codes with manufacturer test certificate.';
    const nameLower = activeMaterial.name.toLowerCase();
    if (nameLower.includes('steel') || nameLower.includes('tmt')) {
      return 'Primary plant manufactured Grade Fe550D Super Ductile TMT bars conforming to IS 1786. Must include mill test certificate (MTC) for each heat/batch.';
    }
    if (nameLower.includes('cement')) {
      return 'Fresh batch 53 Grade Ordinary Portland Cement (OPC) packed within last 30 days. Moisture-proof HDPE packaging with batch test certificate.';
    }
    if (nameLower.includes('sand') || nameLower.includes('aggregate')) {
      return 'Triple-washed river sand / coarse aggregate, silt content < 3%, free from organic impurities conforming to IS 383.';
    }
    return `Premium quality ${activeMaterial.name} conforming to project structural specifications with certified warranty.`;
  });

  const activeProject = projects.find((p) => p.id === selectedProjectId);
  const [deliveryAddress, setDeliveryAddress] = useState<string>(activeProject?.location || '');
  const [specialInstructions, setSpecialInstructions] = useState<string>('Unloading facility and forklift available on site during day shifts.');

  // Shown to vendors on the quotation page / RFQ PDF
  const [receivingHours, setReceivingHours] = useState<string>('08:00-19:00, Mon-Sat');
  const [unloadingConstraints, setUnloadingConstraints] = useState<string>('');
  const [quoteDeadline, setQuoteDeadline] = useState<string>(() => {
    // Default: 3 days from now at 18:00 (local time), in <input type="datetime-local"> format
    const d = new Date();
    d.setDate(d.getDate() + 3);
    d.setHours(18, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T18:00`;
  });

  // Selected vendor IDs for enquiry dispatch
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Online Real-time Market Benchmark fetched via Gemini Google Search
  const [onlineBenchmark, setOnlineBenchmark] = useState<MarketPriceBenchmark | null>(null);
  const [isLoadingOnline, setIsLoadingOnline] = useState<boolean>(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const clientBenchmarkCacheRef = React.useRef<Record<string, MarketPriceBenchmark>>({});

  const fetchOnlineMarketBenchmark = async (force?: boolean) => {
    if (!activeMaterial) return;

    // Use client-side cached benchmark if available unless explicitly refreshed
    if (!force && clientBenchmarkCacheRef.current[activeMaterial.id]) {
      setOnlineBenchmark(clientBenchmarkCacheRef.current[activeMaterial.id]);
      return;
    }

    setIsLoadingOnline(true);
    setOnlineError(null);
    try {
      const res = await fetch('/api/market-benchmark-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materialName: activeMaterial.name,
          unit: unit || activeMaterial.unit,
          materialCode: matCode,
          category: activeMaterial.category,
          lastBuyPrice: activeMaterial.unitCost,
          location: activeProject?.location || 'India',
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.success && data.benchmark) {
        clientBenchmarkCacheRef.current[activeMaterial.id] = data.benchmark;
        setOnlineBenchmark(data.benchmark);
        // If targetBudgetRate has not been manually customized, set it to online rate
        if (!targetBudgetRate || targetBudgetRate === activeMaterial.unitCost || force) {
          setTargetBudgetRate(data.benchmark.currentMarketPrice);
        }
      }
    } catch {
      setOnlineError('Live online index paused.');
    } finally {
      setIsLoadingOnline(false);
    }
  };

  // Automatically fetch online market value via Gemini whenever modal opens or material selection changes
  useEffect(() => {
    if (isOpen && activeMaterial) {
      fetchOnlineMarketBenchmark();
    }
  }, [isOpen, selectedMatId, selectedProjectId]);

  // Sync state when incoming material changes
  useEffect(() => {
    if (material) {
      setSelectedProjectId(material.projectId);
      setSelectedMatId(material.id);
      setUnit(material.unit);
      const deficit = Math.max(material.minThreshold * 2 - material.currentStock, material.minThreshold);
      setQuantity(deficit > 0 ? deficit : 100);
      const mkt = getMarketBenchmark(resolveMaterialCode(material), marketBenchmarks);
      setTargetBudgetRate(material.unitCost || mkt?.currentMarketPrice || 380);
    }
  }, [material, marketBenchmarks]);

  // Keep the selected material in step with the dropdown: when the form is opened without a material
  // (or the project changes), select the first material of the chosen site instead of leaving it blank.
  useEffect(() => {
    if (!isOpen) return;
    const inProject = materials.filter((m) => !selectedProjectId || m.projectId === selectedProjectId);
    if (inProject.length && !inProject.some((m) => m.id === selectedMatId)) {
      const first = inProject[0];
      setSelectedMatId(first.id);
      setUnit(first.unit);
      const deficit = Math.max(first.minThreshold * 2 - first.currentStock, first.minThreshold);
      setQuantity(deficit > 0 ? deficit : 100);
      const mkt = getMarketBenchmark(resolveMaterialCode(first), marketBenchmarks);
      setTargetBudgetRate(first.unitCost || mkt?.currentMarketPrice || 380);
    }
  }, [isOpen, selectedProjectId, materials]);

  // Update delivery address when project changes
  useEffect(() => {
    const proj = projects.find((p) => p.id === selectedProjectId);
    if (proj) {
      setDeliveryAddress(`${proj.name}, ${proj.location}`);
    }
  }, [selectedProjectId, projects]);

  // Auto-select all eligible vendors initially
  useEffect(() => {
    if (eligibleVendors.length > 0) {
      setSelectedVendorIds(eligibleVendors.map((v) => v.id));
    }
  }, [matCode, vendors]);

  const toggleVendorSelection = (vendorId: string) => {
    setSelectedVendorIds((prev) =>
      prev.includes(vendorId) ? prev.filter((id) => id !== vendorId) : [...prev, vendorId]
    );
  };

  const handleSelectAllVendors = () => {
    if (selectedVendorIds.length === eligibleVendors.length) {
      setSelectedVendorIds([]);
    } else {
      setSelectedVendorIds(eligibleVendors.map((v) => v.id));
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quantity || quantity <= 0) return;
    if (selectedVendorIds.length === 0) {
      alert('Please select at least one vendor to send the enquiry to.');
      return;
    }

    setIsSending(true);

    const prNumber = `PR-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const prToken = `TOK-${Math.floor(100000 + Math.random() * 900000)}`;

    const draftPR: ProjectRequirement = {
      id: prNumber,
      token: prToken,
      projectId: selectedProjectId,
      projectName: activeProject?.name || 'Project Site',
      materialId: activeMaterial?.id,
      materialName: activeMaterial?.name || 'Construction Resource',
      materialCode: matCode,
      materialGroup: matGroup,
      category: activeMaterial?.category || 'Structural',
      quantity: Number(quantity),
      unit: unit || 'Units',
      requiredDate,
      targetBudgetRate: targetBudgetRate ? Number(targetBudgetRate) : undefined,
      urgency,
      specifications,
      deliveryAddress,
      specialInstructions,
      ...(receivingHours.trim() ? { receivingHours: receivingHours.trim() } : {}),
      ...(unloadingConstraints.trim() ? { unloadingConstraints: unloadingConstraints.trim() } : {}),
      ...(quoteDeadline && !Number.isNaN(Date.parse(quoteDeadline)) ? { quoteDeadline: new Date(quoteDeadline).toISOString() } : {}),
      status: 'Enquiry Sent',
      raisedByUserId: currentUser.id,
      raisedByName: currentUser.name,
      createdAt: new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      invitedVendorIds: selectedVendorIds,
      enquiryDispatchedAt: new Date().toLocaleString(),
    };
    // Every invited vendor gets a unique secret link to submit their quotation directly into the system
    const newPR = withVendorQuoteTokens(draftPR, selectedVendorIds);

    // Automated Email Dispatch (PRD 3.4)
    // Send the RFQ email to each chosen vendor at that vendor's own registered email address
    const invitedVendors = vendors.filter((v) => selectedVendorIds.includes(v.id));

    // Each vendor's personal quotation link
    const quoteUrlFor = (vendorId: string) => buildVendorQuoteUrl(newPR.id, vendorId, newPR.vendorQuoteTokens![vendorId]);

    const emailSubject = `[RFQ Enquiry ${prToken}] Formal Material Requirement: ${newPR.materialName} (Code #${matCode}) - ${newPR.projectName}`;
    const buildEmailBody = (vendorName: string, portalUrl: string) => `
Dear ${vendorName} Team,

We are pleased to issue this formal Request for Quotation (RFQ) for our upcoming project requirement:

==================================================
PROJECT REQUIREMENT (PR) SPECIFICATIONS & DETAILS
==================================================
• PR Number: ${newPR.id}
• RFQ Token ID: ${prToken}
• Project Site: ${newPR.projectName}
• Delivery Location & Unloading Gate: ${newPR.deliveryAddress}
• Standard Material Code: #${matCode} (${newPR.materialGroup})
• Material Description: ${newPR.materialName}
• Material Category: ${newPR.category}
• Required Quantity: ${newPR.quantity} ${newPR.unit}
• Target Required Delivery Date: ${newPR.requiredDate}
• Procurement Urgency Level: ${newPR.urgency}
• Target Budget Guideline: Rs. ${newPR.targetBudgetRate ? newPR.targetBudgetRate.toLocaleString('en-IN') : 'Competitive'} per ${newPR.unit}

--------------------------------------------------
TECHNICAL & QUALITY SPECIFICATIONS:
--------------------------------------------------
"${newPR.specifications}"

--------------------------------------------------
SPECIAL SITE INSTRUCTIONS & OFFLOADING:
--------------------------------------------------
"${newPR.specialInstructions || 'Direct offloading at site yard with manufacturer test certificate (MTC).'}"

==================================================
SUBMIT YOUR COMMERCIAL QUOTATION
==================================================
Please open your secure quotation link below to submit your commercial quotation (Unit Rate, Delivery Lead Days, Credit Period, Freight & Tax terms). You can reopen the same link to revise your quote until the enquiry is awarded:

${portalUrl}

This link is unique to your company. Please do not forward it.

Evaluation Criteria:
Quotes will be compared and ranked based on:
1. Quoted Unit Rates (40% Weightage)
2. Delivery Timeline (20% Weightage)
3. Quality Certification & IS Conformance (20% Weightage)
4. Credit Period (45d / 30d / 15d) (20% Weightage)

Issued by:
${currentUser.name} (${currentUser.title || 'Site Manager'})
PRAVAH Construction Inventory & Procurement Platform
Contact Email: ganeshnagargoje1008@gmail.com
    `;

    // Structured RFQ email (rendered by the server's standard email layout; the link is a button, not shown as text)
    const buildRfqEmail = (vendorName: string, portalUrl: string) => ({
      heading: `Request for Quotation: ${newPR.materialName}`,
      preheader: `${newPR.id} - ${newPR.quantity} ${newPR.unit} required by ${newPR.requiredDate} for ${newPR.projectName}`,
      greeting: `Dear ${vendorName} Team,`,
      paragraphs: [
        'We invite you to submit your quotation for the project requirement below. Please review the details and submit your rates, delivery timeline and commercial terms using the button below.',
      ],
      details: [
        { label: 'PR Number', value: newPR.id },
        { label: 'RFQ Reference', value: prToken },
        { label: 'Project Site', value: newPR.projectName },
        { label: 'Delivery Address', value: newPR.deliveryAddress },
        { label: 'Material', value: newPR.materialName },
        { label: 'Material Code', value: `#${matCode}${newPR.materialGroup ? ` (${newPR.materialGroup})` : ''}` },
        { label: 'Category', value: newPR.category },
        { label: 'Required Quantity', value: `${newPR.quantity} ${newPR.unit}` },
        { label: 'Required By', value: newPR.requiredDate },
        ...(newPR.receivingHours ? [{ label: 'Receiving Hours', value: newPR.receivingHours }] : []),
        ...(newPR.unloadingConstraints ? [{ label: 'Unloading Constraints', value: newPR.unloadingConstraints }] : []),
        {
          label: 'Quotation Deadline',
          value: newPR.quoteDeadline
            ? new Date(newPR.quoteDeadline).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
            : 'At the earliest',
        },
        { label: 'Urgency', value: newPR.urgency },
        {
          label: 'Target Budget',
          value: newPR.targetBudgetRate
            ? `Rs. ${newPR.targetBudgetRate.toLocaleString('en-IN')} per ${newPR.unit}`
            : 'Competitive',
        },
      ],
      sections: [
        { title: 'Technical & Quality Specifications', text: newPR.specifications },
        {
          title: 'Site Instructions',
          text: newPR.specialInstructions || 'Direct offloading at site yard with manufacturer test certificate (MTC).',
        },
        {
          title: 'Evaluation Criteria',
          text: `Quotations are ranked on: ${EVALUATION_CRITERIA_TEXT.replace(/ • /g, ', ')}.`,
        },
        {
          title: 'How to Submit',
          text: 'Use the button below to open your secure supplier page. You can type or paste your quotation, or upload it as a PDF, Word document, image or Excel file, and then confirm the 10 key figures (unit rate, quantity, GST, freight, loading, total price, delivery, validity, payment terms and warranty).',
        },
      ],
      cta: {
        label: 'Submit Quotation',
        url: portalUrl,
        note: 'This link is unique to your company. You can use it again to revise your quotation until the enquiry is awarded. Please do not forward this email.',
      },
      closing: [
        'Regards,',
        currentUser.name,
        currentUser.title || 'Procurement Team',
        'For questions, contact ganeshnagargoje1008@gmail.com',
      ],
    });

    // Save the PR (with vendor tokens) first so the links work as soon as the emails arrive
    onCreatePR(newPR);

    // Dispatch a personal email (with that vendor's own quotation link) to every invited vendor.
    // Sent one after another to stay within the email provider's rate limit.
    const results: { vendor: Vendor; ok: boolean; error: string }[] = [];
    for (const vendor of invitedVendors) {
      const email = (vendor.email || '').trim();
      if (!email) {
        results.push({ vendor, ok: false, error: 'no email address on file' });
        continue;
      }
      try {
        const res = await sendEmailNotification({
          to: email,
          subject: emailSubject,
          body: buildEmailBody(vendor.name, quoteUrlFor(vendor.id)),
          fromName: `${currentUser.name} (PRAVAH Procurement)`,
          type: 'Vendor RFQ Enquiry',
          email: buildRfqEmail(vendor.name, quoteUrlFor(vendor.id)),
        });
        results.push({ vendor, ok: Boolean(res?.success), error: res?.error ? String(res.error) : '' });
      } catch (err: any) {
        results.push({ vendor, ok: false, error: err?.message || 'network error' });
      }
    }

    const sent = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    // In-app notification for the team (best effort)
    fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'rfq-sent',
        prId: prNumber,
        projectId: newPR.projectId,
        title: `RFQ sent: ${newPR.materialName}`,
        message: `${prNumber} (${newPR.quantity} ${newPR.unit}) emailed to ${sent.length} of ${results.length} vendor(s) by ${currentUser.name}.`,
      }),
    }).catch(() => undefined);

    setIsSending(false);
    setSuccessToast(
      failed.length === 0
        ? `Enquiry ${prNumber} created & quotation links emailed to ${sent.length} vendor(s)!`
        : `Enquiry ${prNumber} created. Emailed ${sent.length} of ${results.length} vendor(s).`
    );

    if (failed.length > 0) {
      alert(
        `RFQ email could not be sent to ${failed.length} vendor(s):\n\n` +
          failed.map((r) => `• ${r.vendor.name} (${r.vendor.email || 'no email'}): ${r.error}`).join('\n') +
          `\n\nThe PR was created. You can share each vendor's quote link from "Add Vendor Quote" instead.`
      );
    }

    setTimeout(() => {
      setSuccessToast(null);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 bg-[#23408e] text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/15 text-white flex items-center justify-center shrink-0">
              <ShoppingCart size={20} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white">
                  Raise Project Requirement (PR) & Order Query
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-white/15 text-white text-[11px] font-semibold border border-white/20">
                  RFQ Workflow
                </span>
              </div>
              <p className="text-xs text-blue-100">
                Identify material code, map eligible vendors, check market prices, and dispatch quotation enquiries.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 text-blue-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-slate-50 scrollbar-thin">
          {successToast && (
            <div role="status" className="px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2.5 text-emerald-900 text-sm animate-in fade-in">
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              <span>{successToast}</span>
            </div>
          )}

          {/* SECTION 1: Material Identification & Project Site */}
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <FileText size={14} className="text-[#23408e]" /> 1. Material Identification & Site Mapping
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold font-mono bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]">
                Material Code: #{matCode}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Site / Project Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                  <Building2 size={13} className="text-slate-400" /> Target Project Site *
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-hidden focus:border-[#23408e] focus:ring-2 focus:ring-[#23408e]/20"
                  required
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.location})
                    </option>
                  ))}
                </select>
              </div>

              {/* Material Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                  <Sparkles size={13} className="text-[#23408e]" /> Select Construction Resource *
                </label>
                <select
                  value={selectedMatId}
                  onChange={(e) => {
                    setSelectedMatId(e.target.value);
                    const mat = materials.find((m) => m.id === e.target.value);
                    if (mat) {
                      setUnit(mat.unit);
                      const deficit = Math.max(mat.minThreshold * 2 - mat.currentStock, mat.minThreshold);
                      setQuantity(deficit > 0 ? deficit : 100);
                      const mkt = getMarketBenchmark(resolveMaterialCode(mat), marketBenchmarks);
                      setTargetBudgetRate(mat.unitCost || mkt?.currentMarketPrice || 380);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-hidden focus:border-[#23408e] focus:ring-2 focus:ring-[#23408e]/20"
                  required
                >
                  {materials
                    .filter((m) => !selectedProjectId || m.projectId === selectedProjectId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        #{resolveMaterialCode(m)} - {m.name} ({m.category})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Live Inventory Snapshot Card */}
            {activeMaterial && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 min-w-0">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Current Stock</span>
                  <p className="text-sm font-semibold text-slate-900">
                    {activeMaterial.currentStock} {activeMaterial.unit}
                  </p>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 min-w-0">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">2x Safe Level</span>
                  <p className="text-sm font-semibold text-slate-900">
                    {activeMaterial.minThreshold * 2} {activeMaterial.unit}
                  </p>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 min-w-0">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Last Recorded Cost</span>
                  <p className="text-sm font-semibold text-slate-900">
                    Rs. {activeMaterial.unitCost.toLocaleString('en-IN')} / {activeMaterial.unit}
                  </p>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 min-w-0">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Material Group</span>
                  <p className="text-sm font-semibold text-[#23408e] truncate" title={matGroup}>
                    {matGroup}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: Requirement Parameters & Market Benchmark */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5 border-b border-slate-100 pb-2.5">
                <Calendar size={14} className="text-[#23408e]" /> 2. Quantity & Delivery Timelines
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Required Quantity */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Required Quantity *
                  </label>
                  <div className="flex">
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-l-lg text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-[#23408e] focus:ring-2 focus:ring-[#23408e]/20"
                      required
                    />
                    <span className="px-3 py-2 bg-slate-100 text-slate-600 text-xs font-semibold rounded-r-lg border-y border-r border-slate-300 whitespace-nowrap">
                      {unit}
                    </span>
                  </div>
                </div>

                {/* Target Budget Rate */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Target Rate (Rs./unit)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={targetBudgetRate}
                    onChange={(e) => setTargetBudgetRate(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:border-[#23408e] focus:ring-2 focus:ring-[#23408e]/20"
                    placeholder="e.g. 385"
                  />
                </div>

                {/* Target Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Required Delivery Date *
                  </label>
                  <input
                    type="date"
                    value={requiredDate}
                    onChange={(e) => setRequiredDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:border-[#23408e] focus:ring-2 focus:ring-[#23408e]/20"
                    required
                  />
                </div>
              </div>

              {/* Urgency */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Procurement Urgency Level
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Standard', 'High', 'Immediate'] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUrgency(u)}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer border transition-colors ${
                        urgency === u
                          ? u === 'Immediate'
                            ? 'bg-rose-600 text-white border-rose-600'
                            : u === 'High'
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-[#23408e] text-white border-[#23408e]'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              {/* Technical Specifications */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Required Technical Grade & Quality Specifications
                </label>
                <textarea
                  rows={2}
                  value={specifications}
                  onChange={(e) => setSpecifications(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-hidden focus:border-[#23408e] focus:ring-2 focus:ring-[#23408e]/20 resize-y"
                  placeholder="Specify IS grade, packaging requirements, test certificate conditions..."
                  required
                />
              </div>

              {/* Delivery Address */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Site Delivery Address & Gates
                </label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-hidden focus:border-[#23408e] focus:ring-2 focus:ring-[#23408e]/20"
                  required
                />
              </div>

              {/* Receiving hours, unloading constraints & quotation deadline (shown to vendors) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="pr-receiving-hours" className="block text-xs font-semibold text-slate-600 mb-1">
                    Receiving Hours
                  </label>
                  <input
                    id="pr-receiving-hours"
                    type="text"
                    value={receivingHours}
                    onChange={(e) => setReceivingHours(e.target.value)}
                    placeholder="e.g. 08:00-19:00, Mon-Sat"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-hidden focus:border-[#23408e] focus:ring-2 focus:ring-[#23408e]/20"
                  />
                </div>
                <div>
                  <label htmlFor="pr-unloading" className="block text-xs font-semibold text-slate-600 mb-1">
                    Unloading Constraints
                  </label>
                  <input
                    id="pr-unloading"
                    type="text"
                    value={unloadingConstraints}
                    onChange={(e) => setUnloadingConstraints(e.target.value)}
                    placeholder="e.g. Max 10-wheeler; no entry 22:00-06:00"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-hidden focus:border-[#23408e] focus:ring-2 focus:ring-[#23408e]/20"
                  />
                </div>
                <div>
                  <label htmlFor="pr-quote-deadline" className="block text-xs font-semibold text-slate-600 mb-1">
                    Quotation Deadline *
                  </label>
                  <input
                    id="pr-quote-deadline"
                    type="datetime-local"
                    value={quoteDeadline}
                    onChange={(e) => setQuoteDeadline(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-hidden focus:border-[#23408e] focus:ring-2 focus:ring-[#23408e]/20"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Market Benchmark Card (Online Live Fetch with Gemini Google Search) */}
            {(() => {
              const displayBenchmark: MarketPriceBenchmark | undefined = onlineBenchmark || marketBenchmark;
              const lastBuyCost = activeMaterial?.unitCost || 0;
              const currentMarketPrice = displayBenchmark?.currentMarketPrice || 0;
              let percentVsLastBuy = displayBenchmark?.percentVsLastBuy;
              if (percentVsLastBuy === undefined && lastBuyCost > 0 && currentMarketPrice > 0) {
                percentVsLastBuy = Number((((currentMarketPrice - lastBuyCost) / lastBuyCost) * 100).toFixed(1));
              }

              return (
                <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <TrendingUp size={15} className="text-[#23408e]" /> Market Benchmark
                      </span>

                      {isLoadingOnline ? (
                        <span className="text-[11px] font-semibold px-2 py-0.5 bg-[#eaf0fb] text-[#23408e] border border-[#c9d6f2] rounded-full flex items-center gap-1">
                          <RotateCw size={11} className="animate-spin" /> Searching Online...
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fetchOnlineMarketBenchmark(true)}
                          title="Click to search latest live market price online via Gemini"
                          className="text-[11px] font-semibold px-2 py-0.5 bg-white hover:bg-[#f5f8fd] text-[#23408e] border border-[#c9d6f2] rounded-full flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Globe size={11} /> Refresh price
                        </button>
                      )}
                    </div>

                    {displayBenchmark ? (
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                              National Market Price
                            </span>
                            {displayBenchmark.fetchedAt && (
                              <span className="text-[9px] font-semibold text-slate-500">
                                Checked {displayBenchmark.fetchedAt}
                              </span>
                            )}
                          </div>

                          <p className="text-2xl font-bold text-slate-900">
                            Rs. {displayBenchmark.currentMarketPrice.toLocaleString('en-IN')}{' '}
                            <span className="text-xs font-bold text-slate-600">/ {displayBenchmark.unit}</span>
                          </p>

                          {/* How much percent high or low compared to last buy */}
                          {lastBuyCost > 0 ? (
                            <div className="mt-1.5">
                              {percentVsLastBuy !== undefined && percentVsLastBuy > 0 ? (
                                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-medium">
                                  <TrendingUp size={13} className="text-amber-800 shrink-0" />
                                  <span>
                                    <strong className="font-semibold">+{percentVsLastBuy}% higher</strong> than last buy (Rs. {lastBuyCost.toLocaleString('en-IN')})
                                  </span>
                                </div>
                              ) : percentVsLastBuy !== undefined && percentVsLastBuy < 0 ? (
                                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200 text-[11px] font-medium">
                                  <TrendingDown size={13} className="text-emerald-800 shrink-0" />
                                  <span>
                                    <strong className="font-semibold">{Math.abs(percentVsLastBuy)}% lower</strong> than last buy (Rs. {lastBuyCost.toLocaleString('en-IN')})
                                  </span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold">
                                  <Minus size={12} className="text-slate-500 shrink-0" />
                                  <span>Matches last recorded buy (Rs. {lastBuyCost.toLocaleString('en-IN')})</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold text-slate-700">
                              <span className="text-slate-500">Initial purchase baseline</span>
                            </div>
                          )}
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px] space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">Market Range:</span>
                            <span className="font-extrabold text-slate-800">
                              Rs. {displayBenchmark.minMarketPrice.toLocaleString('en-IN')} - {displayBenchmark.maxMarketPrice.toLocaleString('en-IN')}
                            </span>
                          </div>

                          <div className="flex justify-between items-center gap-2">
                            <span className="text-slate-500 shrink-0">Benchmark Source:</span>
                            {displayBenchmark.sourceUrl ? (
                              <a
                                href={displayBenchmark.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-[#23408e] hover:underline inline-flex items-center gap-1 truncate max-w-[170px]"
                                title={`Open source: ${displayBenchmark.source}`}
                              >
                                <span className="truncate">{displayBenchmark.source}</span>
                                <ExternalLink size={10} className="shrink-0" />
                              </a>
                            ) : (
                              <span className="font-bold text-slate-800 truncate max-w-[150px]" title={displayBenchmark.source}>
                                {displayBenchmark.source}
                              </span>
                            )}
                          </div>

                          {/* Direct Attached Source Link */}
                          {displayBenchmark.sourceUrl && (
                            <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between text-[11px] gap-2">
                              <span className="text-slate-600 font-bold shrink-0 flex items-center gap-1">
                                <Link2 size={11} className="text-[#23408e]" /> Source Link:
                              </span>
                              <a
                                href={displayBenchmark.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#23408e] hover:underline font-semibold inline-flex items-center gap-1 underline truncate max-w-[190px]"
                                title={displayBenchmark.sourceUrl}
                              >
                                <span className="truncate">
                                  {displayBenchmark.sourceUrl.replace(/^https?:\/\/(?:www\.)?/, '')}
                                </span>
                                <ExternalLink size={10} className="shrink-0" />
                              </a>
                            </div>
                          )}

                          {/* Additional Grounding Sources */}
                          {displayBenchmark.sources && displayBenchmark.sources.length > 1 && (
                            <div className="pt-1 border-t border-slate-200 flex flex-wrap items-center gap-1 text-[10px]">
                              <span className="text-slate-400 font-bold">Related:</span>
                              {displayBenchmark.sources.slice(1, 3).map((s, idx) => (
                                <a
                                  key={idx}
                                  href={s.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-1.5 py-0.5 rounded bg-white hover:bg-blue-50 border border-slate-200 text-slate-700 hover:text-blue-700 font-semibold inline-flex items-center gap-0.5 truncate max-w-[110px]"
                                  title={s.title}
                                >
                                  <span className="truncate">{s.title}</span>
                                  <ExternalLink size={8} />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-600">
                        Market benchmark data is being synthesized for Material Code #{matCode}.
                      </div>
                    )}
                  </div>

                  <div className="bg-[#f5f8fd] p-2.5 rounded-lg border border-[#d9e3f5] text-[11px] text-slate-700">
                    <span className="font-semibold text-slate-900 flex items-center gap-1">
                      <ShieldCheck size={13} className="text-[#23408e]" /> Evaluation Target:
                    </span>
                    Target quotes with 45-day credit and delivery within 3 days for maximum composite ranking.
                  </div>
                </div>
              );
            })()}
          </div>

          {/* SECTION 3: Vendor Mapping & Selection (PRD 3.3 & 3.4) */}
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Users size={14} className="text-[#23408e]" /> 3. Approved Vendors for Material Code #{matCode} ({eligibleVendors.length} Eligible)
                </span>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select which vendors will receive the automated RFQ enquiry email and quote submission link.
                </p>
              </div>

              {eligibleVendors.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllVendors}
                  className="px-2.5 py-1 text-xs font-semibold text-[#23408e] hover:bg-[#f5f8fd] rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  {selectedVendorIds.length === eligibleVendors.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            {eligibleVendors.length === 0 ? (
              <div className="bg-slate-50 p-6 rounded-lg border border-dashed border-slate-300 text-center text-sm text-slate-500">
                No vendors currently mapped to Material Code #{matCode}. You can still register the PR and invite vendors manually.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {eligibleVendors.map((vendor) => {
                  const isChecked = selectedVendorIds.includes(vendor.id);
                  return (
                    <div
                      key={vendor.id}
                      onClick={() => toggleVendorSelection(vendor.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 select-none ${
                        isChecked
                          ? 'bg-[#f5f8fd] border-[#23408e] ring-1 ring-[#23408e]/20'
                          : 'bg-white border-slate-200 hover:border-[#c9d6f2]'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center mt-0.5 shrink-0 transition-colors ${
                          isChecked ? 'bg-[#23408e] text-white' : 'border border-slate-300 bg-white'
                        }`}
                      >
                        {isChecked && <Check size={13} strokeWidth={3} />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-sm font-semibold text-slate-900 truncate" title={vendor.name}>
                            {vendor.name}
                          </h4>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded-full text-amber-800 shrink-0">
                            ★ {vendor.rating.toFixed(1)}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {vendor.contactPerson} • {vendor.email}
                        </p>

                        <div className="flex items-center gap-1.5 mt-2 text-[10px] font-semibold text-slate-600 flex-wrap">
                          <span className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded-full border border-slate-200">
                            <CreditCard size={10} className="text-[#23408e]" /> {vendor.standardCreditPeriod}
                          </span>
                          <span className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded-full border border-slate-200">
                            <Clock size={10} className="text-slate-500" /> {vendor.avgLeadDays}d Lead
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <div className="text-sm text-slate-600">
              <strong className="text-slate-900 font-semibold">{selectedVendorIds.length}</strong> vendor{selectedVendorIds.length === 1 ? '' : 's'} selected to receive the RFQ email and quote link.
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-sm rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSending || selectedVendorIds.length === 0}
                className="flex-1 sm:flex-none px-5 py-2.5 bg-[#23408e] hover:bg-[#1b3170] text-white font-semibold text-sm rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSending ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Dispatching RFQs...
                  </>
                ) : (
                  <>
                    <Send size={14} /> Dispatch RFQ & Create PR
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
