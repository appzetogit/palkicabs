import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, KeyRound, Loader2, MapPin, Play, CheckCircle2, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  boardPoolingPassenger,
  completePoolingDriverTrip,
  getPoolingDriverEarnings,
  getPoolingDriverTrips,
  startPoolingDriverTrip,
} from '../../services/registrationService';

const unwrap = (response) => response?.data?.data || response?.data || response;
const rupees = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const errorText = (err, fallback) => err?.response?.data?.message || err?.message || fallback;

const TRIP_TONE = {
  scheduled: 'bg-amber-50 text-amber-700',
  started: 'bg-sky-50 text-sky-700',
  completed: 'bg-emerald-50 text-emerald-700',
};
const PAX_TONE = {
  confirmed: 'bg-slate-100 text-slate-600',
  boarded: 'bg-sky-50 text-sky-700',
  completed: 'bg-emerald-50 text-emerald-700',
  no_show: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-rose-50 text-rose-600',
};

const TripCard = ({ trip, busy, onStart, onComplete, onBoard }) => {
  const [otps, setOtps] = useState({});
  const done = trip.status === 'completed';
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-black text-slate-900">{trip.routeName}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <CalendarDays size={13} /> {trip.travelDate}{trip.departureTime ? ` · ${trip.departureTime}` : ''}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${TRIP_TONE[trip.status] || 'bg-slate-100 text-slate-600'}`}>{trip.status}</span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-slate-50 p-2.5"><p className="text-[10px] font-black uppercase text-slate-400">Seats</p><p className="text-sm font-black text-slate-900">{trip.seatsBooked}/{trip.seatsInVehicle}</p></div>
        <div className="rounded-2xl bg-slate-50 p-2.5"><p className="text-[10px] font-black uppercase text-slate-400">Collected</p><p className="text-sm font-black text-slate-900">{rupees(trip.totals.collected)}</p></div>
        <div className="rounded-2xl bg-slate-50 p-2.5"><p className="text-[10px] font-black uppercase text-slate-400">{done ? 'You earned' : 'You earn (est.)'}</p><p className="text-sm font-black text-emerald-700">{rupees(done ? trip.totals.settledDriverEarning : trip.totals.estimatedDriverEarning)}</p></div>
      </div>

      <div className="mt-4 space-y-2.5">
        {trip.passengers.map((p) => (
          <div key={p.bookingId} className="rounded-2xl border border-slate-100 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900">{p.name} <span className="font-semibold text-slate-400">· {p.seats} seat{p.seats > 1 ? 's' : ''}</span></p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-slate-500"><MapPin size={12} /> {p.pickup} → {p.drop}{p.dropKm ? ` (${p.boardKm}–${p.dropKm} km)` : ''}</p>
                {p.phone ? <a href={`tel:${p.phone}`} className="text-[11px] font-bold text-blue-600">{p.phone}</a> : null}
              </div>
              <div className="text-right">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${PAX_TONE[p.status] || 'bg-slate-100 text-slate-600'}`}>{p.status.replace('_', ' ')}</span>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">
                  {p.finalFare !== null ? `Fare ${rupees(p.finalFare)}` : p.estimatedFare !== null ? `Share ~${rupees(p.estimatedFare)}` : ''}
                </p>
              </div>
            </div>
            {trip.status === 'started' && p.status === 'confirmed' ? (
              <div className="mt-2 flex gap-2">
                <input
                  value={otps[p.bookingId] || ''}
                  onChange={(e) => setOtps((o) => ({ ...o, [p.bookingId]: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  inputMode="numeric"
                  placeholder="Rider OTP"
                  className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none"
                />
                <button
                  type="button"
                  disabled={busy || (otps[p.bookingId] || '').length !== 4}
                  onClick={() => onBoard(p.bookingId, otps[p.bookingId])}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-40"
                >
                  <KeyRound size={13} /> Board
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {!done ? (
        <div className="mt-4 flex gap-2">
          {trip.canStart ? (
            <button type="button" disabled={busy} onClick={onStart} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3 text-sm font-black text-white disabled:opacity-50"><Play size={15} /> Start trip</button>
          ) : null}
          {trip.canComplete ? (
            <button type="button" disabled={busy} onClick={onComplete} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-sm font-black text-white disabled:opacity-50"><CheckCircle2 size={15} /> Complete trip</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const PoolingDriverBookings = () => {
  const [trips, setTrips] = useState([]);
  const [earnings, setEarnings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, e] = await Promise.all([getPoolingDriverTrips(), getPoolingDriverEarnings()]);
      setTrips(Array.isArray(unwrap(t)) ? unwrap(t) : []);
      setEarnings(unwrap(e));
    } catch (err) {
      toast.error(errorText(err, 'Unable to load pooling trips'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (fn, okMessage) => {
    setBusy(true);
    try {
      await fn();
      toast.success(okMessage);
      await load();
    } catch (err) {
      toast.error(errorText(err, 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  };

  const keyOf = (t) => ({ routeId: t.routeId, scheduleId: t.scheduleId, travelDate: t.travelDate });
  const active = trips.filter((t) => t.status !== 'completed');
  const past = trips.filter((t) => t.status === 'completed');

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-slate-50 px-5 pb-16 pt-10 font-sans">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-xl font-black text-slate-900">Pooling trips</p>
        <Link to="/taxi/driver/pooling" className="text-xs font-bold text-slate-500">Profile</Link>
      </div>

      {earnings ? (
        <div className="mb-5 flex items-center gap-4 rounded-3xl bg-slate-900 p-5 text-white">
          <Wallet size={26} className="text-emerald-300" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Earnings balance</p>
            <p className="text-2xl font-black">{rupees(earnings.walletBalance)}</p>
            <p className="text-[11px] font-semibold text-slate-400">Total earned {rupees(earnings.totalEarnings)}</p>
          </div>
        </div>
      ) : null}

      {loading ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div> : null}
      {!loading && trips.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-400">No trips yet. Bookings will appear here.</p>
      ) : null}

      <div className="space-y-4">
        {active.map((t) => (
          <TripCard
            key={t.key}
            trip={t}
            busy={busy}
            onStart={() => act(() => startPoolingDriverTrip(keyOf(t)), 'Trip started')}
            onComplete={() => window.confirm('Complete the trip? Fares are settled now.') && act(() => completePoolingDriverTrip(keyOf(t)), 'Trip completed and settled')}
            onBoard={(bookingId, otp) => act(() => boardPoolingPassenger(bookingId, otp), 'Rider boarded')}
          />
        ))}
        {past.length ? <p className="pt-3 text-[11px] font-black uppercase tracking-widest text-slate-400">Completed</p> : null}
        {past.map((t) => <TripCard key={t.key} trip={t} busy={false} onStart={() => {}} onComplete={() => {}} onBoard={() => {}} />)}
      </div>
    </div>
  );
};

export default PoolingDriverBookings;
