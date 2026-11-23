import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../shared/api/axiosInstance';
import { uploadService } from '../../../../shared/services/uploadService';

// ---- api ----------------------------------------------------------------------------------------
const body = (r) => r?.data?.data ?? r?.data ?? r;
export const errorOf = (e, fallback = 'Something went wrong') => e?.response?.data?.message || e?.message || fallback;

/** call('get', '/admin/events/types'). Resolves to the data; shows nothing on its own. */
export const call = async (method, url, payload, config) => {
  const r = method === 'get' || method === 'delete' ? await api[method](url, config) : await api[method](url, payload, config);
  return body(r);
};

/** Runs an action and toasts the result. Returns true on success. */
export const act = async (fn, ok) => {
  try { await fn(); if (ok) toast.success(ok); return true; } catch (e) { toast.error(errorOf(e)); return false; }
};

// ---- formatting ------------------------------------------------------------------------------------
export const rupees = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '-');
export const toLocalInput = (v) => {
  const d = v ? new Date(v) : null; if (!d || Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// ---- look ---------------------------------------------------------------------------------------------
export const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-yellow-400';
export const btnPrimary = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-40';
export const btnGhost = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40';
export const btnDanger = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-40';

const TONES = {
  requested: 'bg-amber-50 text-amber-700', assigned: 'bg-indigo-50 text-indigo-700', confirmed: 'bg-emerald-50 text-emerald-700', ongoing: 'bg-sky-50 text-sky-700',
  completed: 'bg-slate-100 text-slate-700', cancelled: 'bg-rose-50 text-rose-700', rejected: 'bg-rose-50 text-rose-700',
  pending: 'bg-amber-50 text-amber-700', approved: 'bg-emerald-50 text-emerald-700', inactive: 'bg-slate-100 text-slate-600', paid: 'bg-emerald-50 text-emerald-700', accepted: 'bg-emerald-50 text-emerald-700',
};
export const Badge = ({ value }) => (
  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${TONES[value] || 'bg-slate-100 text-slate-600'}`}>{String(value || '').replace('_', ' ')}</span>
);

export const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
    {children}
    {hint ? <span className="mt-1 block text-[11px] font-medium text-slate-400">{hint}</span> : null}
  </label>
);

export const Modal = ({ title, onClose, children, footer, wide = false }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
    <div className={`flex max-h-[92vh] w-full flex-col rounded-2xl bg-white shadow-2xl ${wide ? 'max-w-4xl' : 'max-w-xl'}`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <p className="text-base font-black text-slate-900">{title}</p>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">{children}</div>
      {footer ? <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div> : null}
    </div>
  </div>
);

export const Spinner = () => <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-300" /></div>;
export const Empty = ({ children }) => <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-400">{children}</div>;

export const Table = ({ head, children }) => (
  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
    <table className="w-full text-left text-[13px]">
      <thead><tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">{head.map((h) => <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{children}</tbody>
    </table>
  </div>
);

// ---- shared lists ----------------------------------------------------------------------------------------
export const useLoad = (loader, deps = []) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const reload = async () => {
    setLoading(true);
    try { setData(await loader()); } catch (e) { toast.error(errorOf(e, 'Could not load')); } finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);
  return { data, loading, reload, setData };
};

export const useZones = () => useLoad(() => call('get', '/admin/events/zones'));
export const useCategories = () => useLoad(() => call('get', '/admin/events/categories'));

// ---- page shell: the section's own tab bar ----------------------------------------------------------------------
const TABS = [
  ['/admin/events/bookings', 'Bookings'], ['/admin/events/types', 'Event types'], ['/admin/events/categories', 'Vehicle categories'], ['/admin/events/pricing', 'Pricing'],
  ['/admin/events/vehicles', 'Vehicles'], ['/admin/events/inventory', 'Inventory'], ['/admin/events/withdrawals', 'Withdrawals'], ['/admin/events/settings', 'Settings'],
];

export const Shell = ({ title, subtitle, actions, children }) => (
  <div className="min-h-screen bg-slate-50 px-4 py-4 font-sans md:px-6">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Event booking</p>
        <p className="text-xl font-black text-slate-900">{title}</p>
        {subtitle ? <p className="mt-0.5 text-xs font-medium text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="flex gap-2">{actions}</div>
    </div>
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
      {TABS.map(([to, label]) => (
        <NavLink key={to} to={to} className={({ isActive }) => `whitespace-nowrap border-b-2 px-3 py-2 text-xs font-bold ${isActive ? 'border-yellow-400 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>{label}</NavLink>
      ))}
    </div>
    {children}
  </div>
);

// ---- photo picker: the admin picks a file, it is uploaded and the stored address is kept ----------------------------
const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

/** value: array of image addresses. max: how many photos are allowed. */
export const ImageUpload = ({ value = [], onChange, max = 1, folder = 'events' }) => {
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, max - value.length));
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      const urls = [];
      for (const f of files) {
        if (!f.type.startsWith('image/')) throw new Error('Choose an image file');
        if (f.size > 6 * 1024 * 1024) throw new Error('Each photo must be under 6 MB');
        const out = await uploadService.uploadImage(await fileToDataUrl(f), folder);
        const url = out?.url || out?.data?.url;
        if (!url) throw new Error('Upload failed');
        urls.push(url);
      }
      onChange([...value, ...urls]);
    } catch (err) { toast.error(errorOf(err, 'Photo upload failed')); }
    setBusy(false);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {value.map((url, i) => (
        <div key={url} className="relative">
          <img src={url} alt="" className="h-20 w-28 rounded-lg border border-slate-200 object-cover" />
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-600 p-0.5 text-white" aria-label="Remove photo"><X size={12} /></button>
        </div>
      ))}
      {value.length < max ? (
        <label className="flex h-20 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-[11px] font-bold text-slate-500 hover:bg-slate-50">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <><span className="text-lg leading-none">+</span>Add photo</>}
          <input type="file" accept="image/*" multiple={max > 1} className="hidden" disabled={busy} onChange={pick} />
        </label>
      ) : null}
    </div>
  );
};
