import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { DailyAllocation, Personnel } from '@/types';
import { todayString, groupByCategory } from '@/lib/utils';
import { Loader2, BarChart3, PieChart } from 'lucide-react';

const CATEGORY_COLORS: Record<string, string> = {
  'Security duty': '#0d9488',
  'Base secondary duty': '#2563eb',
  'Leave/pass/off': '#f59e0b',
  'Medical': '#ef4444',
  'Other': '#6b7280',
  'Formation duty': '#8b5cf6',
  'Daily duty crew': '#06b6d4',
};

const FALLBACK_COLORS = ['#0d9488', '#2563eb', '#f59e0b', '#ef4444', '#6b7280', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316'];

function getColor(key: string, index: number): string {
  return CATEGORY_COLORS[key] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

export default function GraphicalDashboard() {
  const [allocations, setAllocations] = useState<DailyAllocation[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayString());
  const [sectionFilter, setSectionFilter] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const [aRes, pRes] = await Promise.all([
      supabase.from('daily_allocations').select('*').eq('date', date),
      supabase.from('personnel').select('*'),
    ]);
    setAllocations(aRes.data || []);
    setPersonnel(pRes.data || []);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sections = useMemo(() => {
    const set = new Set(personnel.map((p) => p.section).filter((s): s is string => !!s));
    return Array.from(set).sort();
  }, [personnel]);

  const filteredAllocations = useMemo(() => {
    if (!sectionFilter) return allocations;
    const sectionSerNos = new Set(
      personnel.filter((p) => p.section === sectionFilter).map((p) => p.ser_no)
    );
    return allocations.filter((a) => sectionSerNos.has(a.ser_no));
  }, [allocations, personnel, sectionFilter]);

  const categorySummary = useMemo(() => groupByCategory(filteredAllocations), [filteredAllocations]);

  const categoryTotals = useMemo(() => {
    return Object.entries(categorySummary).map(([cat, types]) => ({
      cat,
      total: Object.values(types).reduce((a, b) => a + b, 0),
    }));
  }, [categorySummary]);

  const typeBreakdown = useMemo(() => {
    const result: { type: string; count: number; cat: string }[] = [];
    Object.entries(categorySummary).forEach(([cat, types]) => {
      Object.entries(types).forEach(([type, count]) => {
        result.push({ type, count, cat });
      });
    });
    return result.sort((a, b) => b.count - a.count);
  }, [categorySummary]);

  const maxCategoryTotal = Math.max(...categoryTotals.map((c) => c.total), 1);
  const maxTypeCount = Math.max(...typeBreakdown.map((t) => t.count), 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  const totalAllocations = filteredAllocations.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Graphical Dashboard</h2>
          <p className="text-slate-500 mt-1">Visual summary of daily allocations.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="select-field max-w-[200px]"
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
          >
            <option value="">All Sections</option>
            {sections.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            type="date"
            className="input-field max-w-[180px]"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {totalAllocations === 0 ? (
        <div className="card text-center py-16">
          <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No allocation data for this date. Try a different date or section.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar chart - by category */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-teal-600" />
              <h3 className="text-sm font-bold text-slate-700">Allocations by Category</h3>
            </div>
            <div className="space-y-3">
              {categoryTotals.map((c, i) => (
                <div key={c.cat}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-600">{c.cat}</span>
                    <span className="text-xs font-bold text-slate-900">{c.total}</span>
                  </div>
                  <div className="h-6 bg-slate-100 rounded-lg overflow-hidden">
                    <div
                      className="h-full rounded-lg transition-all duration-500 flex items-center justify-end px-2"
                      style={{
                        width: `${(c.total / maxCategoryTotal) * 100}%`,
                        backgroundColor: getColor(c.cat, i),
                        minWidth: '2rem',
                      }}
                    >
                      <span className="text-xs font-bold text-white">{c.total}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pie chart - by category */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <PieChart className="w-5 h-5 text-teal-600" />
              <h3 className="text-sm font-bold text-slate-700">Category Distribution</h3>
            </div>
            <div className="flex items-center justify-center gap-6">
              {/* Donut chart */}
              <div className="relative">
                <svg width="180" height="180" viewBox="0 0 180 180">
                  {(() => {
                    const total = totalAllocations;
                    let offset = 0;
                    const radius = 70;
                    const circumference = 2 * Math.PI * radius;
                    return categoryTotals.map((c, i) => {
                      const percentage = c.total / total;
                      const dash = percentage * circumference;
                      const circle = (
                        <circle
                          key={c.cat}
                          cx="90"
                          cy="90"
                          r={radius}
                          fill="none"
                          stroke={getColor(c.cat, i)}
                          strokeWidth="28"
                          strokeDasharray={`${dash} ${circumference - dash}`}
                          strokeDashoffset={-offset}
                          transform="rotate(-90 90 90)"
                          style={{ transition: 'all 0.5s ease' }}
                        />
                      );
                      offset += dash;
                      return circle;
                    });
                  })()}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-slate-900">{totalAllocations}</span>
                  <span className="text-xs text-slate-500">Total</span>
                </div>
              </div>
              {/* Legend */}
              <div className="space-y-2">
                {categoryTotals.map((c, i) => (
                  <div key={c.cat} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: getColor(c.cat, i) }}
                    />
                    <span className="text-xs text-slate-600">{c.cat}</span>
                    <span className="text-xs font-bold text-slate-900">{c.total}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bar chart - by type */}
          <div className="card lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-teal-600" />
              <h3 className="text-sm font-bold text-slate-700">Allocations by Job Type</h3>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {typeBreakdown.map((t, i) => (
                <div key={t.type} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-600 w-48 truncate flex-shrink-0">{t.type}</span>
                  <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden">
                    <div
                      className="h-full rounded-md transition-all duration-500"
                      style={{
                        width: `${(t.count / maxTypeCount) * 100}%`,
                        backgroundColor: getColor(t.cat, i),
                        minWidth: '1.5rem',
                      }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-900 w-8 text-right">{t.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
