import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Personnel, JobType, Item } from '@/types';
import { exportToCSV, parseCSV, personnelDisplayName, todayString, sortPersonnelByRank } from '@/lib/utils';
import {
  Loader2, Plus, Trash2, Edit2, X, Upload, Download, Users, Tag,
  Package, Settings, Save, FileUp,
} from 'lucide-react';

type AdminTab = 'personnel' | 'job-types' | 'items' | 'export';

export default function AdminPanel() {
  const [tab, setTab] = useState<AdminTab>('personnel');

  const tabs: { id: AdminTab; label: string; icon: typeof Users }[] = [
    { id: 'personnel', label: 'Personnel Roster', icon: Users },
    { id: 'job-types', label: 'Job Categories & Types', icon: Tag },
    { id: 'items', label: 'Item Master List', icon: Package },
    { id: 'export', label: 'Data Export', icon: Download },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Admin Panel</h2>
        <p className="text-slate-500 mt-1">Manage personnel, reference data, and exports.</p>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'personnel' && <PersonnelManager />}
      {tab === 'job-types' && <JobTypesManager />}
      {tab === 'items' && <ItemsManager />}
      {tab === 'export' && <DataExport />}
    </div>
  );
}

// ============================================
// Personnel Manager
// ============================================
function PersonnelManager() {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Personnel | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('personnel').select('*').order('name');
    setPersonnel(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (serNo: string) => {
    if (!confirm(`Delete personnel ${serNo}? This will also remove their allocation history.`)) return;
    await supabase.from('personnel').delete().eq('ser_no', serNo);
    load();
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportMsg('');

    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length < 2) {
      setImportMsg('CSV file appears to be empty or missing data rows.');
      setImporting(false);
      return;
    }

    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const serNoIdx = headers.findIndex((h) => h.includes('ser') || h === 'ser no' || h === 'ser_no');
    const rankIdx = headers.indexOf('rank');
    const nameIdx = headers.indexOf('name');
    const tradeIdx = headers.indexOf('trade');
    const sectionIdx = headers.indexOf('section');

    if (serNoIdx === -1 || nameIdx === -1) {
      setImportMsg('CSV must contain at least "Ser No" and "Name" columns.');
      setImporting(false);
      return;
    }

    const records: Partial<Personnel>[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const serNo = row[serNoIdx]?.trim();
      const name = row[nameIdx]?.trim();
      if (!serNo || !name) continue;
      records.push({
        ser_no: serNo,
        rank: rankIdx >= 0 ? row[rankIdx]?.trim() || null : null,
        name,
        trade: tradeIdx >= 0 ? row[tradeIdx]?.trim() || null : null,
        section: sectionIdx >= 0 ? row[sectionIdx]?.trim() || null : null,
        custom_attributes: {},
      });
    }

    if (records.length === 0) {
      setImportMsg('No valid records found in the CSV.');
      setImporting(false);
      return;
    }

    const { error } = await supabase.from('personnel').upsert(records, { onConflict: 'ser_no' });

    setImporting(false);
    if (error) {
      setImportMsg(`Import failed: ${error.message}`);
    } else {
      setImportMsg(`Successfully imported ${records.length} personnel records.`);
      load();
    }
    e.target.value = '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Personnel
        </button>
        <label className="btn-secondary flex items-center gap-2 cursor-pointer">
          <FileUp className="w-4 h-4" /> Import CSV
          <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFileImport} disabled={importing} />
        </label>
        {importing && <Loader2 className="w-4 h-4 text-teal-600 animate-spin" />}
        {importMsg && (
          <span className={`text-sm font-medium ${importMsg.includes('failed') || importMsg.includes('empty') || importMsg.includes('must') ? 'text-red-600' : 'text-emerald-600'}`}>
            {importMsg}
          </span>
        )}
      </div>

      {personnel.length === 0 ? (
        <div className="card text-center py-12">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No personnel yet. Add individually or import from CSV.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Ser No</th>
                <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Rank</th>
                <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Name</th>
                <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Trade</th>
                <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Section</th>
                <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Custom Attrs</th>
                <th className="text-right py-2.5 px-3 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortPersonnelByRank(personnel).map((p) => (
                <tr key={p.ser_no} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-3 font-medium text-slate-700">{p.ser_no}</td>
                  <td className="py-2 px-3 text-slate-600">{p.rank || '—'}</td>
                  <td className="py-2 px-3 text-slate-700">{personnelDisplayName(p)}</td>
                  <td className="py-2 px-3 text-slate-600">{p.trade || '—'}</td>
                  <td className="py-2 px-3 text-slate-600">{p.section || '—'}</td>
                  <td className="py-2 px-3">
                    {Object.keys(p.custom_attributes || {}).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(p.custom_attributes).slice(0, 3).map(([k, v]) => (
                          <span key={k} className="badge bg-blue-50 text-blue-600 text-xs">{k}: {v}</span>
                        ))}
                        {Object.keys(p.custom_attributes).length > 3 && (
                          <span className="text-xs text-slate-400">+{Object.keys(p.custom_attributes).length - 3} more</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">None</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => { setEditing(p); setShowForm(true); }}
                        className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(p.ser_no)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <PersonnelForm
          personnel={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

// ============================================
// Personnel Form (Add/Edit with Custom Attributes)
// ============================================
function PersonnelForm({
  personnel,
  onClose,
  onSaved,
}: {
  personnel: Personnel | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [serNo, setSerNo] = useState(personnel?.ser_no || '');
  const [rank, setRank] = useState(personnel?.rank || '');
  const [name, setName] = useState(personnel?.name || '');
  const [trade, setTrade] = useState(personnel?.trade || '');
  const [section, setSection] = useState(personnel?.section || '');
  const [photoUrl, setPhotoUrl] = useState(personnel?.photo_url || '');
  const [customAttrs, setCustomAttrs] = useState<Record<string, string>>(personnel?.custom_attributes || {});
  const [newAttrKey, setNewAttrKey] = useState('');
  const [newAttrVal, setNewAttrVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleAddAttr = () => {
    if (!newAttrKey.trim()) return;
    setCustomAttrs((prev) => ({ ...prev, [newAttrKey.trim()]: newAttrVal.trim() }));
    setNewAttrKey('');
    setNewAttrVal('');
  };

  const handleRemoveAttr = (key: string) => {
    setCustomAttrs((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const handleSave = async () => {
    if (!serNo.trim() || !name.trim()) {
      setError('Ser No and Name are required.');
      return;
    }

    setSaving(true);
    setError('');

    const data: Partial<Personnel> = {
      ser_no: serNo.trim(),
      rank: rank.trim() || null,
      name: name.trim(),
      trade: trade.trim() || null,
      section: section.trim() || null,
      photo_url: photoUrl.trim() || null,
      custom_attributes: customAttrs,
    };

    const { error: err } = await supabase.from('personnel').upsert(data, { onConflict: 'ser_no' });

    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      onSaved();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            {personnel ? 'Edit Personnel' : 'Add Personnel'}
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Ser No <span className="text-red-500">*</span></label>
              <input className="input-field" value={serNo} onChange={(e) => setSerNo(e.target.value)} disabled={!!personnel} />
            </div>
            <div>
              <label className="label">Rank</label>
              <input className="input-field" value={rank} onChange={(e) => setRank(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Name <span className="text-red-500">*</span></label>
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Trade</label>
              <input className="input-field" value={trade} onChange={(e) => setTrade(e.target.value)} />
            </div>
            <div>
              <label className="label">Section</label>
              <input className="input-field" value={section} onChange={(e) => setSection(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Photo URL</label>
            <input className="input-field" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://..." />
          </div>

          {/* Custom Attributes */}
          <div>
            <label className="label">Custom Attributes (JSONB)</label>
            <div className="space-y-2 mb-2">
              {Object.entries(customAttrs).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600 w-28 truncate">{k}</span>
                  <span className="text-xs text-slate-700 flex-1">{v}</span>
                  <button
                    onClick={() => handleRemoveAttr(k)}
                    className="p-1 text-red-400 hover:text-red-600 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                className="input-field flex-1"
                placeholder="Attribute name (e.g. Combat status)"
                value={newAttrKey}
                onChange={(e) => setNewAttrKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddAttr(); } }}
              />
              <input
                className="input-field flex-1"
                placeholder="Value (e.g. Combat)"
                value={newAttrVal}
                onChange={(e) => setNewAttrVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddAttr(); } }}
              />
              <button onClick={handleAddAttr} className="btn-secondary px-3">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex items-center gap-2" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Job Types Manager
// ============================================
function JobTypesManager() {
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);
  const [loading, setLoading] = useState(true);
  const [newType, setNewType] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('job_types').select('*').order('category, type');
    setJobTypes(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newType.trim() || !newCategory.trim()) return;
    const { error } = await supabase.from('job_types').insert({
      type: newType.trim(),
      category: newCategory.trim(),
    });
    if (error) {
      setMsg(`Error: ${error.message}`);
    } else {
      setNewType('');
      setNewCategory('');
      setMsg('');
      load();
    }
  };

  const handleDelete = async (type: string) => {
    if (!confirm(`Delete job type "${type}"?`)) return;
    await supabase.from('job_types').delete().eq('type', type);
    load();
  };

  const grouped = jobTypes.reduce<Record<string, string[]>>((acc, jt) => {
    if (!acc[jt.category]) acc[jt.category] = [];
    acc[jt.category].push(jt.type);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add new */}
      <div className="card">
        <h3 className="text-sm font-bold text-slate-700 mb-3">Add Job Type</h3>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="label">Type Name</label>
            <input className="input-field" value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="e.g. Guard_duty" />
          </div>
          <div className="flex-1">
            <label className="label">Category</label>
            <input className="input-field" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="e.g. Security duty" />
          </div>
          <button onClick={handleAdd} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        {msg && <p className="text-sm text-red-600 mt-2">{msg}</p>}
      </div>

      {/* List */}
      <div className="space-y-3">
        {Object.entries(grouped).map(([cat, types]) => (
          <div key={cat} className="card">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-bold text-slate-700">{cat}</h4>
              <span className="badge bg-slate-100 text-slate-600">{types.length} types</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {types.map((t) => (
                <div key={t} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                  <span className="text-sm text-slate-700">{t}</span>
                  <button
                    onClick={() => handleDelete(t)}
                    className="p-0.5 text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Items Manager
// ============================================
function ItemsManager() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('items').select('*').order('item_name');
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const { data, error } = await supabase.from('items').insert({ item_name: newName.trim() }).select().single();
    if (!error && data) {
      setItems((prev) => [...prev, data].sort((a, b) => a.item_name.localeCompare(b.item_name)));
      setNewName('');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    await supabase.from('items').delete().eq('item_id', id);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="text-sm font-bold text-slate-700 mb-3">Add Item</h3>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="label">Item Name</label>
            <input
              className="input-field"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Aluminium sheet 2mm"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
            />
          </div>
          <button onClick={handleAdd} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card text-center py-12">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No items yet. Add raw materials or parts above.</p>
        </div>
      ) : (
        <div className="card">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {items.map((item) => (
              <div key={item.item_id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <span className="text-sm text-slate-700">{item.item_name}</span>
                <button
                  onClick={() => handleDelete(item.item_id)}
                  className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Data Export
// ============================================
function DataExport() {
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState('');

  const handleExportMonth = async () => {
    setExporting(true);
    setMsg('');

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const dateFrom = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const dateTo = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('daily_allocations')
      .select('*')
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date, ser_no');

    if (error) {
      setMsg(`Export failed: ${error.message}`);
      setExporting(false);
      return;
    }

    if (!data || data.length === 0) {
      setMsg('No allocation data found for the current month.');
      setExporting(false);
      return;
    }

    const rows = data.map((a) => ({
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

    exportToCSV(`monthly_allocations_${year}_${String(month + 1).padStart(2, '0')}.csv`, rows);
    setMsg(`Exported ${rows.length} allocation records for ${now.toLocaleString('default', { month: 'long', year: 'numeric' })}.`);
    setExporting(false);
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
            <Download className="w-6 h-6 text-teal-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-900">Export Monthly Allocations</h3>
            <p className="text-sm text-slate-500 mt-1 mb-3">
              Download the current month's complete allocation data as a CSV file. This includes all personnel allocations with dates, job types, categories, and remarks.
            </p>
            <button
              onClick={handleExportMonth}
              className="btn-primary flex items-center gap-2"
              disabled={exporting}
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {exporting ? 'Exporting...' : 'Export Current Month'}
            </button>
            {msg && <p className="text-sm mt-3 font-medium text-slate-700">{msg}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
