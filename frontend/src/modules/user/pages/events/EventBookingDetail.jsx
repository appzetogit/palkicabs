import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import { Row, StatusPill, errMsg, eventApi, loadRazorpay, rupees, when } from './eventShared';

const EventBookingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [b, setB] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setB(await eventApi.get(id)); } catch (e) { toast.error(errMsg(e, 'Could not load this booking')); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const pay = async () => {
    setBusy(true);
    try {
      if (!(await loadRazorpay())) throw new Error('Payment could not start. Check your internet and try again.');
      const order = await eventApi.payOrder(id);
      const rzp = new window.Razorpay({
        key: order.keyId, amount: order.amount, currency: order.currency || 'INR', order_id: order.orderId,
        name: 'PALKI Event Booking', description: `${b.code} · ${order.stage === 'advance' ? 'Advance' : 'Balance'}`,
        theme: { color: '#0f172a' },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (resp) => {
          try { await eventApi.payVerify(id, resp); toast.success('Payment received'); await load(); } catch (e) { toast.error(errMsg(e, 'Payment could not be verified. If money was deducted, contact support.')); }
          setBusy(false);
        },
      });
      rzp.on('payment.failed', (ev) => { toast.error(ev?.error?.description || 'Payment failed'); setBusy(false); });
      rzp.open();
    } catch (e) { toast.error(errMsg(e)); setBusy(false); }
  };

  const confirmFree = async () => {
    setBusy(true);
    try { await eventApi.confirm(id); toast.success('Booking confirmed'); await load(); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };

  const cancel = async () => {
    const reason = window.prompt('Why are you cancelling? (optional)');
    if (reason === null) return;
    setBusy(true);
    try { const r = await eventApi.cancel(id, reason); toast.success(r.refundDue > 0 ? `Cancelled. ${rupees(r.refundDue)} will be refunded.` : 'Booking cancelled'); await load(); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;
  if (!b?._id) return <div className="p-8 text-center text-sm font-semibold text-slate-500">Booking not found.</div>;

  const due = b.due || {};
  const canCancel = ['requested', 'assigned', 'confirmed'].includes(b.status);

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      <div className="flex items-center gap-3 bg-white px-4 py-4 shadow-sm">
        <button type="button" onClick={() => navigate('/taxi/user/events')} className="rounded-full p-2 hover:bg-slate-100" aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="min-w-0 flex-1"><p className="truncate text-lg font-black text-slate-900">{b.eventTitle || b.eventTypeName}</p><p className="text-xs font-semibold text-slate-500">{b.code}</p></div>
        <StatusPill status={b.status} />
      </div>

      <div className="space-y-4 p-4">
        {b.status === 'requested' ? <p className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">We got your request. PALKI will assign vehicles and you can then pay the advance to confirm.</p> : null}
        {b.status === 'assigned' && due.stage === 'advance' ? <p className="rounded-2xl bg-indigo-50 p-4 text-sm font-bold text-indigo-800">Vehicles are ready for you. Pay {rupees(due.amount)} now to confirm the booking.</p> : null}
        {due.stage === 'extra' ? <p className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">Extra time was used on your event. Please pay the extra charge of {rupees(due.amount)}.</p> : null}
        {b.status === 'ongoing' && !due.stage ? <p className="rounded-2xl bg-sky-50 p-4 text-sm font-bold text-sky-800">Your event is on. Have a great time!</p> : null}
        {b.status === 'confirmed' && due.stage === 'balance' && !due.canPay ? <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">Confirmed. The balance of {rupees(due.amount)} is payable from {when(due.payFrom)}.</p> : null}
        {b.status === 'rejected' || b.status === 'cancelled' ? <p className="rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{b.cancelReason || (b.status === 'rejected' ? 'PALKI could not arrange vehicles for these dates.' : 'This booking was cancelled.')}{b.refundAmount ? ` Refund: ${rupees(b.refundAmount)}.` : ''}</p> : null}

        <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm font-black text-slate-900">Event</p>
          <Row label="Type" value={b.eventTypeName} />
          <Row label="Starts" value={when(b.startAt)} />
          <Row label="Ends" value={when(b.endAt)} />
          <Row label="Pickup" value={b.pickup?.address} />
          <Row label="Drop" value={b.drop?.address} />
          <Row label="Distance" value={`${b.distanceKm} km one way`} />
        </section>

        <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm font-black text-slate-900">Vehicles</p>
          {b.vehicles?.length ? b.vehicles.map((v, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
              <div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{v.vehicleName} · {v.vehicleNumber}</p><p className="text-xs font-semibold text-slate-500">{v.categoryName} · {v.driverName}</p>{v.tripStartedAt ? <p className="text-[11px] font-bold text-sky-600">Started {when(v.tripStartedAt)}{v.tripEndedAt ? ` · Ended ${when(v.tripEndedAt)}` : ' · on the trip'}</p> : null}</div>
              {v.driverPhone ? <a href={`tel:${v.driverPhone}`} className="rounded-full bg-slate-900 p-2 text-white" aria-label="Call driver"><Phone size={14} /></a> : null}
            </div>
          )) : b.items.map((i, k) => <Row key={k} label={`${i.categoryName} × ${i.quantity}`} value={rupees(i.lineTotal)} />)}
        </section>

        <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm font-black text-slate-900">Payment</p>
          <Row label="Trip (to and back)" value={rupees(b.pricing.tripTotal)} />
          {b.pricing.extraDays ? <Row label="Extra days" value={rupees(b.pricing.extraDays)} /> : null}
          {b.pricing.overtime ? <Row label="Extra hours" value={rupees(b.pricing.overtime)} /> : null}
          {(b.adjustments || []).map((a, i) => <Row key={i} label={a.label} value={rupees(a.amount)} />)}
          <Row label="Total" value={rupees(b.pricing.total)} strong />
          <Row label={`Advance (${b.pricing.advancePercent}%)`} value={rupees(b.pricing.advanceAmount)} />
          <Row label="Balance" value={rupees(b.pricing.balanceAmount)} />
          {(b.payments || []).map((p, i) => <Row key={i} label={`Paid · ${p.stage}`} value={`${rupees(p.amount)} ${p.status === 'refunded' ? '(refunded)' : ''}`} />)}
        </section>
      </div>

      {(due.stage && due.canPay) || (b.status === 'assigned' && !due.stage) || canCancel ? (
        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t border-slate-100 bg-white p-4">
          {canCancel ? <button type="button" disabled={busy} onClick={cancel} className="rounded-xl border border-rose-200 px-5 py-3 text-sm font-black text-rose-600 disabled:opacity-40">Cancel</button> : null}
          {due.stage && due.canPay ? <button type="button" disabled={busy} onClick={pay} className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white disabled:opacity-40">{busy ? 'Please wait…' : `Pay ${due.stage} ${rupees(due.amount)}`}</button> : null}
          {b.status === 'assigned' && !due.stage ? <button type="button" disabled={busy} onClick={confirmFree} className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white disabled:opacity-40">Confirm booking</button> : null}
        </div>
      ) : null}
    </div>
  );
};

export default EventBookingDetail;
