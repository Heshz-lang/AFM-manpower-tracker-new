import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { RegisteredJob, JobItem, Item, DailyAllocation, Personnel, JobStatus } from '@/types';
import { personnelDisplayName, getRankOrder } from '@/lib/utils';
import { Loader2, Wrench, ChevronRight, X, Clock, Users, Calendar } from 'lucide-react';

export default function JobTracker() {
  const [jobs, setJobs] = useState<RegisteredJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [selectedJob, setSelectedJob] = useState<RegisteredJob | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('registered_jobs').select('*').order('created_at', { ascending: false });
    setJobs(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const activeJobs = useMemo(() => jobs.filter((j) => j.status !== 'Completed'), [jobs]);
  const completedJobs = useMemo(() => jobs.filter((j) => j.status === 'Completed'), [jobs]);
  const displayJobs = activeTab === 'active' ? activeJobs : completedJobs;

  const handleStatusChange = async (jobId: string, newStatus: JobStatus) => {
    const updateData: Partial<RegisteredJob> = { status: newStatus };
    if (newStatus === 'Completed') {
      updateData.finish_date = new Date().toISOString().split('T')[0];
    }

    const { error } = await supabase.from('registered_jobs').update(updateData).eq('job_id', jobId);
    if (!error) {
      setJobs((prev) =>
        prev.map((j) =>
          j.job_id === jobId
            ? { ...j, status: newStatus, finish_date: newStatus === 'Completed' ? updateData.finish_date! : j.finish_date }
            : j
        )
      );
    }
  };

  // Recalculate start_date for all jobs
  useEffect(() => {
    (async () => {
      for (const job of jobs) {
        if (job.status !== 'Completed' && !job.start_date) {
          const { data } = await supabase
            .from('daily_allocations')
            .select('date')
            .eq('craft_lab_job_id', job.job_id)
            .order('date', { ascending: true })
            .limit(1);

          if (data && data.length > 0) {
            await supabase.from('registered_jobs').update({ start_date: data[0].date }).eq('job_id', job.job_id);
          }
        }
      }
    })();
  }, [jobs]);

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
        <h2 className="text-2xl font-bold text-slate-900">Production Job Tracker</h2>
        <p className="text-slate-500 mt-1">Track production jobs, update status, and analyze manpower.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('active')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Active Jobs ({activeJobs.length})
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'completed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Completed ({completedJobs.length})
        </button>
      </div>

      {/* Job list */}
      {displayJobs.length === 0 ? (
        <div className="card text-center py-12">
          <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">
            {activeTab === 'active' ? 'No active jobs. Register a new job to get started.' : 'No completed jobs yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayJobs.map((job) => (
            <div key={job.job_id} className="card hover:shadow-md transition-shadow">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <button
                      onClick={() => setSelectedJob(job)}
                      className="text-sm font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1"
                    >
                      {job.job_id}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <span
                      className={`badge ${
                        job.status === 'Completed'
                          ? 'bg-slate-100 text-slate-600'
                          : job.status === 'On progress'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{job.job_description || 'No description'}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                    {job.start_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Start: {job.start_date}
                      </span>
                    )}
                    {job.finish_date && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Finished: {job.finish_date}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status editor */}
                <div className="flex items-center gap-2">
                  <select
                    className="select-field max-w-[150px]"
                    value={job.status}
                    onChange={(e) => handleStatusChange(job.job_id, e.target.value as JobStatus)}
                  >
                    <option value="Pending">Pending</option>
                    <option value="On progress">On progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Job Detail Modal */}
      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
        />
      )}
    </div>
  );
}

function JobDetailModal({ job, onClose }: { job: RegisteredJob; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [jobItems, setJobItems] = useState<(JobItem & { item_name?: string })[]>([]);
  const [allocations, setAllocations] = useState<DailyAllocation[]>([]);
  const [personnel, setPersonnel] = useState<Record<string, Personnel>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [jiRes, aRes] = await Promise.all([
        supabase.from('job_items').select('*, items:item_id(item_name)').eq('job_id', job.job_id),
        supabase.from('daily_allocations').select('*').eq('craft_lab_job_id', job.job_id).order('date'),
      ]);

      const items: (JobItem & { item_name?: string })[] = (jiRes.data || []).map((ji: Record<string, unknown>) => ({
        record_id: ji.record_id as string,
        job_id: ji.job_id as string,
        item_id: ji.item_id as string,
        qty: ji.qty as number,
        item_name: (ji.items as { item_name: string } | null)?.item_name,
      }));
      setJobItems(items);
      setAllocations(aRes.data || []);

      // Load personnel for the allocations
      const serNos = Array.from(new Set((aRes.data || []).map((a: DailyAllocation) => a.ser_no)));
      if (serNos.length > 0) {
        const { data: pData } = await supabase.from('personnel').select('*').in('ser_no', serNos);
        const pMap: Record<string, Personnel> = {};
        (pData || []).forEach((p: Personnel) => { pMap[p.ser_no] = p; });
        setPersonnel(pMap);
      }

      setLoading(false);
    })();
  }, [job.job_id]);

  // Calculate manpower days per person
  const manpowerDays = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of allocations) {
      map[a.ser_no] = (map[a.ser_no] || 0) + 1;
    }
    return map;
  }, [allocations]);

  const totalManpowerDays = Object.values(manpowerDays).reduce((a, b) => a + b, 0);

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{job.job_id}</h3>
            <p className="text-sm text-slate-500">{job.job_description || 'No description'}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-slate-900">{allocations.length}</p>
                <p className="text-xs text-slate-500 mt-0.5">Allocations</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-slate-900">{Object.keys(manpowerDays).length}</p>
                <p className="text-xs text-slate-500 mt-0.5">Personnel</p>
              </div>
              <div className="bg-teal-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-teal-600">{totalManpowerDays}</p>
                <p className="text-xs text-teal-600 mt-0.5">Manpower Days</p>
              </div>
            </div>

            {/* Materials */}
            {jobItems.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-slate-700 mb-2">Materials</h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left py-2 px-3 font-semibold text-slate-600">Item</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-600">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobItems.map((ji) => (
                        <tr key={ji.record_id} className="border-t border-slate-100">
                          <td className="py-2 px-3 text-slate-700">{ji.item_name || 'Unknown'}</td>
                          <td className="py-2 px-3 text-right font-medium text-slate-900">{ji.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Manpower breakdown */}
            <div>
              <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                Manpower Analysis
              </h4>
              {Object.keys(manpowerDays).length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">
                  No personnel allocated to this job yet.
                </p>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left py-2 px-3 font-semibold text-slate-600">Ser No</th>
                        <th className="text-left py-2 px-3 font-semibold text-slate-600">Name</th>
                        <th className="text-left py-2 px-3 font-semibold text-slate-600">Section</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-600">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(manpowerDays)
                        .sort(([a], [b]) => {
                          const pa = personnel[a];
                          const pb = personnel[b];
                          const rankDiff = getRankOrder(pa?.rank) - getRankOrder(pb?.rank);
                          if (rankDiff !== 0) return rankDiff;
                          return (pa?.name || a).localeCompare(pb?.name || b);
                        })
                        .map(([sn, days]) => {
                        const p = personnel[sn];
                        return (
                          <tr key={sn} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="py-2 px-3 font-medium text-slate-700">{sn}</td>
                            <td className="py-2 px-3 text-slate-600">{p ? personnelDisplayName(p) : '—'}</td>
                            <td className="py-2 px-3 text-slate-600">{p?.section || '—'}</td>
                            <td className="py-2 px-3 text-right font-bold text-teal-600">{days}</td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-slate-200 bg-slate-50">
                        <td colSpan={3} className="py-2 px-3 font-bold text-slate-700 text-right">Grand Total</td>
                        <td className="py-2 px-3 text-right font-bold text-teal-600">{totalManpowerDays}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
