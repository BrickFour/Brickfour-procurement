import { useState, useMemo } from 'react';
import { Material, InventoryTransaction } from '../types';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { BarChart3, TrendingUp, DollarSign } from 'lucide-react';

interface StockAnalyticsProps {
  materials: Material[];
  transactions: InventoryTransaction[];
  selectedProjectId: string;
}

export default function StockAnalytics({ materials, transactions, selectedProjectId }: StockAnalyticsProps) {
  const [trendTimeframe, setTrendTimeframe] = useState<'7day' | 'monthly' | 'quarterly' | 'yearly'>('7day');

  // Filter materials and transactions based on current project
  const filteredMaterials = useMemo(() => {
    return selectedProjectId === 'all'
      ? materials
      : materials.filter((m) => m.projectId === selectedProjectId);
  }, [materials, selectedProjectId]);

  const filteredTransactions = useMemo(() => {
    return selectedProjectId === 'all'
      ? transactions
      : transactions.filter((t) => t.projectId === selectedProjectId);
  }, [transactions, selectedProjectId]);

  // 1. Stock Levels vs Safe Thresholds Chart Data
  const stockComparisonData = useMemo(() => {
    return filteredMaterials.map((mat) => ({
      name: mat.name.length > 15 ? `${mat.name.slice(0, 15)}...` : mat.name,
      'Current Qty': mat.currentStock,
      'Min Threshold': mat.minThreshold,
      unit: mat.unit,
    }));
  }, [filteredMaterials]);

  // 2. Category-wise Capital Allocation Data
  const categoryCapitalData = useMemo(() => {
    const caps: Record<string, number> = {
      Structural: 0,
      Masonry: 0,
      Finishing: 0,
      Plumbing: 0,
      Electrical: 0,
      Others: 0,
    };

    filteredMaterials.forEach((mat) => {
      const catKey = mat.category || 'Others';
      const consumedQty = filteredTransactions
        .filter((t) => t.materialId === mat.id && t.type === 'consumption')
        .reduce((sum, t) => sum + t.quantity, 0);
      const effectiveTotalStock = mat.currentStock + consumedQty;
      caps[catKey] = (caps[catKey] || 0) + effectiveTotalStock * mat.unitCost;
    });

    return Object.keys(caps).map((cat) => ({
      name: cat,
      Value: Number((caps[cat] || 0).toFixed(2)),
    }));
  }, [filteredMaterials]);

  // 3. Multi-timeframe Material Flow Trend Data
  const movementTrendData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed (6 = July)

    if (trendTimeframe === '7day') {
      const trend: Record<string, { Label: string; Added: number; Consumed: number }> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        const displayDate = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        trend[key] = { Label: displayDate, Added: 0, Consumed: 0 };
      }

      filteredTransactions.forEach((tx) => {
        const txDate = tx.date.split(' ')[0];
        if (trend[txDate]) {
          if (tx.type === 'addition') {
            trend[txDate].Added += tx.quantity;
          } else {
            trend[txDate].Consumed += tx.quantity;
          }
        }
      });

      return Object.values(trend).map((item) => ({
        Date: item.Label,
        Added: item.Added,
        Consumed: item.Consumed,
      }));
    }

    if (trendTimeframe === 'monthly') {
      // Divide current month into 4 weeks: W1 (1-7), W2 (8-14), W3 (15-21), W4 (22+)
      const monthName = now.toLocaleDateString(undefined, { month: 'short' });
      const weeks = [
        { key: 'w1', Label: `${monthName} W1 (1-7)`, Added: 0, Consumed: 0, minDay: 1, maxDay: 7 },
        { key: 'w2', Label: `${monthName} W2 (8-14)`, Added: 0, Consumed: 0, minDay: 8, maxDay: 14 },
        { key: 'w3', Label: `${monthName} W3 (15-21)`, Added: 0, Consumed: 0, minDay: 15, maxDay: 21 },
        { key: 'w4', Label: `${monthName} W4 (22+)`, Added: 0, Consumed: 0, minDay: 22, maxDay: 31 },
      ];

      filteredTransactions.forEach((tx) => {
        const d = new Date(tx.date.replace(' ', 'T'));
        if (!isNaN(d.getTime())) {
          if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
            const day = d.getDate();
            const weekBucket = weeks.find((w) => day >= w.minDay && day <= w.maxDay);
            if (weekBucket) {
              if (tx.type === 'addition') weekBucket.Added += tx.quantity;
              else weekBucket.Consumed += tx.quantity;
            }
          }
        }
      });

      return weeks.map((w) => ({ Date: w.Label, Added: w.Added, Consumed: w.Consumed }));
    }

    if (trendTimeframe === 'quarterly') {
      // Divide current quarter into 3 months
      const quarterIndex = Math.floor(currentMonth / 3);
      const startMonth = quarterIndex * 3;
      const monthsInQuarter = [startMonth, startMonth + 1, startMonth + 2];

      const monthBuckets = monthsInQuarter.map((mIdx) => {
        const d = new Date(currentYear, mIdx, 1);
        const name = d.toLocaleDateString(undefined, { month: 'short' });
        return { monthIdx: mIdx, Label: `${name} ${currentYear}`, Added: 0, Consumed: 0 };
      });

      filteredTransactions.forEach((tx) => {
        const d = new Date(tx.date.replace(' ', 'T'));
        if (!isNaN(d.getTime())) {
          if (d.getFullYear() === currentYear && monthsInQuarter.includes(d.getMonth())) {
            const bucket = monthBuckets.find((b) => b.monthIdx === d.getMonth());
            if (bucket) {
              if (tx.type === 'addition') bucket.Added += tx.quantity;
              else bucket.Consumed += tx.quantity;
            }
          }
        }
      });

      return monthBuckets.map((b) => ({ Date: b.Label, Added: b.Added, Consumed: b.Consumed }));
    }

    if (trendTimeframe === 'yearly') {
      // Divide current year into 4 quarters
      const quarters = [
        { key: 'Q1', Label: `Q1 (Jan-Mar)`, Added: 0, Consumed: 0, months: [0, 1, 2] },
        { key: 'Q2', Label: `Q2 (Apr-Jun)`, Added: 0, Consumed: 0, months: [3, 4, 5] },
        { key: 'Q3', Label: `Q3 (Jul-Sep)`, Added: 0, Consumed: 0, months: [6, 7, 8] },
        { key: 'Q4', Label: `Q4 (Oct-Dec)`, Added: 0, Consumed: 0, months: [9, 10, 11] },
      ];

      filteredTransactions.forEach((tx) => {
        const d = new Date(tx.date.replace(' ', 'T'));
        if (!isNaN(d.getTime())) {
          if (d.getFullYear() === currentYear) {
            const m = d.getMonth();
            const qBucket = quarters.find((q) => q.months.includes(m));
            if (qBucket) {
              if (tx.type === 'addition') qBucket.Added += tx.quantity;
              else qBucket.Consumed += tx.quantity;
            }
          }
        }
      });

      return quarters.map((q) => ({ Date: q.Label, Added: q.Added, Consumed: q.Consumed }));
    }

    return [];
  }, [filteredTransactions, trendTimeframe]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200" id="analytics-section">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#23408e] text-white flex items-center justify-center shrink-0">
          <TrendingUp size={20} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Visual Analytics</h1>
          <p className="text-xs text-slate-500">Stock levels against safety thresholds, material movement trends and capital tied up by category.</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Materials Tracked', value: filteredMaterials.length.toLocaleString('en-IN'), hint: 'In the selected scope', cls: 'text-slate-900' },
          { label: 'Below Safety Level', value: filteredMaterials.filter((m) => m.currentStock <= m.minThreshold).length.toLocaleString('en-IN'), hint: 'At or below minimum', cls: 'text-rose-700' },
          { label: 'Stock Movements', value: filteredTransactions.length.toLocaleString('en-IN'), hint: 'Additions + consumption logged', cls: 'text-slate-900' },
          { label: 'Capital On-Site', value: `Rs. ${Math.round(categoryCapitalData.reduce((s, c) => s + (Number(c.Value) || 0), 0)).toLocaleString('en-IN')}`, hint: 'Across all categories', cls: 'text-slate-900' },
        ].map((k) => (
          <div key={k.label} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm min-w-0">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{k.label}</span>
            <p className={`text-xl sm:text-2xl font-bold mt-1 break-words ${k.cls}`}>{k.value}</p>
            <span className="text-[11px] text-slate-500">{k.hint}</span>
          </div>
        ))}
      </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Chart 1: Stock Levels vs Safe Minimums */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 size={16} className="text-[#23408e]" /> Current Stock Levels vs. Safety Thresholds
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Ensure resources stay above the recommended minimum safe reserve.
          </p>
        </div>

        <div className="h-64 w-full text-xs">
          {stockComparisonData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-400">
              No material data available to display charts.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockComparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', color: '#0f172a', border: '1px solid #cbd5e1' }}
                  labelStyle={{ fontWeight: 'bold', color: '#0f172a' }}
                />
                <Legend iconSize={8} iconType="circle" />
                <Bar dataKey="Current Qty" fill="#23408e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Min Threshold" fill="#c9d6f2" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Chart 2: Material Flows with Timeframe Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex justify-start mb-4">
            {/* Timeframe Switcher Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold self-start sm:self-auto shrink-0 border border-slate-200" id="timeframe-tab-group">
              <button
                id="tab-timeframe-7day"
                onClick={() => setTrendTimeframe('7day')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  trendTimeframe === '7day' ? 'bg-[#23408e] text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                7-Day
              </button>
              <button
                id="tab-timeframe-monthly"
                onClick={() => setTrendTimeframe('monthly')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  trendTimeframe === 'monthly' ? 'bg-[#23408e] text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Monthly (Weeks)
              </button>
              <button
                id="tab-timeframe-quarterly"
                onClick={() => setTrendTimeframe('quarterly')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  trendTimeframe === 'quarterly' ? 'bg-[#23408e] text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Quarterly (Months)
              </button>
              <button
                id="tab-timeframe-yearly"
                onClick={() => setTrendTimeframe('yearly')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  trendTimeframe === 'yearly' ? 'bg-[#23408e] text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Yearly (Quarters)
              </button>
            </div>
          </div>
        </div>

        <div className="h-64 w-full text-xs">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={movementTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="Date" stroke="#64748b" fontSize={10} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', color: '#0f172a', border: '1px solid #cbd5e1' }}
                labelStyle={{ fontWeight: 'bold', color: '#0f172a' }}
              />
              <Legend iconSize={8} iconType="circle" />
              <Line type="monotone" dataKey="Added" stroke="#10b981" strokeWidth={2.5} activeDot={{ r: 6 }} name="Added (+)" />
              <Line type="monotone" dataKey="Consumed" stroke="#ef4444" strokeWidth={2.5} activeDot={{ r: 6 }} name="Consumed (-)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 3: Capital Allocation Breakdown by Category */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between lg:col-span-2">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <DollarSign size={16} className="text-[#23408e]" /> Capital Investment Split by Material Category (Rs.)
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Total rupee value tied up in on-site material inventories categorized by role.
          </p>
        </div>

        <div className="h-56 w-full text-xs">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryCapitalData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} />
              <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={10} tickLine={false} width={80} />
              <Tooltip
                formatter={(value: any) => [`Rs. ${value.toLocaleString('en-IN')}`, 'Asset Value']}
                contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', color: '#0f172a', border: '1px solid #cbd5e1' }}
              />
              <Bar dataKey="Value" fill="#23408e" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
    </div>
  );
}

