import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { Personnel, JobType, RegisteredJob, DailyAllocation } from '@/types';
import { PRODUCTION_TYPES } from '@/types';
import type { Role } from '@/App';
import { todayString, getUnallocatedDates, personnelDisplayName, sortPersonnelByRank } from '@/lib/utils';
import { AlertCircle, CheckCircle2, Loader2, Save, Pencil, X, Plus, History } from 'lucide-react';

type Mode = 'new' | 'edit';

export default function AllocationForm({ role }: { role: Role }) {
  const [mode, setMode] = useState<Mode>('new');
  const isAdmin = role === 'admin';

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Daily Manpower Allocation</h2>
        <p className="text-slate-500 mt-1">
          {isAdmin
            ? 'Assign new allocations or edit existing records. Admin can modify past data.'
            : 'Assign a job duty to personnel for a specific date.'}
        </p>
      </div>

      {isAdmin && (
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit mb-6">
          <button
            onClick={() => setMode('new')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              mode === 'new' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Plus className="w-4 h-4" />
            New Entry
          </button>
          <button
            onClick={() => setMode('edit')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              mode === 'edit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <History className="w-4 h-4" />
            Edit Allocations
          </button>
        </div>
      )}

      {mode === 'new' ? <NewAllocationForm isAdmin={isAdmin} /> : <EditAllocationsPanel />}
    </div>
  );
}

// ============================================
// New Allocation Form
// ============================================
function NewAllocationForm({ isAdmin }: { isAdmin: boolean }) {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);
  const [activeJobs, setActiveJobs] = useState<RegisteredJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const today = todayString();
  const [date, setDate] = useState(today);
  const [serNo, setSerNo] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<Personnel | null>(null);
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [craftLabJobId, setCraftLabJobId] = useState('');
  const [remarks, setRemarks] = useState('');

  const [validationError, setValidationError] = useState('');
  const [validationOk, setValidationOk] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [pRes, jtRes, jRes] = await Promise.all([
      supabase.from('personnel').select('*').order('name'),
      supabase.from('job_types').select('*').order('category, type'),
      supabase.from('registered_jobs').select('*').in('status', ['Pending', 'On progress']).order('job_id'),
    ]);
    setPersonnel(pRes.data || []);
    setJobTypes(jtRes.data || []);
    setActiveJobs(jRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Non-admin users cannot select past dates
  useEffect(() => {
    if (!isAdmin && date < today) {
      setDate(today);
    }
  }, [isAdmin, date, today]);

  // Auto-populate person details
  useEffect(() => {
    if (serNo) {
      const p = personnel.find((x) => x.ser_no === serNo);
      setSelectedPerson(p || null);
    } else {
      setSelectedPerson(null);
    }
    setValidationError('');
    setValidationOk(false);
  }, [serNo, personnel]);

  // Auto-populate category from type
  useEffect(() => {
    if (type) {
      const jt = jobTypes.find((x) => x.type === type);
      setCategory(jt?.category || '');
    } else {
      setCategory('');
    }
    if (!PRODUCTION_TYPES.includes(type)) {
      setCraftLabJobId('');
    }
  }, [type, jobTypes]);

  // Validation: check existing allocation + missing past days
  useEffect(() => {
    if (!serNo || !date) return;
    let cancelled = false;

    (async () => {
      const { data: existing } = await supabase
        .from('daily_allocations')
        .select('allocation_id')
        .eq('ser_no', serNo)
        .eq('date', date)
        .maybeSingle();

      if (cancelled) return;

      if (existing) {
        setValidationError(`This person is already allocated for ${date}. Only one allocation per day is allowed.`);
        setValidationOk(false);
        return;
      }

      const { data: allAllocs } = await supabase
        .from('daily_allocations')
        .select('date')
        .eq('ser_no', serNo)
        .order('date', { ascending: true });

      if (cancelled) return;

      const allocatedDates = new Set((allAllocs || []).map((a) => a.date));
      const lastRecorded = allAllocs && allAllocs.length > 0 ? allAllocs[allAllocs.length - 1].date : null;
      const missing = getUnallocatedDates(lastRecorded, date, allocatedDates);

      if (missing.length > 0) {
        setValidationError(
          `Cannot allocate for ${date}. Please complete unallocated past date records for this person first. Missing dates: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` ... (${missing.length} total)` : ''}`
        );
        setValidationOk(false);
      } else {
        setValidationError('');
        setValidationOk(true);
      }
    })();

    return () => { cancelled = true; };
  }, [serNo, date]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validationError) return;
    if (!serNo || !date || !type || !selectedPerson) return;

    if (PRODUCTION_TYPES.includes(type) && !craftLabJobId) {
      setSubmitMsg({ type: 'error', text: 'Please select a Craft Lab Production job.' });
      return;
    }

    setSaving(true);
    setSubmitMsg(null);

    const insertData: Partial<DailyAllocation> = {
      date,
      ser_no: serNo,
      rank: selectedPerson.rank,
      name: selectedPerson.name,
      trade: selectedPerson.trade,
      section: selectedPerson.section,
      type,
      category,
      remarks: remarks || null,
      craft_lab_job_id: PRODUCTION_TYPES.includes(type) ? craftLabJobId : null,
    };

    const { error } = await supabase.from('daily_allocations').insert(insertData);

    setSaving(false);

    if (error) {
      if (error.code === '23505') {
        setSubmitMsg({ type: 'error', text: 'This person is already allocated for this date.' });
      } else {
        setSubmitMsg({ type: 'error', text: error.message });
      }
    } else {
      setSubmitMsg({ type: 'success', text: 'Allocation saved successfully.' });
      setSerNo('');
      setType('');
      setRemarks('');
      setCraftLabJobId('');
      setValidationOk(false);
    }
  };

  const groupedTypes = jobTypes.reduce<Record<string, string[]>>((acc, jt) => {
    if (!acc[jt.category]) acc[jt.category] = [];
    acc[jt.category].push(jt.type);
    return acc;
  }, {});

  const showCraftLab = PRODUCTION_TYPES.includes(type);
  const sortedPersonnel = sortPersonnelByRank(personnel);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <form onSubmit={handleSubmit} className="card space-y-5">
        {/* Date */}
        <div>
          <label className="label" htmlFor="date">Date <span className="text-red-500">*</span></label>
          <input
            id="date"
            type="date"
            className="input-field"
            value={date}
            min={isAdmin ? undefined : today}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          {!isAdmin && (
            <p className="text-xs text-slate-400 mt-1">Regular users can only allocate for today or future dates.</p>
          )}
        </div>

        {/* Personnel Selector */}
        <div>
          <label className="label" htmlFor="ser_no">Personnel <span className="text-red-500">*</span></label>
          <select
            id="ser_no"
            className="select-field"
            value={serNo}
            onChange={(e) => setSerNo(e.target.value)}
            required
          >
            <option value="">Select personnel by Ser No / Name</option>
            {sortedPersonnel.map((p) => (
              <option key={p.ser_no} value={p.ser_no}>
                {p.ser_no} — {personnelDisplayName(p)}
              </option>
            ))}
          </select>
        </div>

        {/* Auto-populated fields */}
        {selectedPerson && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Rank</p>
              <p className="text-sm text-slate-900 mt-0.5">{selectedPerson.rank || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Name</p>
              <p className="text-sm text-slate-900 mt-0.5">{selectedPerson.name}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Trade</p>
              <p className="text-sm text-slate-900 mt-0.5">{selectedPerson.trade || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Section</p>
              <p className="text-sm text-slate-900 mt-0.5">{selectedPerson.section || '—'}</p>
            </div>
          </div>
        )}

        {/* Validation Banner */}
        {validationError && (
          <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{validationError}</p>
          </div>
        )}
        {validationOk && serNo && date && (
          <div className="flex items-start gap-2.5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-700">No conflicts detected. This person can be allocated for {date}.</p>
          </div>
        )}

        {/* Duty Type Selection */}
        <div>
          <label className="label" htmlFor="type">Duty Type <span className="text-red-500">*</span></label>
          <select
            id="type"
            className="select-field"
            value={type}
            onChange={(e) => setType(e.target.value)}
            required
          >
            <option value="">Select duty type</option>
            {Object.entries(groupedTypes).map(([cat, types]) => (
              <optgroup key={cat} label={cat}>
                {types.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Auto-populated Category */}
        {category && (
          <div>
            <label className="label">Category (auto-filled)</label>
            <div className="px-3.5 py-2.5 bg-slate-100 rounded-lg text-sm text-slate-700 font-medium">
              {category}
            </div>
          </div>
        )}

        {/* Dynamic Craft Lab Selector */}
        {showCraftLab && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <label className="label" htmlFor="craft_lab">
              Craft Lab Production <span className="text-red-500">*</span>
            </label>
            <select
              id="craft_lab"
              className="select-field"
              value={craftLabJobId}
              onChange={(e) => setCraftLabJobId(e.target.value)}
              required={showCraftLab}
            >
              <option value="">Select active production job</option>
              {activeJobs.map((j) => (
                <option key={j.job_id} value={j.job_id}>
                  {j.job_id} — {j.job_description || 'No description'} ({j.status})
                </option>
              ))}
            </select>
            <p className="text-xs text-amber-700 mt-1.5">
              Only jobs with status "Pending" or "On progress" are shown.
            </p>
          </div>
        )}

        {/* Remarks */}
        <div>
          <label className="label" htmlFor="remarks">Job Description / Remarks</label>
          <textarea
            id="remarks"
            className="input-field min-h-[80px] resize-y"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Optional remarks or job description..."
          />
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="btn-primary flex items-center gap-2"
            disabled={saving || !!validationError || !serNo || !date || !type}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : 'Save Allocation'}
          </button>
          {submitMsg && (
            <div
              className={`text-sm font-medium ${
                submitMsg.type === 'success' ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {submitMsg.text}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

// ============================================
// Edit Allocations Panel (Admin only)
// ============================================
function EditAllocationsPanel() {
  const [allocations, setAllocations] = useState<DailyAllocation[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);
  const [activeJobs, setActiveJobs] = useState<RegisteredJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState('');
  const [filterSerNo, setFilterSerNo] = useState('');
  const [editing, setEditing] = useState<DailyAllocation | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [aRes, pRes, jtRes, jRes] = await Promise.all([
      supabase.from('daily_allocations').select('*').order('date', { ascending: false }).limit(200),
      supabase.from('personnel').select('*').order('name'),
      supabase.from('job_types').select('*').order('category, type'),
      supabase.from('registered_jobs').select('*').order('job_id'),
    ]);
    setAllocations(aRes.data || []);
    setPersonnel(pRes.data || []);
    setJobTypes(jtRes.data || []);
    setActiveJobs(jRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredAllocations = useMemo(() => {
    return allocations.filter((a) => {
      if (filterDate && a.date !== filterDate) return false;
      if (filterSerNo && a.ser_no !== filterSerNo) return false;
      return true;
    });
  }, [allocations, filterDate, filterSerNo]);

  const sortedPersonnel = sortPersonnelByRank(personnel);

  const handleDelete = async (allocationId: string) => {
    if (!confirm('Delete this allocation record? This cannot be undone.')) return;
    const { error } = await supabase.from('daily_allocations').delete().eq('allocation_id', allocationId);
    if (error) {
      alert(`Delete failed: ${error.message}`);
    } else {
      setAllocations((prev) => prev.filter((a) => a.allocation_id !== allocationId));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card flex flex-wrap items-center gap-3 py-4">
        <div>
          <label className="label">Filter by Date</label>
          <input
            type="date"
            className="input-field max-w-[180px]"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Filter by Personnel</label>
          <select
            className="select-field max-w-[260px]"
            value={filterSerNo}
            onChange={(e) => setFilterSerNo(e.target.value)}
          >
            <option value="">All Personnel</option>
            {sortedPersonnel.map((p) => (
              <option key={p.ser_no} value={p.ser_no}>
                {p.ser_no} — {personnelDisplayName(p)}
              </option>
            ))}
          </select>
        </div>
        {(filterDate || filterSerNo) && (
          <button
            onClick={() => { setFilterDate(''); setFilterSerNo(''); }}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <X className="w-4 h-4" /> Clear
          </button>
        )}
        <div className="ml-auto text-sm text-slate-500">
          {filteredAllocations.length} record{filteredAllocations.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Allocation Table */}
      {filteredAllocations.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-slate-500">No allocation records found matching the filters.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Date</th>
                <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Ser No</th>
                <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Name</th>
                <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Type</th>
                <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Category</th>
                <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Craft Lab Job</th>
                <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Remarks</th>
                <th className="text-right py-2.5 px-3 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAllocations.map((a) => (
                <tr key={a.allocation_id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-3 font-medium text-slate-700">{a.date}</td>
                  <td className="py-2 px-3 text-slate-600">{a.ser_no}</td>
                  <td className="py-2 px-3 text-slate-700">{a.name || '—'}</td>
                  <td className="py-2 px-3 text-slate-700">{a.type}</td>
                  <td className="py-2 px-3 text-slate-600">{a.category || '—'}</td>
                  <td className="py-2 px-3 text-slate-600">{a.craft_lab_job_id || '—'}</td>
                  <td className="py-2 px-3 text-slate-500 max-w-[200px] truncate">{a.remarks || '—'}</td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditing(a)}
                        className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(a.allocation_id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditAllocationModal
          allocation={editing}
          jobTypes={jobTypes}
          activeJobs={activeJobs}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}

// ============================================
// Edit Allocation Modal (Admin only)
// ============================================
function EditAllocationModal({
  allocation,
  jobTypes,
  activeJobs,
  onClose,
  onSaved,
}: {
  allocation: DailyAllocation;
  jobTypes: JobType[];
  activeJobs: RegisteredJob[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(allocation.date);
  const [type, setType] = useState(allocation.type);
  const [category, setCategory] = useState(allocation.category || '');
  const [craftLabJobId, setCraftLabJobId] = useState(allocation.craft_lab_job_id || '');
  const [remarks, setRemarks] = useState(allocation.remarks || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const groupedTypes = useMemo(() => {
    return jobTypes.reduce<Record<string, string[]>>((acc, jt) => {
      if (!acc[jt.category]) acc[jt.category] = [];
      acc[jt.category].push(jt.type);
      return acc;
    }, {});
  }, [jobTypes]);

  const showCraftLab = PRODUCTION_TYPES.includes(type);

  useEffect(() => {
    if (type) {
      const jt = jobTypes.find((x) => x.type === type);
      setCategory(jt?.category || '');
    } else {
      setCategory('');
    }
    if (!PRODUCTION_TYPES.includes(type)) {
      setCraftLabJobId('');
    }
  }, [type, jobTypes]);

  const handleSave = async () => {
    if (!date || !type) {
      setError('Date and Duty Type are required.');
      return;
    }

    if (showCraftLab && !craftLabJobId) {
      setError('Please select a Craft Lab Production job.');
      return;
    }

    setSaving(true);
    setError('');

    const updateData: Partial<DailyAllocation> = {
      date,
      type,
      category,
      remarks: remarks || null,
      craft_lab_job_id: showCraftLab ? craftLabJobId : null,
    };

    const { error: err } = await supabase
      .from('daily_allocations')
      .update(updateData)
      .eq('allocation_id', allocation.allocation_id);

    setSaving(false);
    if (err) {
      if (err.code === '23505') {
        setError('This person already has an allocation for the selected date.');
      } else {
        setError(err.message);
      }
    } else {
      onSaved();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Edit Allocation</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {allocation.ser_no} — {allocation.name} | Original date: {allocation.date}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Date */}
          <div>
            <label className="label">Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              className="input-field"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Duty Type */}
          <div>
            <label className="label">Duty Type <span className="text-red-500">*</span></label>
            <select
              className="select-field"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">Select duty type</option>
              {Object.entries(groupedTypes).map(([cat, types]) => (
                <optgroup key={cat} label={cat}>
                  {types.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Category (auto-filled) */}
          {category && (
            <div>
              <label className="label">Category (auto-filled)</label>
              <div className="px-3.5 py-2.5 bg-slate-100 rounded-lg text-sm text-slate-700 font-medium">
                {category}
              </div>
            </div>
          )}

          {/* Craft Lab Selector */}
          {showCraftLab && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <label className="label">Craft Lab Production <span className="text-red-500">*</span></label>
              <select
                className="select-field"
                value={craftLabJobId}
                onChange={(e) => setCraftLabJobId(e.target.value)}
              >
                <option value="">Select production job</option>
                {activeJobs.map((j) => (
                  <option key={j.job_id} value={j.job_id}>
                    {j.job_id} — {j.job_description || 'No description'} ({j.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Remarks */}
          <div>
            <label className="label">Job Description / Remarks</label>
            <textarea
              className="input-field min-h-[80px] resize-y"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional remarks or job description..."
            />
          </div>

          {error && (
            <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex items-center gap-2" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
