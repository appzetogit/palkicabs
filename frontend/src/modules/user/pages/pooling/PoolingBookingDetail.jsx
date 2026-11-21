import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, KeyRound, Loader2, MapPin, Users, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { userService } from '../../services/userService';

const rupees = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const unwrap = (r) => r?.data?.data || r?.data || r || {};

const STATUS = {
  confirmed: ['Confirmed', 'bg-emerald-50 text-emerald-700'],
  boarded: ['On the trip', 'bg-sky-50 text-sky-700'],
  completed: ['Completed', 'bg-slate-100 text-slate-700'],
  cancelled: ['Cancelled', 'bg-rose-50 text-rose-700'],
  no_show: ['Missed (no show)', 'bg-amber-50 text-amber-700'],
};

const Row = ({ label, value, strong }) => (
  <div className={`flex justify-between text-sm ${strong ? 'border-t border-slate-100 pt-3 font-black text-slate-900' : 'font-semibold text-slate-600'}`}>
    <span>{label}</span><span className="text-slate-900">{value}</span>
  </div>
);

const PoolingBookingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    try {
      setBooking(unwrap(await userService.getPoolingBooking(id)));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not load this booking');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const cancel = async () => {
    if (!window.confirm('Cancel this booking?')) return;
    setCancelling(true);
    try {
      const res = await userService.cancelPoolingBooking(id);
      toast.success(res?.data?.message || 'Booking cancelled');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not cancel');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;
  if (!booking?._id) return <div className="p-8 text-center text-sm font-semibold text-slate-500">Booking not found.</div>;

  const b = booking;
  const [statusLabel, statusTone] = STATUS[b.bookingStatus] || [b.bookingStatus, 'bg-slate-100 text-slate-700'];
  const live = ['confirmed', 'boarded'].includes(b.bookingStatus);
  const km = b.distancePriced ? `${b.boardKm} → ${b.dropKm} km of ${b.route?.routeDistanceKm || ''} km` : '';

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-slate-50 pb-16 font-sans">
      <div className="sticky top-0 z-30 flex items-center gap-4 border-b border-slate-100 bg-white px-5 pb-4 pt-10">
        <button type="button" onClick={() => navigate(-1)} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-sm"><ArrowLeft size={18} /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-black text-slate-900">{b.route?.routeName || 'Pooling booking'}</p>
          <p className="font-mono text-[11px] font-bold text-slate-400">{b.bookingId}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${statusTone}`}>{statusLabel}</span>
      </div>

      <div className="space-y-4 px-5 pt-5">
        {b.boardingOtp ? (
          <div className="rounded-3xl bg-slate-900 p-5 text-white">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400"><KeyRound size={14} /> Boarding OTP</p>
            <p className="mt-2 font-mono text-4xl font-black tracking-[0.3em]">{b.boardingOtp}</p>
            <p className="mt-2 text-xs font-semibold text-slate-400">Tell this OTP to the driver when you get in.</p>
          </div>
        ) : null}

        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400"><MapPin size={14} /> Trip</p>
          <div className="space-y-2">
            <Row label="Date" value={`${b.travelDay}${b.departureTime ? ` · ${b.departureTime}` : ''}`} />
            <Row label="Pickup" value={b.pickupLabel || '-'} />
            <Row label="Drop" value={b.dropLabel || '-'} />
            {km ? <Row label="Your distance" value={km} /> : null}
            <Row label="Seats" value={`${b.seatsBooked} (${(b.selectedSeats || []).join(', ')})`} />
            <Row label="Vehicle" value={[b.vehicle?.name, b.vehicle?.vehicleNumber].filter(Boolean).join(' · ') || '-'} />
            <Row label="Driver" value={[b.vehicle?.driverName, b.vehicle?.driverPhone].filter(Boolean).join(' · ') || '-'} />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400"><Wallet size={14} /> Payment</p>
          <div className="space-y-2">
            <Row label="Paid at booking (maximum)" value={rupees(b.paidAmount)} />
            {b.settled ? (
              <>
                <Row label="Your final share" value={rupees(b.finalBaseFare)} />
                {b.finalTaxAmount ? <Row label={`Service tax (${b.serviceTaxPercentage}%)`} value={rupees(b.finalTaxAmount)} /> : null}
                <Row label="Final fare" value={rupees(b.finalFare)} strong />
                <Row label="Returned to your wallet" value={rupees(b.refundAmount)} />
              </>
            ) : null}
            {live && b.estimate ? (
              <>
                <Row label={`Your share right now (${b.estimate.coRiders} other rider${b.estimate.coRiders === 1 ? '' : 's'} on your stretch)`} value={rupees(b.estimate.total)} strong />
                <p className="flex gap-2 rounded-2xl bg-indigo-50/60 p-3 text-[11px] font-semibold leading-relaxed text-indigo-900">
                  <Users size={14} className="mt-0.5 shrink-0" />
                  If the trip runs like this, {rupees(b.estimate.refundIfNoChange)} comes back to your wallet after the trip. More riders joining lowers your share further.
                </p>
              </>
            ) : null}
            {b.bookingStatus === 'cancelled' ? <Row label="Refund" value={b.refundAmount > 0 ? `${rupees(b.refundAmount)} to wallet` : 'No refund (too close to departure)'} /> : null}
            {b.bookingStatus === 'no_show' ? <p className="text-xs font-semibold text-amber-700">You did not board, so the payment is not refunded.</p> : null}
          </div>
        </div>

        {b.canCancel ? (
          <button type="button" onClick={cancel} disabled={cancelling} className="w-full rounded-2xl border border-rose-200 bg-white py-3.5 text-sm font-black text-rose-600 disabled:opacity-50">
            {cancelling ? 'Cancelling…' : 'Cancel booking'}
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default PoolingBookingDetail;
