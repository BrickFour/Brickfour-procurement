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
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-linear-to-r from-amber-500/10 via-amber-50 to-orange-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-xs">
              <ShoppingCart size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900">
                  Raise Project Requirement (PR) & Order Query
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-black tracking-wider uppercase border border-amber-300">
                  RFQ Workflow
                </span>
              </div>
              <p className="text-xs text-slate-600 font-medium">
                Identify material code, map eligible vendors, check market prices, and dispatch quotation enquiries.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
          {successToast && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center gap-2.5 text-emerald-950 text-xs font-bold animate-in fade-in">
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              <span>{successToast}</span>
            </div>
          )}

          {/* SECTION 1: Material Identification & Project Site */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileText size={14} className="text-amber-500" /> 1. Material Identification & Site Mapping
              </span>
              <span className="text-[11px] font-extrabold px-2 py-0.5 bg-slate-900 text-amber-400 rounded-md">
                Material Code: #{matCode}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Site / Project Selection */}
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1.5 flex items-center gap-1">
                  <Building2 size={13} className="text-slate-400" /> Target Project Site *
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
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
                <label className="block text-xs font-extrabold text-slate-700 mb-1.5 flex items-center gap-1">
                  <Sparkles size={13} className="text-amber-500" /> Select Construction Resource *
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
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
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
                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Current Stock</span>
                  <p className="text-xs sm:text-sm font-black text-slate-900">
                    {activeMaterial.currentStock} {activeMaterial.unit}
                  </p>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">2x Safe Level</span>
                  <p className="text-xs sm:text-sm font-black text-slate-900">
                    {activeMaterial.minThreshold * 2} {activeMaterial.unit}
                  </p>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Last Recorded Cost</span>
                  <p className="text-xs sm:text-sm font-black text-slate-900">
                    Rs. {activeMaterial.unitCost.toLocaleString('en-IN')} / {activeMaterial.unit}
                  </p>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Material Group</span>
                  <p className="text-xs sm:text-sm font-black text-amber-700 truncate" title={matGroup}>
                    {matGroup}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: Requirement Parameters & Market Benchmark */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
                <Calendar size={14} className="text-amber-500" /> 2. Quantity & Delivery Timelines
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Required Quantity */}
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Required Quantity *
                  </label>
                  <div className="flex">
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-l-xl text-xs font-black text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                      required
                    />
                    <span className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-r-xl border-y border-r border-slate-300">
                      {unit}
                    </span>
                  </div>
                </div>

                {/* Target Budget Rate */}
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Target Rate (Rs./unit)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={targetBudgetRate}
                    onChange={(e) => setTargetBudgetRate(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    placeholder="e.g. 385"
                  />
                </div>

                {/* Target Date */}
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Required Delivery Date *
                  </label>
                  <input
                    type="date"
                    value={requiredDate}
                    onChange={(e) => setRequiredDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>
              </div>

              {/* Urgency */}
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                  Procurement Urgency Level
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Standard', 'High', 'Immediate'] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUrgency(u)}
                      className={`px-3 py-2 rounded-xl text-xs font-extrabold cursor-pointer border transition-all ${
                        urgency === u
                          ? u === 'Immediate'
                            ? 'bg-red-600 text-white border-red-700 shadow-xs'
                            : u === 'High'
                            ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs'
                            : 'bg-slate-900 text-white border-slate-950 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              {/* Technical Specifications */}
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  Required Technical Grade & Quality Specifications
                </label>
                <textarea
                  rows={2}
                  value={specifications}
                  onChange={(e) => setSpecifications(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500 resize-y"
                  placeholder="Specify IS grade, packaging requirements, test certificate conditions..."
                  required
                />
              </div>

              {/* Delivery Address */}
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  Site Delivery Address & Gates
                </label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              {/* Receiving hours, unloading constraints & quotation deadline (shown to vendors) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="pr-receiving-hours" className="block text-xs font-extrabold text-slate-700 mb-1">
                    Receiving Hours
                  </label>
                  <input
                    id="pr-receiving-hours"
                    type="text"
                    value={receivingHours}
                    onChange={(e) => setReceivingHours(e.target.value)}
                    placeholder="e.g. 08:00-19:00, Mon-Sat"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label htmlFor="pr-unloading" className="block text-xs font-extrabold text-slate-700 mb-1">
                    Unloading Constraints
                  </label>
                  <input
                    id="pr-unloading"
                    type="text"
                    value={unloadingConstraints}
                    onChange={(e) => setUnloadingConstraints(e.target.value)}
                    placeholder="e.g. Max 10-wheeler; no entry 22:00-06:00"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label htmlFor="pr-quote-deadline" className="block text-xs font-extrabold text-slate-700 mb-1">
                    Quotation Deadline *
                  </label>
                  <input
                    id="pr-quote-deadline"
                    type="datetime-local"
                    value={quoteDeadline}
                    onChange={(e) => setQuoteDeadline(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500"
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
                <div className="bg-linear-to-b from-amber-50 to-orange-50 p-4 rounded-2xl border border-amber-200 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                        <TrendingUp size={14} className="text-amber-700" /> Market Benchmark
                      </span>

                      {isLoadingOnline ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-900 border border-blue-200 rounded-full flex items-center gap-1 animate-pulse shadow-2xs">
                          <RotateCw size={10} className="animate-spin text-blue-700" /> Searching Online...
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fetchOnlineMarketBenchmark(true)}
                          title="Click to search latest live market price online via Gemini"
                          className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-950 border border-emerald-300 rounded-full flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                        >
                          <Globe size={10} className="text-emerald-700" /> Live Search • Refresh
                        </button>
                      )}
                    </div>

                    {displayBenchmark ? (
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-amber-800 uppercase">
                              National Market Price
                            </span>
                            {displayBenchmark.fetchedAt && (
                              <span className="text-[9px] font-semibold text-slate-500">
                                Checked {displayBenchmark.fetchedAt}
                              </span>
                            )}
                          </div>

                          <p className="text-2xl font-black text-slate-950">
                            Rs. {displayBenchmark.currentMarketPrice.toLocaleString('en-IN')}{' '}
                            <span className="text-xs font-bold text-slate-600">/ {displayBenchmark.unit}</span>
                          </p>

                          {/* How much percent high or low compared to last buy */}
                          {lastBuyCost > 0 ? (
                            <div className="mt-1.5">
                              {percentVsLastBuy !== undefined && percentVsLastBuy > 0 ? (
                                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100/90 text-amber-950 border border-amber-300 text-[11px] font-extrabold shadow-2xs">
                                  <TrendingUp size={13} className="text-amber-800 shrink-0" />
                                  <span>
                                    <strong className="text-amber-900 font-black">+{percentVsLastBuy}% higher</strong> than last buy (Rs. {lastBuyCost.toLocaleString('en-IN')})
                                  </span>
                                </div>
                              ) : percentVsLastBuy !== undefined && percentVsLastBuy < 0 ? (
                                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100/90 text-emerald-950 border border-emerald-300 text-[11px] font-extrabold shadow-2xs">
                                  <TrendingDown size={13} className="text-emerald-800 shrink-0" />
                                  <span>
                                    <strong className="text-emerald-900 font-black">{Math.abs(percentVsLastBuy)}% lower</strong> than last buy (Rs. {lastBuyCost.toLocaleString('en-IN')})
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

                        <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200 text-[11px] space-y-1.5">
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
                                className="font-bold text-blue-700 hover:text-blue-900 underline inline-flex items-center gap-1 truncate max-w-[170px]"
                                title={`Open source: ${displayBenchmark.source}`}
                              >
                                <span className="truncate">{displayBenchmark.source}</span>
                                <ExternalLink size={10} className="shrink-0 text-blue-600" />
                              </a>
                            ) : (
                              <span className="font-bold text-slate-800 truncate max-w-[150px]" title={displayBenchmark.source}>
                                {displayBenchmark.source}
                              </span>
                            )}
                          </div>

                          {/* Direct Attached Source Link */}
                          {displayBenchmark.sourceUrl && (
                            <div className="pt-1.5 border-t border-amber-100 flex items-center justify-between text-[11px] gap-2">
                              <span className="text-slate-600 font-bold shrink-0 flex items-center gap-1">
                                <Link2 size={11} className="text-amber-700" /> Source Link:
                              </span>
                              <a
                                href={displayBenchmark.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-700 hover:text-blue-900 font-black inline-flex items-center gap-1 underline truncate max-w-[190px]"
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
                            <div className="pt-1 border-t border-amber-100/70 flex flex-wrap items-center gap-1 text-[10px]">
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

                  <div className="bg-white/90 p-2.5 rounded-xl border border-amber-200 text-[11px] text-amber-950">
                    <span className="font-black flex items-center gap-1">
                      <ShieldCheck size={13} className="text-amber-700" /> Evaluation Target:
                    </span>
                    Target quotes with 45-day credit and delivery within 3 days for maximum composite ranking.
                  </div>
                </div>
              );
            })()}
          </div>

          {/* SECTION 3: Vendor Mapping & Selection (PRD 3.3 & 3.4) */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Users size={14} className="text-amber-500" /> 3. Approved Vendors for Material Code #{matCode} ({eligibleVendors.length} Eligible)
                </span>
                <p className="text-[11px] text-slate-500 font-medium">
                  Select which vendors will receive the automated RFQ enquiry email and quote submission link.
                </p>
              </div>

              {eligibleVendors.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllVendors}
                  className="px-2.5 py-1 text-xs font-extrabold text-amber-700 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer"
                >
                  {selectedVendorIds.length === eligibleVendors.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            {eligibleVendors.length === 0 ? (
              <div className="bg-white p-6 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
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
                          ? 'bg-amber-50/70 border-amber-400 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center mt-0.5 shrink-0 transition-colors ${
                          isChecked ? 'bg-amber-500 text-slate-950 font-black' : 'border border-slate-300 bg-white'
                        }`}
                      >
                        {isChecked && <Check size={13} strokeWidth={3} />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-xs font-black text-slate-900 truncate" title={vendor.name}>
                            {vendor.name}
                          </h4>
                          <span className="text-[10px] font-black px-1.5 py-0.2 bg-slate-100 rounded-sm text-slate-700 shrink-0">
                            ★ {vendor.rating.toFixed(1)}
                          </span>
                        </div>

                        <p className="text-[10px] text-slate-500 truncate mt-0.5">
                          {vendor.contactPerson} • {vendor.email}
                        </p>

                        <div className="flex items-center gap-2 mt-2 text-[10px] font-bold text-slate-600 flex-wrap">
                          <span className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                            <CreditCard size={10} className="text-amber-600" /> {vendor.standardCreditPeriod}
                          </span>
                          <span className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-slate-200">
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
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200">
            <div className="text-xs text-slate-500">
              <strong className="text-slate-900 font-extrabold">{selectedVendorIds.length}</strong> vendors selected for automated email dispatch.
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSending || selectedVendorIds.length === 0}
                className="flex-1 sm:flex-none px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {isSending ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
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
