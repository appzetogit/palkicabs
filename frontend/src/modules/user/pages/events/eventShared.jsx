import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import api from '../../../../shared/api/axiosInstance';
import { useAppGoogleMapsLoader } from '../../../admin/utils/googleMaps';

export const unwrap = (r) => r?.data?.data ?? r?.data ?? r ?? {};
export const errMsg = (e, fallback = 'Something went wrong') => e?.response?.data?.message || e?.message || fallback;
export const rupees = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '-');

export const eventApi = {
  types: () => api.get('/users/events/types').then(unwrap),
  availability: (body) => api.post('/users/events/availability', body).then(unwrap),
  quote: (body) => api.post('/users/events/quote', body).then(unwrap),
  create: (body) => api.post('/users/events/bookings', body).then(unwrap),
  list: () => api.get('/users/events/bookings').then(unwrap),
  get: (id) => api.get(`/users/events/bookings/${id}`).then(unwrap),
  cancel: (id, reason) => api.post(`/users/events/bookings/${id}/cancel`, { reason }).then(unwrap),
  confirm: (id) => api.post(`/users/events/bookings/${id}/confirm`).then(unwrap),
  payOrder: (id) => api.post(`/users/events/bookings/${id}/pay/order`).then(unwrap),
  payVerify: (id, body) => api.post(`/users/events/bookings/${id}/pay/verify`, body).then(unwrap),
};

export const STATUS = {
  requested: ['Waiting for PALKI', 'bg-amber-50 text-amber-700'],
  assigned: ['Pay advance to confirm', 'bg-indigo-50 text-indigo-700'],
  confirmed: ['Confirmed', 'bg-emerald-50 text-emerald-700'],
  ongoing: ['Event on', 'bg-sky-50 text-sky-700'],
  completed: ['Completed', 'bg-slate-100 text-slate-700'],
  cancelled: ['Cancelled', 'bg-rose-50 text-rose-700'],
  rejected: ['Not available', 'bg-rose-50 text-rose-700'],
};

export const StatusPill = ({ status }) => {
  const [label, tone] = STATUS[status] || [status, 'bg-slate-100 text-slate-600'];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${tone}`}>{label}</span>;
};

export const Row = ({ label, value, strong }) => (
  <div className={`flex justify-between gap-4 text-sm ${strong ? 'border-t border-slate-100 pt-3 font-black text-slate-900' : 'font-semibold text-slate-600'}`}>
    <span>{label}</span><span className="text-right text-slate-900">{value}</span>
  </div>
);

let razorpayLoading = null;
export const loadRazorpay = () => {
  if (window.Razorpay) return Promise.resolve(true);
  if (!razorpayLoading) {
    razorpayLoading = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = () => resolve(true);
      s.onerror = () => { razorpayLoading = null; resolve(false); };
      document.body.appendChild(s);
    });
  }
  return razorpayLoading;
};

/** Address search (Google Places). onPick receives { address, lat, lng }. */
export const PlacePicker = ({ label, value, onPick }) => {
  const { isLoaded } = useAppGoogleMapsLoader();
  const [text, setText] = useState(value?.address || '');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const svc = useRef(null);
  const places = useRef(null);
  const timer = useRef(null);

  useEffect(() => { setText(value?.address || ''); }, [value?.address]);
  useEffect(() => {
    if (!isLoaded || !window.google?.maps?.places) return;
    svc.current = svc.current || new window.google.maps.places.AutocompleteService();
    places.current = places.current || new window.google.maps.places.PlacesService(document.createElement('div'));
  }, [isLoaded]);

  const search = (q) => {
    setText(q);
    window.clearTimeout(timer.current);
    if (!svc.current || q.trim().length < 3) { setResults([]); return; }
    timer.current = window.setTimeout(() => {
      svc.current.getPlacePredictions({ input: q, componentRestrictions: { country: 'in' } }, (list, status) => {
        setResults(status === 'OK' ? (list || []).slice(0, 5).map((p) => ({ id: p.place_id, title: p.structured_formatting?.main_text || p.description, address: p.description })) : []);
      });
    }, 300);
  };

  const choose = (r) => {
    setBusy(true);
    places.current.getDetails({ placeId: r.id, fields: ['formatted_address', 'geometry.location'] }, (place, status) => {
      setBusy(false);
      const loc = place?.geometry?.location;
      if (status !== 'OK' || !loc) return;
      const address = place.formatted_address || r.address;
      setText(address); setResults([]);
      onPick({ address, lat: loc.lat(), lng: loc.lng() });
    });
  };

  return (
    <div className="relative">
      <p className="mb-1 text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</p>
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 focus-within:border-slate-900">
        <MapPin size={16} className="shrink-0 text-slate-400" />
        <input className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none" placeholder="Search a place" value={text} onChange={(e) => search(e.target.value)} />
        {busy ? <Loader2 size={14} className="animate-spin text-slate-400" /> : null}
      </div>
      {results.length ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {results.map((r) => (
            <button key={r.id} type="button" onClick={() => choose(r)} className="block w-full border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-slate-50">
              <p className="text-sm font-bold text-slate-900">{r.title}</p>
              <p className="truncate text-xs text-slate-500">{r.address}</p>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-slate-900';
export const Label = ({ children }) => <p className="mb-1 text-[11px] font-black uppercase tracking-wider text-slate-500">{children}</p>;
