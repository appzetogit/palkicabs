import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Badge, Empty, Modal, Shell, Spinner, Table, act, btnDanger, btnGhost, btnPrimary, call, inputCls, rupees, useLoad, when } from './eventUi';

const STATUSES = ['all', 'requested', 'assigned', 'confirmed', 'ongoing', 'completed', 'cancelled', 'rejected'];

const Row = ({ label, children }) => (
  <div className="flex justify-between gap-4 py-1 text-[13px]"><span className="font-semibold text-slate-500">{label}</span><span className="text-right font-bold text-slate-800">{children}</span></div>
);

const Detail = ({ id, onClose, onChanged }) => {
  const { data: b, loading, reload } = useLoad(() => call('get', `/admin/events/bookings/${id}`), [id]);
  const [picked, setPicked] = useState({}); // categoryId -> [vehicleId]
  const [busy, setBusy] = useState(false);
  const [charge, setCharge] = useState({ label: '', amount: '' });

  useEffect(() => {
    if (!b) return;
    const init = {};
    for (const a of b.assignments || []) (init[String(a.categoryId)] ||= []).push(String(a.vehicleId));
    setPicked(init);
  }, [b]);

  const run = async (fn, ok) => {
    setBusy(true);
    const done = await act(fn, ok);
    setBusy(false);
    if (done) { reload(); onChanged(); }
  };

  const toggle = (catId, vid, max) => setPicked((p) => {
    const cur = p[catId] || [];
    if (cur.includes(vid)) return { ...p, [catId]: cur.filter((x) => x !== vid) };
    if (cur.length >= max) return p;
    return { ...p, [catId]: [...cur, vid] };
  });

  if (loading || !b) return <Modal title="Booking" onClose={onClose} wide><Spinner /></Modal>;

  const editable = ['requested', 'assigned'].includes(b.status);
  const allPicked = b.items.every((i) => (picked[String(i.categoryId)] || []).length === i.quantity);
  const ask = (msg) => window.prompt(msg) ;

  return (
    <Modal wide title={`${b.code} · ${b.eventTitle || b.eventTypeName}`} onClose={onClose}
      footer={(
        <>
          {['requested', 'assigned'].includes(b.status) ? <button type="button" className={btnDanger} disabled={busy} onClick={() => { const r = ask('Reason for rejecting / cancelling'); if (r !== null) run(() => call('post', `/admin/events/bookings/${id}/${b.status === 'requested' ? 'reject' : 'cancel'}`, { reason: r }), 'Done'); }}>{b.status === 'requested' ? 'Reject request' : 'Cancel booking'}</button> : null}
          {['confirmed', 'ongoing'].includes(b.status) ? <button type="button" className={btnDanger} disabled={busy} onClick={() => { const r = ask('Reason for cancelling (the advance is refunded as per the cancellation rules)'); if (r !== null) run(() => call('post', `/admin/events/bookings/${id}/cancel`, { reason: r }), 'Booking cancelled'); }}>Cancel booking</button> : null}
          {b.status === 'ongoing' ? <button type="button" className={btnPrimary} disabled={busy} onClick={() => window.confirm('Mark the event completed and credit the drivers?') && run(() => call('post', `/admin/events/bookings/${id}/complete`), 'Completed')}>Mark completed</button> : null}
          {editable ? <button type="button" className={btnPrimary} disabled={busy || !allPicked} onClick={() => run(() => call('post', `/admin/events/bookings/${id}/assign`, { vehicleIds: Object.values(picked).flat() }), 'Vehicles assigned, customer can now pay the advance')}>{b.status === 'assigned' ? 'Re-assign vehicles' : 'Assign vehicles'}</button> : null}
        </>
      )}>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] font-black uppercase tracking-wider text-slate-400">Event</p>
          <Row label="Status"><Badge value={b.status} /></Row>
          <Row label="Type">{b.eventTypeName}</Row>
          <Row label="Zone">{b.zoneName}</Row>
          <Row label="Starts">{when(b.startAt)}</Row>
          <Row label="Ends">{when(b.endAt)}</Row>
          <Row label="Duration">{b.durationHours} h · {b.days} day(s)</Row>
          <Row label="Pickup">{b.pickup?.address}</Row>
          <Row label="Drop">{b.drop?.address}</Row>
          <Row label="Distance (one way)">{b.distanceKm} km</Row>
          {b.notes ? <Row label="Notes">{b.notes}</Row> : null}
          {b.cancelReason ? <Row label="Reason">{b.cancelReason}</Row> : null}
        </div>
        <div>
          <p className="mb-1 text-[11px] font-black uppercase tracking-wider text-slate-400">Customer</p>
          <Row label="Account">{b.userId?.name} · {b.userId?.phone}</Row>
          <Row label="Contact">{b.contactName} · {b.contactPhone}</Row>
          <p className="mb-1 mt-4 text-[11px] font-black uppercase tracking-wider text-slate-400">Money</p>
          <Row label="Trip (to and back)">{rupees(b.pricing.tripTotal)}</Row>
          <Row label="Extra days">{rupees(b.pricing.extraDays)}</Row>
          <Row label="Overtime">{rupees(b.pricing.overtime)}</Row>
          <Row label="Extra charges">{rupees(b.pricing.adjustments)}</Row>
          <Row label="Total">{rupees(b.pricing.total)}</Row>
          <Row label={`Advance (${b.pricing.advancePercent}%)`}>{rupees(b.pricing.advanceAmount)}</Row>
          <Row label="Balance">{rupees(b.pricing.balanceAmount)}</Row>
          {(b.payments || []).map((p, i) => <Row key={i} label={`${p.stage} paid`}>{rupees(p.amount)} <Badge value={p.status} /></Row>)}
          {b.refundAmount ? <Row label="Refunded">{rupees(b.refundAmount)}</Row> : null}
        </div>
      </div>

      <p className="mb-2 mt-6 text-[11px] font-black uppercase tracking-wider text-slate-400">Vehicles {editable ? '— pick the exact vehicles for each category' : ''}</p>
      <div className="space-y-4">
        {b.items.map((item) => {
          const cid = String(item.categoryId);
          const av = (b.availability || []).find((a) => a.categoryId === cid);
          const cands = b.candidates?.[cid] || [];
          const mine = b.assignments.filter((a) => String(a.categoryId) === cid);
          return (
            <div key={cid} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-black text-slate-900">{item.categoryName} × {item.quantity} <span className="font-semibold text-slate-400">({rupees(item.unitTotal)} each)</span></p>
                <p className="text-xs font-bold text-slate-500">{av ? `${av.available} of ${av.total} free on these dates` : ''}</p>
              </div>
              {editable ? (
                cands.length === 0 ? <p className="text-xs font-semibold text-rose-500">No vehicle of this category in the zone.</p> : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {cands.map((v) => {
                      const on = (picked[cid] || []).includes(String(v._id));
                      return (
                        <label key={v._id} className={`flex items-start gap-2 rounded-lg border p-2 text-xs ${v.busy ? 'border-slate-100 bg-slate-50 opacity-60' : on ? 'border-yellow-400 bg-yellow-50' : 'border-slate-200'}`}>
                          <input type="checkbox" disabled={v.busy} checked={on} onChange={() => toggle(cid, String(v._id), item.quantity)} className="mt-0.5" />
                          <span>
                            <b className="text-slate-800">{v.name} · {v.vehicleNumber}</b>
                            <span className="block text-slate-500">{v.ownerType === 'admin' ? 'PALKI vehicle' : 'Driver-owned'} · {v.driverName || '-'} {v.driverPhone}</span>
                            {v.busy ? <span className="font-bold text-rose-500">Busy on these dates</span> : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="space-y-1">
                  {mine.map((a) => (
                    <div key={a._id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span><b className="text-slate-800">{a.vehicleName} · {a.vehicleNumber}</b> · {a.driverName} {a.driverPhone}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-slate-500">{a.ownerType === 'admin' ? 'PALKI keeps all' : `Driver ${rupees(a.driverShare)} / PALKI ${rupees(a.adminShare)}`}</span>
                        <Badge value={a.driverStatus} />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {['assigned', 'confirmed'].includes(b.status) ? (
        <div className="mt-6 rounded-xl border border-slate-200 p-4">
          <p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Add an extra charge (or a discount as a minus amount)</p>
          <div className="flex flex-wrap gap-2">
            <input className={`${inputCls} max-w-xs`} placeholder="Label, e.g. Parking and toll" value={charge.label} onChange={(e) => setCharge({ ...charge, label: e.target.value })} />
            <input className={`${inputCls} max-w-[140px]`} type="number" placeholder="Amount ₹" value={charge.amount} onChange={(e) => setCharge({ ...charge, amount: e.target.value })} />
            <button type="button" className={btnGhost} disabled={busy} onClick={() => run(() => call('post', `/admin/events/bookings/${id}/adjustments`, charge), 'Charge added').then(() => setCharge({ label: '', amount: '' }))}>Add</button>
          </div>
          {(b.adjustments || []).map((a, i) => <p key={i} className="mt-2 text-xs font-semibold text-slate-600">{a.label}: {rupees(a.amount)}</p>)}
        </div>
      ) : null}
    </Modal>
  );
};

const EventBookingsPage = () => {
  const [status, setStatus] = useState('requested');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const { data, loading, reload } = useLoad(() => call('get', '/admin/events/bookings', null, { params: { status, q, page, limit: 20 } }), [status, q, page]);
  const counts = data?.counts || {};
  const totalAll = useMemo(() => Object.values(counts).reduce((s, n) => s + n, 0), [counts]);
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 20));

  return (
    <Shell title="Bookings" subtitle="Requests from customers. Open one, pick the vehicles, and the customer is asked to pay the advance.">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <button key={s} type="button" onClick={() => { setStatus(s); setPage(1); }} className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${status === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            {s} <span className="opacity-60">{s === 'all' ? totalAll : counts[s] || 0}</span>
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input className={`${inputCls} pl-8`} placeholder="Code, name, phone, event" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
      </div>
      {loading && !data ? <Spinner /> : !data?.results?.length ? <Empty>No bookings here.</Empty> : (
        <Table head={['Code', 'Event', 'Customer', 'Zone', 'Starts', 'Vehicles', 'Total', 'Status']}>
          {data.results.map((b) => (
            <tr key={b._id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(b._id)}>
              <td className="px-4 py-3 font-black text-slate-900">{b.code}</td>
              <td className="px-4 py-3"><p className="font-bold text-slate-800">{b.eventTitle || b.eventTypeName}</p><p className="text-xs text-slate-400">{b.eventTypeName}</p></td>
              <td className="px-4 py-3"><p className="font-semibold">{b.userId?.name}</p><p className="text-xs text-slate-400">{b.userId?.phone}</p></td>
              <td className="px-4 py-3">{b.zoneName}</td>
              <td className="px-4 py-3 whitespace-nowrap">{when(b.startAt)}</td>
              <td className="px-4 py-3 text-xs">{b.items.map((i) => `${i.categoryName} × ${i.quantity}`).join(', ')}</td>
              <td className="px-4 py-3 font-bold">{rupees(b.pricing?.total)}</td>
              <td className="px-4 py-3"><Badge value={b.status} /></td>
            </tr>
          ))}
        </Table>
      )}
      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-3 text-xs font-bold">
          <button type="button" className={btnGhost} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>{page} / {pages}</span>
          <button type="button" className={btnGhost} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      ) : null}
      {openId ? <Detail id={openId} onClose={() => setOpenId(null)} onChanged={reload} /> : null}
    </Shell>
  );
};

export default EventBookingsPage;
