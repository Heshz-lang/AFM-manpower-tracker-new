import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Item, RegisteredJob, JobStatus } from '@/types';
import { Loader2, Save, Plus, Trash2, X, Package } from 'lucide-react';

interface LineItem {
  item_id: string;
  qty: number;
}

export default function JobRegistration() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [jobId, setJobId] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [status, setStatus] = useState<JobStatus>('Pending');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  // Quick add item modal
  const [showItemModal, setShowItemModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [addingItem, setAddingItem] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('items').select('*').order('item_name');
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleAddItem = async () => {
    if (!newItemName.trim()) return;
    setAddingItem(true);
    const { data, error } = await supabase
      .from('items')
      .insert({ item_name: newItemName.trim() })
      .select()
      .single();

    setAddingItem(false);

    if (error) {
      setMsg({ type: 'error', text: error.message });
    } else if (data) {
      setItems((prev) => [...prev, data].sort((a, b) => a.item_name.localeCompare(b.item_name)));
      setNewItemName('');
      setShowItemModal(false);
    }
  };

  const handleAddLineItem = () => {
    setLineItems((prev) => [...prev, { item_id: '', qty: 1 }]);
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLineItemChange = (index: number, field: keyof LineItem, value: string | number) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobId.trim()) {
      setMsg({ type: 'error', text: 'Job ID is required.' });
      return;
    }

    setSaving(true);
    setMsg(null);

    // Check if job_id already exists
    const { data: existing } = await supabase
      .from('registered_jobs')
      .select('job_id')
      .eq('job_id', jobId.trim())
      .maybeSingle();

    if (existing) {
      setSaving(false);
      setMsg({ type: 'error', text: 'A job with this ID already exists.' });
      return;
    }

    const jobData: Partial<RegisteredJob> = {
      job_id: jobId.trim(),
      job_description: jobDescription.trim() || null,
      status,
    };

    const { error: jobError } = await supabase.from('registered_jobs').insert(jobData);

    if (jobError) {
      setSaving(false);
      setMsg({ type: 'error', text: jobError.message });
      return;
    }

    // Insert line items
    const validItems = lineItems.filter((li) => li.item_id && li.qty > 0);
    if (validItems.length > 0) {
      const jobItemsData = validItems.map((li) => ({
        job_id: jobId.trim(),
        item_id: li.item_id,
        qty: li.qty,
      }));

      const { error: itemsError } = await supabase.from('job_items').insert(jobItemsData);
      if (itemsError) {
        setSaving(false);
        setMsg({ type: 'error', text: `Job created, but items failed: ${itemsError.message}` });
        return;
      }
    }

    setSaving(false);
    setMsg({ type: 'success', text: `Job "${jobId.trim()}" registered successfully.` });
    setJobId('');
    setJobDescription('');
    setStatus('Pending');
    setLineItems([]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Job Registration</h2>
        <p className="text-slate-500 mt-1">Register a new production job with materials and line items.</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5">
        {/* Job Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="job_id">Job ID <span className="text-red-500">*</span></label>
            <input
              id="job_id"
              type="text"
              className="input-field"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              placeholder="Enter unique job ID"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="status">Status</label>
            <select
              id="status"
              className="select-field"
              value={status}
              onChange={(e) => setStatus(e.target.value as JobStatus)}
            >
              <option value="Pending">Pending</option>
              <option value="On progress">On progress</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="job_desc">Job Description / Name</label>
          <input
            id="job_desc"
            type="text"
            className="input-field"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Brief description of the job"
          />
        </div>

        {/* Line Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Materials / Line Items</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowItemModal(true)}
                className="text-xs font-medium text-teal-600 hover:text-teal-700 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add new item
              </button>
              <button
                type="button"
                onClick={handleAddLineItem}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add line item
              </button>
            </div>
          </div>

          {lineItems.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center">
              <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No materials added. Click "Add line item" to begin.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lineItems.map((li, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    className="select-field flex-1"
                    value={li.item_id}
                    onChange={(e) => handleLineItemChange(index, 'item_id', e.target.value)}
                  >
                    <option value="">Select item</option>
                    {items.map((item) => (
                      <option key={item.item_id} value={item.item_id}>{item.item_name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    className="input-field w-24"
                    value={li.qty}
                    onChange={(e) => handleLineItemChange(index, 'qty', parseInt(e.target.value) || 0)}
                    placeholder="Qty"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveLineItem(index)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary flex items-center gap-2" disabled={saving || !jobId.trim()}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Register Job'}
          </button>
          {msg && (
            <div className={`text-sm font-medium ${msg.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {msg.text}
            </div>
          )}
        </div>
      </form>

      {/* Quick Add Item Modal */}
      {showItemModal && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Add New Item</h3>
              <button
                onClick={() => { setShowItemModal(false); setNewItemName(''); }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              className="input-field mb-3"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Item name"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddItem(); } }}
            />
            <button
              onClick={handleAddItem}
              className="btn-primary w-full flex items-center justify-center gap-2"
              disabled={addingItem || !newItemName.trim()}
            >
              {addingItem ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {addingItem ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
