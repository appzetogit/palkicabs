import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Camera, Loader2, MapPin, Phone, Plus, Trash2, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../shared/api/axiosInstance';
import { uploadService } from '../../../../shared/services/uploadService';
import { getLocalDriverToken } from '../../services/registrationService';

const unwrap = (r) => r?.data?.data ?? r?.data ?? r ?? {};
const errMsg = (e, f = 'Something went wrong') => e?.response?.data?.message || e?.message || f;
const rupees = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '-');
const auth = () => ({ headers: { Authorization: `Bearer ${getLocalDriverToken()}` } });
const get = (url) => api.get(url, auth()).then(unwrap);
const send = (method, url, body) => api[method](url, ...(method === 'delete' ? [auth()] : [body, auth()])).then(unwrap);

const TONE = {
  pending: 'bg-amber-50 text-amber-700', approved: 'bg-emerald-50 text-emerald-700', rejected: 'bg-rose-50 text-rose-700', inactive: 'bg-slate-100 text-slate-600',
  accepted: 'bg-emerald-50 text-emerald-700', confirmed: 'bg-emerald-50 text-emerald-700', assigned: 'bg-indigo-50 text-indigo-700', ongoing: 'bg-sky-50 text-sky-700', completed: 'bg-slate-100 text-slate-700',
  paid: 'bg-emerald-50 text-emerald-700',
};
const Pill = ({ value }) => <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${TONE[value] || 'bg-slate-100 text-slate-600'}`}>{value}</span>;
const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-slate-900';
const Label = ({ children }) => <p className="mb-1 text-[11px] font-black uppercase tracking-wider text-slate-500">{children}</p>;

// ---- jobs ------------------------------------------------------------------------------------------------------
const Jobs = () => {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState('');
  const load = useCallback(() => get('/drivers/events/assignments').then((d) => setRows(Array.isArray(d) ? d : [])).catch((e) => { toast.error(errMsg(e)); setRows([]); }), []);
  useEffect(() => { load(); }, [load]);

  const trip = async (a, kind) => {
    const sure = kind === 'start' ? 'Start the trip now? The time is recorded and the customer is told.' : 'End the trip now? The time is recorded and used to work out any extra time charge.';
    if (!window.confirm(sure)) return;
    setBusy(a.assignmentId);
    try { await send('post', `/drivers/events/assignments/${a.assignmentId}/${kind}`); toast.success(kind === 'start' ? 'Trip started' : 'Trip ended'); await load(); } catch (e) { toast.error(errMsg(e)); }
    setBusy('');
  };

  const respond = async (a, accept) => {
    if (!accept && !window.confirm('Decline this event? The admin will assign another vehicle.')) return;
    setBusy(a.assignmentId);
    try { await send('post', `/drivers/events/assignments/${a.assignmentId}/respond`, { accept }); toast.success(accept ? 'Accepted' : 'Declined'); await load(); } catch (e) { toast.error(errMsg(e)); }
    setBusy('');
  };

  if (!rows) return <Spin />;
  if (!rows.length) return <Empty text="No event jobs yet. When the admin assigns your vehicle to an event, it shows up here." />;
  return rows.map((a) => (
    <div key={a.assignmentId} className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div><p className="text-base font-black text-slate-900">{a.eventTypeName}</p><p className="text-xs font-semibold text-slate-500">{a.bookingCode} · {a.vehicle.name} {a.vehicle.number}</p></div>
        <Pill value={a.driverStatus === 'pending' ? 'assigned' : a.bookingStatus} />
      </div>
      <p className="flex items-center gap-1.5 text-xs font-bold text-slate-600"><CalendarDays size={13} /> {when(a.startAt)} to {when(a.endAt)} · {a.days} day(s)</p>
      <div className="space-y-1 text-xs font-semibold text-slate-600">
        <p className="flex gap-1.5"><MapPin size={13} className="mt-0.5 shrink-0 text-emerald-500" /> {a.pickup?.address}</p>
        <p className="flex gap-1.5"><MapPin size={13} className="mt-0.5 shrink-0 text-rose-500" /> {a.drop?.address}</p>
        <p className="text-slate-400">{a.tripKm} km for the whole trip</p>
      </div>
      {a.customer ? <a href={`tel:${a.customer.phone}`} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-800"><Phone size={14} /> {a.customer.name} · {a.customer.phone}</a> : null}
      <div className="flex items-center justify-between border-t border-slate-50 pt-3">
        <p className="text-sm font-black text-slate-900">You earn {rupees(a.earning)} {a.settled ? <span className="text-emerald-600">· added to wallet</span> : null}</p>
      </div>
      {a.tripStartedAt ? (
        <p className="rounded-xl bg-sky-50 p-3 text-xs font-bold text-sky-800">
          Started {when(a.tripStartedAt)}{a.tripEndedAt ? ` · Ended ${when(a.tripEndedAt)} · ${((new Date(a.tripEndedAt) - new Date(a.tripStartedAt)) / 3600000).toFixed(1)} h` : ' · running'}
        </p>
      ) : null}
      {a.canStart ? <button type="button" disabled={busy === a.assignmentId} onClick={() => trip(a, 'start')} className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-black text-white disabled:opacity-40">Start trip</button> : null}
      {a.canEnd ? <button type="button" disabled={busy === a.assignmentId} onClick={() => trip(a, 'end')} className="w-full rounded-xl bg-rose-600 py-3 text-sm font-black text-white disabled:opacity-40">End trip</button> : null}
      {a.driverStatus === 'accepted' && ['confirmed', 'ongoing'].includes(a.bookingStatus) && !a.tripStartedAt && !a.canStart ? <p className="text-xs font-semibold text-slate-500">You can start the trip on the day of the event.</p> : null}
      {a.driverStatus === 'pending' && ['assigned', 'confirmed'].includes(a.bookingStatus) ? (
        <div className="flex gap-3">
          <button type="button" disabled={busy === a.assignmentId} onClick={() => respond(a, false)} className="rounded-xl border border-rose-200 px-5 py-2.5 text-sm font-black text-rose-600 disabled:opacity-40">Decline</button>
          <button type="button" disabled={busy === a.assignmentId} onClick={() => respond(a, true)} className="flex-1 rounded-xl bg-slate-900 py-2.5 text-sm font-black text-white disabled:opacity-40">Accept</button>
        </div>
      ) : null}
    </div>
  ));
};

// ---- vehicles ----------------------------------------------------------------------------------------------------
const BLANK = { zoneId: '', categoryId: '', name: '', vehicleNumber: '', color: '', seats: 4, image: '' };

const Vehicles = () => {
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState({ categories: [], zones: [] });
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => get('/drivers/events/vehicles').then((d) => setRows(Array.isArray(d) ? d : [])).catch((e) => { toast.error(errMsg(e)); setRows([]); }), []);
  useEffect(() => { load(); get('/drivers/events/meta').then(setMeta).catch(() => {}); }, [load]);

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      const out = await uploadService.uploadImage(base64, 'event-vehicle');
      const url = out?.url || out?.data?.url;
      if (!url) throw new Error('Upload failed');
      setForm((f) => ({ ...f, image: url }));
    } catch (e) { toast.error(errMsg(e, 'Photo upload failed')); }
    setUploading(false);
  };

  const save = async () => {
    setSaving(true);
    const body = { ...form, images: form.image ? [form.image] : [] };
    try {
      if (form._id) await send('patch', `/drivers/events/vehicles/${form._id}`, body); else await send('post', '/drivers/events/vehicles', body);
      toast.success('Sent to the admin for approval');
      setForm(null); await load();
    } catch (e) { toast.error(errMsg(e)); }
    setSaving(false);
  };
  const remove = async (v) => {
    if (!window.confirm(`Remove ${v.name}?`)) return;
    try { await send('delete', `/drivers/events/vehicles/${v._id}`); toast.success('Removed'); await load(); } catch (e) { toast.error(errMsg(e)); }
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (form) {
    return (
      <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-base font-black text-slate-900">{form._id ? 'Edit vehicle' : 'Add a vehicle for events'}</p>
        <div><Label>City / zone</Label><select className={inputCls} value={form.zoneId} onChange={set('zoneId')}><option value="">Choose</option>{meta.zones.map((z) => <option key={z._id} value={z._id}>{z.name}</option>)}</select></div>
        <div><Label>Vehicle type</Label><select className={inputCls} value={form.categoryId} onChange={set('categoryId')}><option value="">Choose</option>{meta.categories.map((c) => <option key={c._id} value={c._id}>{c.name} ({c.seats} seats)</option>)}</select></div>
        <div><Label>Vehicle name</Label><input className={inputCls} placeholder="Toyota Innova Crysta" value={form.name} onChange={set('name')} /></div>
        <div><Label>Vehicle number</Label><input className={inputCls} placeholder="MP09AB1234" value={form.vehicleNumber} onChange={set('vehicleNumber')} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Colour</Label><input className={inputCls} value={form.color} onChange={set('color')} /></div>
          <div><Label>Seats</Label><input type="number" className={inputCls} value={form.seats} onChange={set('seats')} /></div>
        </div>
        <div>
          <Label>Photo</Label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3 text-sm font-bold text-slate-600">
            {form.image ? <img src={form.image} alt="" className="h-14 w-20 rounded-lg object-cover" /> : <Camera size={20} />}
            {uploading ? 'Uploading…' : form.image ? 'Change photo' : 'Add a photo'}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        </div>
        <p className="text-xs font-semibold text-slate-500">The admin checks every vehicle before it can get event bookings.</p>
        <div className="flex gap-3">
          <button type="button" onClick={() => setForm(null)} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700">Cancel</button>
          <button type="button" disabled={saving || uploading || !form.zoneId || !form.categoryId || !form.name || !form.vehicleNumber} onClick={save} className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white disabled:opacity-40">{saving ? 'Saving…' : 'Submit'}</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setForm({ ...BLANK })} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-sm font-black text-white"><Plus size={16} /> Add a vehicle</button>
      {!rows ? <Spin /> : !rows.length ? <Empty text="You have not added a vehicle for events yet. You can add as many as you own." /> : rows.map((v) => (
        <div key={v._id} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
          {v.images?.[0] ? <img src={v.images[0]} alt="" className="h-14 w-20 rounded-lg object-cover" /> : <div className="h-14 w-20 rounded-lg bg-slate-100" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-slate-900">{v.name}</p>
            <p className="text-xs font-semibold text-slate-500">{v.vehicleNumber} · {v.categoryId?.name} · {v.zoneId?.name}</p>
            <div className="mt-1 flex items-center gap-2"><Pill value={v.status} />{v.status === 'rejected' && v.rejectionReason ? <span className="truncate text-[11px] font-semibold text-rose-500">{v.rejectionReason}</span> : null}</div>
          </div>
          <div className="flex flex-col gap-1.5">
            <button type="button" onClick={() => setForm({ _id: v._id, zoneId: v.zoneId?._id, categoryId: v.categoryId?._id, name: v.name, vehicleNumber: v.vehicleNumber, color: v.color, seats: v.seats, image: v.images?.[0] || '' })} className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-bold">Edit</button>
            <button type="button" onClick={() => remove(v)} className="rounded-lg border border-rose-200 p-1.5 text-rose-500" aria-label="Remove"><Trash2 size={13} /></button>
          </div>
        </div>
      ))}
    </>
  );
};

// ---- earnings ----------------------------------------------------------------------------------------------------
const Earnings = () => {
  const [data, setData] = useState(null);
  const [min, setMin] = useState(0);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => get('/drivers/events/earnings').then(setData).catch((e) => toast.error(errMsg(e))), []);
  useEffect(() => { load(); get('/drivers/events/meta').then((m) => setMin(m.minWithdrawal || 0)).catch(() => {}); }, [load]);

  const withdraw = async () => {
    setBusy(true);
    try { await send('post', '/drivers/events/withdrawals', { amount: Number(amount) }); toast.success('Withdrawal requested'); setAmount(''); await load(); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };

  if (!data) return <Spin />;
  return (
    <>
      <div className="rounded-2xl bg-slate-900 p-5 text-white">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Event wallet</p>
        <p className="mt-1 text-3xl font-black">{rupees(data.balance)}</p>
        <p className="mt-2 text-xs font-semibold text-slate-400">Earned {rupees(data.totalEarned)} · Withdrawn {rupees(data.totalWithdrawn)}</p>
      </div>
      <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
        <Label>Withdraw (minimum {rupees(min)})</Label>
        <div className="flex gap-2">
          <input type="number" className={inputCls} placeholder="Amount ₹" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button type="button" disabled={busy || !Number(amount)} onClick={withdraw} className="rounded-xl bg-slate-900 px-5 text-sm font-black text-white disabled:opacity-40">Request</button>
        </div>
        <p className="text-xs font-semibold text-slate-500">Money is sent to the bank account saved in your profile.</p>
      </div>
      {data.withdrawals?.length ? (
        <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm font-black text-slate-900">Withdrawals</p>
          {data.withdrawals.map((w) => (
            <div key={w._id} className="flex items-center justify-between text-sm"><span className="font-semibold text-slate-600">{when(w.createdAt)}</span><span className="flex items-center gap-2 font-black text-slate-900">{rupees(w.amount)} <Pill value={w.status} /></span></div>
          ))}
        </div>
      ) : null}
      <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm font-black text-slate-900">History</p>
        {data.transactions?.length ? data.transactions.map((t) => (
          <div key={t._id} className="flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-600">{t.note || t.type.replace(/_/g, ' ')}<span className="block text-[11px] text-slate-400">{when(t.createdAt)}</span></span>
            <span className={`font-black ${t.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{t.amount >= 0 ? '+' : ''}{rupees(t.amount)}</span>
          </div>
        )) : <p className="text-sm font-semibold text-slate-400">No earnings yet.</p>}
      </div>
    </>
  );
};

const Spin = () => <div className="flex justify-center py-12"><Loader2 className="animate-spin text-slate-300" /></div>;
const Empty = ({ text }) => <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">{text}</div>;

const TABS = [['jobs', 'Event jobs', CalendarDays], ['vehicles', 'My vehicles', Plus], ['earnings', 'Earnings', Wallet]];

const EventDriverHub = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState('jobs');
  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <div className="flex items-center gap-3 bg-white px-4 py-4 shadow-sm">
        <button type="button" onClick={() => navigate('/taxi/driver/home')} className="rounded-full p-2 hover:bg-slate-100" aria-label="Back"><ArrowLeft size={20} /></button>
        <div><p className="text-lg font-black text-slate-900">Event bookings</p><p className="text-xs font-semibold text-slate-500">Weddings, trips and functions</p></div>
      </div>
      <div className="flex gap-2 px-4 pt-4">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`flex-1 rounded-xl py-2.5 text-xs font-black ${tab === key ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{label}</button>
        ))}
      </div>
      <div className="space-y-3 p-4">
        {tab === 'jobs' ? <Jobs /> : tab === 'vehicles' ? <Vehicles /> : <Earnings />}
      </div>
    </div>
  );
};

export default EventDriverHub;
