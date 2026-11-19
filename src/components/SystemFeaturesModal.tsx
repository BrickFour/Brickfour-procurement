import { X, CheckCircle2, Building2, ShoppingCart, Receipt, ShieldCheck, Cpu, Database, ArrowLeftRight, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';

interface SystemFeaturesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SystemFeaturesModal({ isOpen, onClose }: SystemFeaturesModalProps) {
  if (!isOpen) return null;

  const featureCategories = [
    {
      title: 'Centralized Procurement & Vendor Management',
      icon: <ShoppingCart className="text-[#b91c1c]" size={20} />,
      desc: 'End-to-end material procurement lifecycle management.',
      items: [
        'Purchase Request (PR) generation and tracking',
        'Vendor quote comparison matrix with rate variance analysis',
        'Automated vendor quote simulation and benchmark comparison',
        'One-click award & email dispatch of Purchase Orders'
      ]
    },
    {
      title: 'Real-Time Stock & Inventory Ledger',
      icon: <Building2 className="text-emerald-700" size={20} />,
      desc: 'Comprehensive multi-site inventory tracking and material consumption.',
      items: [
        'Live stock balance ledger across all active project sites',
        'Daily log of material additions, consumption, and wastage',
        'Automated minimum threshold alerts and low-stock warnings',
        'Category-wise filtering (Cement, Steel, Masonry, Finishing, MEP)'
      ]
    },
    {
      title: 'GST & URD Records & Compliance',
      icon: <Receipt className="text-amber-700" size={20} />,
      desc: 'Complete tax compliance, invoices, and cash voucher auditing.',
      items: [
        'GST invoice tracking with applicable tax slabs (5%, 12%, 18%)',
        'URD (Unregistered Dealer) cash voucher & local purchase summaries',
        'Input Tax Credit (ITC) calculation and financial reporting',
        'Vendor GSTIN verification & tax breakdown statements'
      ]
    },
    {
      title: 'Staff Activity & Audit Trail',
      icon: <ShieldCheck className="text-indigo-700" size={20} />,
      desc: 'Secure role-based access control and user action auditing.',
      items: [
        'Role-Based Access Control (Admin vs. Site Managers)',
        'Quick-switch profile access and credential authentication',
        'Audit logs tracking who added stock, approved transfers, or raised queries',
        'Secure session persistence and data isolation'
      ]
    },
    {
      title: 'Gemini AI Assistant Integration',
      icon: <Cpu className="text-purple-700" size={20} />,
      desc: 'Intelligent assistant powered by Google Gemini API.',
      items: [
        'Floating AI Procurement & Inventory chatbot',
        'Smart recommendations for optimal order quantities and cost savings',
        'Natural language queries for material stock and consumption analysis',
        'Instant vendor quote evaluation and risk identification'
      ]
    },
    {
      title: 'Real-Time Cloud Synchronization',
      icon: <Database className="text-cyan-700" size={20} />,
      desc: 'Seamless data sync across devices and cloud databases.',
      items: [
        'Live MongoDB database integration for persistent state storage',
        'Secure per-vendor quotation links with quotes stored directly in the database',
        'Automatic retry of pending changes when the connection drops',
        'Instant sync status indicator banner in dashboard'
      ]
    },
    {
      title: 'Inter-Site Material Transfers',
      icon: <ArrowLeftRight className="text-blue-700" size={20} />,
      desc: 'Optimize material allocation across different construction sites.',
      items: [
        'Direct stock transfer between Project Sites (e.g., Lotus Heights to Grand Horizon)',
        'Transfer challan generation with transit tracking',
        'Automated stock debit from source and credit to destination site',
        'Complete transfer history audit log'
      ]
    },
    {
      title: 'Material Coding, Pricing & Analytics',
      icon: <TrendingUp className="text-rose-700" size={20} />,
      desc: 'Advanced material coding system and market rate analytics.',
      items: [
        'Standardized Material Code directory (001 to 015+)',
        '3-year market price trend escalation graphs and CAGR benchmarks',
        'Valuation summaries and site-wise financial allocation',
        'Site query ticketing system for resolving material issues'
      ]
    }
  ];

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white w-full max-w-4xl max-h-[85vh] rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-lg sm:text-xl font-logo uppercase tracking-tight flex items-center gap-2">
              <span className="text-indigo-900">PRAVAH</span>
              <span className="text-xs font-sans font-extrabold bg-indigo-50 text-indigo-900 border border-indigo-200 px-2 py-0.5 rounded-lg uppercase tracking-wider">Features Directory</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Comprehensive overview of central procurement, stock ledger, GST records, staff activity, and AI capabilities.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Feature Grid Content */}
        <div className="flex-1 overflow-y-auto py-6 pr-1 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {featureCategories.map((cat, index) => (
              <div
                key={index}
                className="bg-slate-50 hover:bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-4 sm:p-5 transition-all shadow-2xs group"
              >
                <div className="flex items-center gap-3 mb-2.5">
                  <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs group-hover:scale-105 transition-transform">
                    {cat.icon}
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                      {cat.title}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-medium">
                      {cat.desc}
                    </p>
                  </div>
                </div>

                <ul className="space-y-1.5 pt-2 border-t border-slate-200/60 mt-2">
                  {cat.items.map((item, i) => (
                    <li key={i} className="text-xs text-slate-700 flex items-start gap-2">
                      <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="pt-4 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500 font-medium">
            All modules active and fully synchronized in real-time.
          </span>
          <button
            onClick={onClose}
            className="bg-slate-950 hover:bg-black text-white font-extrabold text-xs px-5 py-2.5 rounded-xl transition-all cursor-pointer shadow-xs"
          >
            Close Directory
          </button>
        </div>
      </motion.div>
    </div>
  );
}
