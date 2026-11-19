import { useMemo } from 'react';
import { Material, InventoryTransaction, User, ContractorRecord } from '../types';
import { Package, AlertTriangle, TrendingDown, Bell, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';

interface StatsGridProps {
  materials: Material[];
  transactions: InventoryTransaction[];
  contractors?: ContractorRecord[];
  selectedProjectId: string;
  currentUser?: User;
  isAdmin?: boolean;
  onLowStockClick?: () => void;
  onReorderClick?: () => void;
  onDailyActivitiesClick?: () => void;
}

export default function StatsGrid({
  materials,
  transactions,
  contractors = [],
  selectedProjectId,
  currentUser,
  isAdmin,
  onLowStockClick,
  onReorderClick,
  onDailyActivitiesClick,
}: StatsGridProps) {
  const isUserAdmin = isAdmin ?? (currentUser?.role === 'admin');

  const stats = useMemo(() => {
    // Filter materials by current project if selected
    const filteredMaterials = selectedProjectId === 'all'
      ? materials
      : materials.filter(m => m.projectId === selectedProjectId);

    const filteredTransactions = selectedProjectId === 'all'
      ? transactions
      : transactions.filter(t => t.projectId === selectedProjectId);

    const filteredContractors = selectedProjectId === 'all'
      ? contractors
      : contractors.filter(c => c.projectId === selectedProjectId);

    // Calculate materials/inventory valuation
    // Note: Logged consumption (log-use) on site does NOT decrease the total asset value, as materials are deployed in construction rather than lost/returned.
    const materialsValuation = filteredMaterials.reduce((sum, mat) => {
      const consumedQty = filteredTransactions
        .filter(t => t.materialId === mat.id && t.type === 'consumption')
        .reduce((sumTx, tx) => sumTx + tx.quantity, 0);
      const effectiveTotalStock = mat.currentStock + consumedQty;
      return sum + (effectiveTotalStock * mat.unitCost);
    }, 0);

    // Calculate procurement & contracts total amount (total estimated billing across contracting firms)
    const contractorsValuation = filteredContractors.reduce((sum, c) => {
      return sum + (c.totalEstimatedBilling || 0);
    }, 0);

    // Combined Project Estimation Cost = Materials Valuation + Procurement & Contracts Total Amount
    const totalProjectCost = materialsValuation + contractorsValuation;

    // Count low stock items (<= safety score)
    const lowStockItems = filteredMaterials.filter(mat => mat.currentStock <= mat.minThreshold);

    // Count reorder items (below 2x of safety score and above safety score)
    const reorderItems = filteredMaterials.filter(
      mat => mat.currentStock > mat.minThreshold && mat.currentStock <= (mat.minThreshold * 2)
    );

    // Count today's transactions
    const todayStr = new Date().toISOString().split('T')[0];
    const todayTransactions = filteredTransactions.filter(tx => tx.date === todayStr);

    // Total additions & consumptions
    let totalAdditions = 0;
    let totalConsumptions = 0;
    filteredTransactions.forEach(tx => {
      if (tx.type === 'addition') totalAdditions += tx.quantity;
      else totalConsumptions += tx.quantity;
    });

    return {
      materialsValuation,
      contractorsValuation,
      totalProjectCost,
      lowStockCount: lowStockItems.length,
      reorderCount: reorderItems.length,
      activeMaterialsCount: filteredMaterials.length,
      todayTxCount: todayTransactions.length,
      totalAdditions,
      totalConsumptions,
    };
  }, [materials, transactions, contractors, selectedProjectId]);

  // Tone: 'alert' (red) / 'warn' (amber) when the card needs attention, otherwise the logo navy
  const cards: {
    id: string;
    title: string;
    value: string;
    subtitle: string;
    hint?: string;
    icon: typeof Package;
    tone: 'brand' | 'alert' | 'warn';
    onClick?: () => void;
  }[] = [
    {
      id: 'stat-low',
      title: 'Low Stock Alerts',
      value: stats.lowStockCount.toString(),
      subtitle: stats.lowStockCount > 0 ? `${stats.lowStockCount} items require replenishment` : 'All items safely stocked',
      hint: 'View low stock items',
      icon: AlertTriangle,
      tone: stats.lowStockCount > 0 ? 'alert' : 'brand',
      onClick: onLowStockClick,
    },
    {
      id: 'stat-reorder',
      title: 'Reorder Notifications',
      value: stats.reorderCount.toString(),
      subtitle: stats.reorderCount > 0 ? `${stats.reorderCount} items below 2x safety score` : 'Stock healthy above 2x safety',
      hint: 'View reorder items',
      icon: Bell,
      tone: stats.reorderCount > 0 ? 'warn' : 'brand',
      onClick: onReorderClick,
    },
    {
      id: 'stat-active',
      title: 'Tracked Resources',
      value: stats.activeMaterialsCount.toString(),
      subtitle: 'Unique material categories',
      icon: Package,
      tone: 'brand',
    },
    {
      id: 'stat-today',
      title: 'Daily Activities Logged',
      value: stats.todayTxCount.toString(),
      subtitle: 'Material actions recorded today',
      hint: "View today's activity logs",
      icon: TrendingDown,
      tone: 'brand',
      onClick: onDailyActivitiesClick,
    },
  ];

  const TONE = {
    brand: { icon: 'bg-[#eaf0fb] text-[#23408e]', value: 'text-slate-900', bar: 'bg-transparent' },
    alert: { icon: 'bg-rose-50 text-rose-600', value: 'text-rose-700', bar: 'bg-rose-500' },
    warn: { icon: 'bg-amber-50 text-amber-600', value: 'text-amber-700', bar: 'bg-amber-400' },
  } as const;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="stats-container">
      {cards.map((card, index) => {
        const IconComponent = card.icon;
        const isClickable = !!card.onClick;
        const tone = TONE[card.tone];

        return (
          <motion.div
            key={card.id}
            id={card.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            onClick={card.onClick}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={isClickable ? (e) => (e.key === 'Enter' || e.key === ' ') && card.onClick?.() : undefined}
            className={`relative overflow-hidden flex flex-col justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm transition-colors min-w-0 ${
              isClickable ? 'cursor-pointer hover:border-[#c9d6f2] hover:bg-[#f5f8fd] group focus:outline-hidden focus:ring-2 focus:ring-[#23408e]/30' : ''
            }`}
          >
            <span className={`absolute left-0 top-0 h-full w-1 ${tone.bar}`} aria-hidden="true" />
            <div className="flex items-start justify-between gap-3 min-w-0">
              <div className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide truncate" title={card.title}>
                  {card.title}
                </span>
                <h3
                  className={`font-bold mt-1 leading-tight break-words ${tone.value} ${card.value.length > 12 ? 'text-xl' : 'text-2xl'}`}
                  title={card.value}
                >
                  {card.value}
                </h3>
              </div>
              <div className={`w-9 h-9 rounded-lg ${tone.icon} flex items-center justify-center shrink-0`}>
                <IconComponent size={18} />
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-1 min-w-0">
              <span className="text-[11px] text-slate-500 leading-snug break-words" title={card.subtitle}>
                {card.subtitle}
              </span>
              {card.hint && (
                <span className="text-xs font-semibold text-[#23408e] group-hover:underline inline-flex items-center gap-1">
                  {card.hint} <ChevronRight size={13} />
                </span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
