import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { DailyAllocation, Personnel, JobType } from '@/types';
import { todayString, exportToCSV, personnelDisplayName, sortPersonnelByRank, getRankOrder } from '@/lib/utils';
import { Loader2, Download, Search, History } from 'lucide-react';

export default function HistoricalAnalytics() {
  const [allocations, setAllocations] = useState<DailyAllocation[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);
  const [loading, setLoading] = useState(true);
  const [querying, setQuerying] = useState(false);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState(todayString());
  const [serNoFilter, setSerNoFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');

  const [results, setResults] = useState<DailyAllocation[]>([]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    const [pRes, jtRes] = await Promise.all([
      supabase.from('personnel').select('*').order('name'),
      supabase.from('job_types').select('*').order('category, type'),
    ]);
    setPersonnel(pRes.data || []);
    setJobTypes(jtRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const sections = useMemo(() => {
    const set = new Set(personnel.map((p) => p.section).filter((s): s is string => !!s));
    return Array.from(set).sort();
  }, [personnel]);

  const categories = useMemo(() => {
    const set = new Set(jobTypes.map((jt) => jt.category));
    return Array.from(set).sort();
  }, [jobTypes]);

  const typesForCategory = useMemo(() => {
    if (!categoryFilter) return jobTypes;
    return jobTypes.filter((jt) => jt.category === categoryFilter);
  }, [jobTypes, categoryFilter]);

  const personnelMap = useMemo(() => {
    const m: Record<string, Personnel> = {};
    personnel.forEach((p) => { m[p.ser_no] = p; });
    return m;
  }, [personnel]);

  const handleQuery = async () => {
    setQuerying(true);
    let query = supabase.from('daily_allocations').select('*').order('date', { ascending: true });

    if (dateFrom) query = query.gte('date', dateFrom);
    if (dateTo) query = query.lte('date', dateTo);
    if (serNoFilter) query = query.eq('ser_no', serNoFilter);
    if (typeFilter) query = query.eq('type', typeFilter);
    if (categoryFilter && !typeFilter) query = query.eq('category', categoryFilter);

    const { data } = await query;

    let filtered = data || [];
    if (sectionFilter) {
      filtered = filtered.filter(
        (a) => personnelMap[a.ser_no]?.section === sectionFilter
      );
    }

    setResults(filtered);
    setQuerying(false);
  };

  const handleExport = () => {
    const rows = results.map((a) => ({
      Date: a.date,
      'Ser No': a.ser_no,
      Rank: a.rank || '',
      Name: a.name || '',
      Trade: a.trade || '',
      Section: a.section || '',
      Category: a.category || '',
      Type: a.type,
      'Craft Lab Job': a.craft_lab_job_id || '',
      Remarks: a.remarks || '',
    }));
    exportToCSV(`allocations_${dateFrom || 'all'}_to_${dateTo}.csv`, rows);
  };

  // Comparison matrix: rows = personnel, columns = dates
  const matrixDates = useMemo(() => {
    const set = new Set(results.map((a) => a.date));
    return Array.from(set).sort();
  }, [results]);

  const matrixData = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const a of results) {
      if (!map[a.ser_no]) map[a.ser_no] = {};
      map[a.ser_no][a.date] = a.type;
    }
    return map;
  }, [results]);

  const matrixPersonnel = useMemo(() => {
    return Object.keys(matrixData).sort((a, b) => {
      const pa = personnelMap[a];
      const pb = personnelMap[b];
      const rankDiff = getRankOrder(pa?.rank) - getRankOrder(pb?.rank);
      if (rankDiff !== 0) return rankDiff;
      return (pa?.name || a).localeCompare(pb?.name || b);
    });
  }, [matrixData, personnelMap]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Historical Analytics & Reporting</h2>
        <p className="text-slate-500 mt-1">Query past allocations and export reports.</p>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Search className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-700">Multi-Filter Search</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Date From</label>
            <input type="date" className="input-field" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Date To</label>
            <input type="date" className="input-field" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <label className="label">Personnel</label>
            <select className="select-field" value={serNoFilter} onChange={(e) => setSerNoFilter(e.target.value)}>
              <option value="">All Personnel</option>
              {sortPersonnelByRank(personnel).map((p) => (
                <option key={p.ser_no} value={p.ser_no}>{p.ser_no} — {p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Section</label>
            <select className="select-field" value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}>
              <option value="">All Sections</option>
              {sections.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Job Category</label>
            <select
              className="select-field"
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setTypeFilter(''); }}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Job Type</label>
            <select className="select-field" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All Types</option>
              {typesForCategory.map((jt) => (<option key={jt.type} value={jt.type}>{jt.type}</option>))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button onClick={handleQuery} className="btn-primary flex items-center gap-2">
            {querying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {querying ? 'Querying...' : 'Run Query'}
          </button>
          {results.length > 0 && (
            <button onClick={handleExport} className="btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export to CSV ({results.length} records)
            </button>
          )}
        </div>
      </div>

      {results.length > 0 && (
        <>
          {/* Comparison Matrix */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <History className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-bold text-slate-700">Comparison Matrix</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-2 font-semibold text-slate-600 sticky left-0 bg-white">Ser No</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-600 sticky left-0 bg-white">Name</th>
                    {matrixDates.map((d) => (
                      <th key={d} className="py-2 px-2 font-semibold text-slate-600 text-center whitespace-nowrap">
                        {d.slice(5)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixPersonnel.map((sn) => {
                    const p = personnelMap[sn];
                    return (
                      <tr key={sn} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-1.5 px-2 font-medium text-slate-700 sticky left-0 bg-white">{sn}</td>
                        <td className="py-1.5 px-2 text-slate-600 sticky left-0 bg-white">{p ? p.name : '—'}</td>
                        {matrixDates.map((d) => (
                          <td key={d} className="py-1.5 px-2 text-center">
                            {matrixData[sn][d] ? (
                              <span className="badge bg-teal-50 text-teal-700 whitespace-nowrap">
                                {matrixData[sn][d]}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Daily Summary Report */}
          <div className="card">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Daily Summary Report</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Date</th>
                    <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Ser No</th>
                    <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Name</th>
                    <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Section</th>
                    <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Category</th>
                    <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {results.slice(0, 200).map((a) => (
                    <tr key={a.allocation_id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{a.date}</td>
                      <td className="py-2 px-3 font-medium text-slate-700">{a.ser_no}</td>
                      <td className="py-2 px-3 text-slate-600">{a.rank ? `${a.rank} ` : ''}{a.name || '—'}</td>
                      <td className="py-2 px-3 text-slate-600">{a.section || '—'}</td>
                      <td className="py-2 px-3 text-slate-600">{a.category || '—'}</td>
                      <td className="py-2 px-3">
                        <span className="badge bg-slate-100 text-slate-700">{a.type}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {results.length > 200 && (
                <p className="text-xs text-slate-400 mt-3 text-center">
                  Showing first 200 of {results.length} records. Export to CSV for the full dataset.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {results.length === 0 && !loading && !querying && (
        <div className="card text-center py-12">
          <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Set filters above and run a query to see historical data.</p>
        </div>
      )}
    </div>
  );
}
