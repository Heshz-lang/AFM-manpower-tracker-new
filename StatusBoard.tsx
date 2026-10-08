import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { Personnel, DailyAllocation } from '@/types';
import { todayString, groupByCategory, getInitials, personnelDisplayName, sortPersonnelByRank, formatDate } from '@/lib/utils';
import { Loader2, Search, Users, CheckCircle2, XCircle, Filter, CalendarClock } from 'lucide-react';

const LEAVE_CATEGORY = 'Leave/pass/off';

interface LeaveStats {
  daysSinceLastLeave: number | null;
  totalLeaveLast45Days: number;
}

export default function StatusBoard() {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [allocations, setAllocations] = useState<DailyAllocation[]>([]);
  const [leaveStats, setLeaveStats] = useState<Record<string, LeaveStats>>({});
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayString());
  const [rankFilter, setRankFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const [pRes, aRes] = await Promise.all([
      supabase.from('personnel').select('*').order('name'),
      supabase.from('daily_allocations').select('*').eq('date', date),
    ]);
    const personnelData = pRes.data || [];
    setPersonnel(personnelData);
    setAllocations(aRes.data || []);

    // Fetch all leave-type allocations for every person to compute leave stats
    const serNos = personnelData.map((p) => p.ser_no);
    if (serNos.length > 0) {
      const { data: leaveAllocs } = await supabase
        .from('daily_allocations')
        .select('ser_no, date')
        .eq('category', LEAVE_CATEGORY)
        .in('ser_no', serNos)
        .order('date', { ascending: false });

      const statsMap: Record<string, LeaveStats> = {};
      const selectedDate = new Date(date);
      const fortyFiveDaysAgo = new Date(selectedDate);
      fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);

      const groupedByPerson: Record<string, string[]> = {};
      for (const la of leaveAllocs || []) {
        if (!groupedByPerson[la.ser_no]) groupedByPerson[la.ser_no] = [];
        groupedByPerson[la.ser_no].push(la.date);
      }

      for (const p of personnelData) {
        const leaveDates = (groupedByPerson[p.ser_no] || []).sort((a, b) => b.localeCompare(a));
        if (leaveDates.length === 0) {
          statsMap[p.ser_no] = { daysSinceLastLeave: null, totalLeaveLast45Days: 0 };
        } else {
          const lastLeaveDate = new Date(leaveDates[0]);
          const diffMs = selectedDate.getTime() - lastLeaveDate.getTime();
          const daysSince = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          const countLast45 = leaveDates.filter((d) => {
            const ld = new Date(d);
            return ld >= fortyFiveDaysAgo && ld <= selectedDate;
          }).length;
          statsMap[p.ser_no] = {
            daysSinceLastLeave: daysSince >= 0 ? daysSince : null,
            totalLeaveLast45Days: countLast45,
          };
        }
      }
      setLeaveStats(statsMap);
    }

    setLoading(false);
  }, [date]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const ranks = useMemo(() => {
    const set = new Set(personnel.map((p) => p.rank).filter((r): r is string => !!r));
    return Array.from(set).sort();
  }, [personnel]);

  const sections = useMemo(() => {
    const set = new Set(personnel.map((p) => p.section).filter((s): s is string => !!s));
    return Array.from(set).sort();
  }, [personnel]);

  const allocationMap = useMemo(() => {
    const map: Record<string, DailyAllocation> = {};
    for (const a of allocations) {
      map[a.ser_no] = a;
    }
    return map;
  }, [allocations]);

  const filteredPersonnel = useMemo(() => {
    const filtered = personnel.filter((p) => {
      if (rankFilter && p.rank !== rankFilter) return false;
      if (sectionFilter && p.section !== sectionFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !p.name.toLowerCase().includes(q) &&
          !p.ser_no.toLowerCase().includes(q) &&
          !(p.trade || '').toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
    return sortPersonnelByRank(filtered);
  }, [personnel, rankFilter, sectionFilter, search]);

  // Filtered allocations for summary (only those matching the filters)
  const filteredAllocations = useMemo(() => {
    const filteredSerNos = new Set(filteredPersonnel.map((p) => p.ser_no));
    return allocations.filter((a) => filteredSerNos.has(a.ser_no));
  }, [allocations, filteredPersonnel]);

  const categorySummary = useMemo(() => groupByCategory(filteredAllocations), [filteredAllocations]);

  const allocatedCount = filteredAllocations.length;
  const unallocatedCount = filteredPersonnel.length - allocatedCount;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Real-Time Status Board</h2>
          <p className="text-slate-500 mt-1">Live daily roster view with allocation status.</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            className="input-field max-w-[180px]"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap items-center gap-4 py-4">
        <div className="flex items-center gap-2 text-slate-500">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-semibold">Filters</span>
        </div>
        <select
          className="select-field max-w-[160px]"
          value={rankFilter}
          onChange={(e) => setRankFilter(e.target.value)}
        >
          <option value="">All Ranks</option>
          {ranks.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
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
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            className="input-field pl-9"
            placeholder="Search name, Ser No, trade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Summary Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Totals cards */}
        <div className="grid grid-cols-3 gap-3 lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-semibold text-slate-500 uppercase">Total</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{filteredPersonnel.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-emerald-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-semibold text-emerald-600 uppercase">Allocated</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{allocatedCount}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-red-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-xs font-semibold text-red-600 uppercase">Open</span>
            </div>
            <p className="text-2xl font-bold text-red-500">{unallocatedCount}</p>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="card lg:col-span-2">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Daily Allocation Summary</h3>
          {Object.keys(categorySummary).length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No allocations for this date.</p>
          ) : (
            <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
              {Object.entries(categorySummary).map(([cat, types]) => {
                const catTotal = Object.values(types).reduce((a, b) => a + b, 0);
                return (
                  <div key={cat} className="border border-slate-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-slate-800">{cat}</span>
                      <span className="badge bg-teal-100 text-teal-700">{catTotal}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(types).map(([t, count]) => (
                        <span
                          key={t}
                          className="badge bg-slate-100 text-slate-600"
                        >
                          {t}: {count}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Personnel Grid */}
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-3">
          Personnel Grid ({filteredPersonnel.length})
        </h3>
        {filteredPersonnel.length === 0 ? (
          <div className="card text-center py-12">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No personnel found. Add personnel in the Admin Panel.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredPersonnel.map((p) => {
              const alloc = allocationMap[p.ser_no];
              const isAllocated = !!alloc;
              return (
                <div
                  key={p.ser_no}
                  className={`bg-white rounded-xl shadow-sm border-2 transition-all duration-200 hover:shadow-md ${
                    isAllocated ? 'border-emerald-400' : 'border-red-300'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Photo / Avatar */}
                      <div className="flex-shrink-0">
                        {p.photo_url ? (
                          <img
                            src={p.photo_url}
                            alt={p.name}
                            className="w-14 h-14 rounded-lg object-cover border border-slate-200"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-lg">
                            {getInitials(p.name)}
                          </div>
                        )}
                      </div>
                      {/* Details */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 truncate">
                          {personnelDisplayName(p)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{p.ser_no}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {p.trade && (
                            <span className="badge bg-slate-100 text-slate-600">{p.trade}</span>
                          )}
                          {p.section && (
                            <span className="badge bg-blue-50 text-blue-600">{p.section}</span>
                          )}
                        </div>
                        {/* Leave stats */}
                        {(() => {
                          const ls = leaveStats[p.ser_no];
                          if (!ls) return null;
                          return (
                            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100">
                              <div className="flex items-center gap-1" title="Days since last leave">
                                <CalendarClock className="w-3.5 h-3.5 text-amber-500" />
                                <span className="text-xs text-slate-500">Leave:</span>
                                <span className="text-xs font-bold text-slate-700">
                                  {ls.daysSinceLastLeave !== null ? `${ls.daysSinceLastLeave}d ago` : 'Never'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1" title="Total leave days in last 45 days">
                                <span className="text-xs text-slate-500">45d:</span>
                                <span className={`text-xs font-bold ${ls.totalLeaveLast45Days > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                  {ls.totalLeaveLast45Days}d
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  {/* Allocation status footer */}
                  <div
                    className={`px-4 py-2.5 border-t flex items-center justify-between ${
                      isAllocated
                        ? 'bg-emerald-50 border-emerald-100'
                        : 'bg-red-50 border-red-100'
                    }`}
                  >
                    <div className="min-w-0">
                      {isAllocated ? (
                        <>
                          <p className="text-xs font-semibold text-emerald-700 truncate">
                            {alloc.type}
                          </p>
                          <p className="text-xs text-emerald-500 truncate">{alloc.category}</p>
                        </>
                      ) : (
                        <p className="text-xs font-semibold text-red-600">Unallocated</p>
                      )}
                    </div>
                    <div
                      className={`w-3 h-3 rounded-full flex-shrink-0 ${
                        isAllocated ? 'bg-emerald-500' : 'bg-red-400'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
