import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Minus, Plus, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { Label, PlacePicker, Row, errMsg, eventApi, inputCls, rupees } from './eventShared';

const pad = (n) => String(n).padStart(2, '0');
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const EventNew = () => {
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  const [form, setForm] = useState({
    eventTypeId: '', eventTitle: '', notes: '', contactName: '', contactPhone: '',
    startAt: localInput(new Date(Date.now() + 3 * 864e5)), endAt: localInput(new Date(Date.now() + 3 * 864e5 + 10 * 36e5)),
  });
  const [pickup, setPickup] = useState(null);
  const [drop, setDrop] = useState(null);
  const [avail, setAvail] = useState(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [qty, setQty] = useState({});
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => { eventApi.types().then((t) => { setTypes(t); if (t[0]) setForm((f) => ({ ...f, eventTypeId: f.eventTypeId || t[0]._id })); }).catch((e) => toast.error(errMsg(e))); }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const startIso = form.startAt ? new Date(form.startAt).toISOString() : '';
  const endIso = form.endAt ? new Date(form.endAt).toISOString() : '';
  const datesOk = form.startAt && form.endAt && new Date(form.endAt) > new Date(form.startAt);

  // which vehicles are free for this pickup and these dates
  useEffect(() => {
    setQuote(null);
    if (!pickup || !datesOk) { setAvail(null); return undefined; }
    let live = true;
    setAvailLoading(true);
    eventApi.availability({ pickup, startAt: startIso, endAt: endIso })
      .then((d) => { if (live) { setAvail(d); setQty({}); } })
      .catch((e) => { if (live) { setAvail({ error: errMsg(e) }); } })
      .finally(() => live && setAvailLoading(false));
    return () => { live = false; };
  }, [pickup, startIso, endIso, datesOk]);

  const items = useMemo(() => Object.entries(qty).filter(([, n]) => n > 0).map(([categoryId, quantity]) => ({ categoryId, quantity })), [qty]);
  const body = () => ({ ...form, startAt: startIso, endAt: endIso, pickup, drop, items });
  const change = (id, delta, max) => { setQuote(null); setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(max, (q[id] || 0) + delta)) })); };

  const ready = pickup && drop && datesOk && items.length && form.eventTypeId && form.contactName.trim() && /^\d{10}$/.test(form.contactPhone.trim());

  const getQuote = async () => {
    setQuoting(true);
    try { setQuote(await eventApi.quote(body())); } catch (e) { toast.error(errMsg(e)); } finally { setQuoting(false); }
  };
  const send = async () => {
    setSending(true);
    try {
      const b = await eventApi.create(body());
      toast.success('Request sent');
      navigate(`/taxi/user/events/booking/${b._id}`, { replace: true });
    } catch (e) { toast.error(errMsg(e)); } finally { setSending(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      <div className="flex items-center gap-3 bg-white px-4 py-4 shadow-sm">
        <button type="button" onClick={() => navigate('/taxi/user/events')} className="rounded-full p-2 hover:bg-slate-100" aria-label="Back"><ArrowLeft size={20} /></button>
        <p className="text-lg font-black text-slate-900">New event booking</p>
      </div>

      <div className="space-y-5 p-4">
        <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <div><Label>Event type</Label>
            <select className={inputCls} value={form.eventTypeId} onChange={set('eventTypeId')}>{types.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select>
          </div>
          <div><Label>Event name (optional)</Label><input className={inputCls} placeholder="Sharma family wedding" value={form.eventTitle} onChange={set('eventTitle')} /></div>
          <PlacePicker label="Pickup" value={pickup} onPick={setPickup} />
          <PlacePicker label="Drop / venue" value={drop} onPick={setDrop} />
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Starts</Label><input type="datetime-local" className={inputCls} value={form.startAt} onChange={set('startAt')} /></div>
            <div><Label>Ends</Label><input type="datetime-local" className={inputCls} value={form.endAt} onChange={set('endAt')} /></div>
          </div>
          {!datesOk ? <p className="text-xs font-bold text-rose-500">End time must be after the start.</p> : null}
        </section>

        <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm font-black text-slate-900">Choose vehicles</p>
          {!pickup ? <p className="text-xs font-semibold text-slate-500">Pick a pickup place to see what is available.</p>
            : availLoading ? <div className="flex justify-center py-4"><Loader2 className="animate-spin text-slate-300" /></div>
              : avail?.error ? <p className="text-sm font-bold text-rose-500">{avail.error}</p>
                : !avail?.categories?.length ? <p className="text-sm font-semibold text-slate-500">No vehicles are priced for this area yet.</p> : (
                  <>
                    <p className="text-xs font-semibold text-slate-500">Available in {avail.zone.name} for your dates</p>
                    {avail.allFull ? <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-600">All vehicles are booked for these dates. Please try other dates.</p> : null}
                    {avail.categories.map((c) => (
                      <div key={c.categoryId} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                        {c.image ? <img src={c.image} alt="" className="h-12 w-16 rounded-lg object-cover" /> : <div className="h-12 w-16 rounded-lg bg-slate-100" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-slate-900">{c.name}</p>
                          <p className="flex items-center gap-1 text-xs font-semibold text-slate-500"><Users size={12} /> {c.seats} seats · {c.full ? <span className="font-black text-rose-500">Full</span> : <span className="font-black text-emerald-600">{c.available} available</span>}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" disabled={c.full || !qty[c.categoryId]} onClick={() => change(c.categoryId, -1, c.available)} className="rounded-full border border-slate-200 p-1.5 disabled:opacity-30"><Minus size={14} /></button>
                          <span className="w-5 text-center text-sm font-black">{qty[c.categoryId] || 0}</span>
                          <button type="button" disabled={c.full || (qty[c.categoryId] || 0) >= c.available} onClick={() => change(c.categoryId, 1, c.available)} className="rounded-full border border-slate-200 p-1.5 disabled:opacity-30"><Plus size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
        </section>

        <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm font-black text-slate-900">Contact for this event</p>
          <div><Label>Name</Label><input className={inputCls} value={form.contactName} onChange={set('contactName')} /></div>
          <div><Label>Mobile number</Label><input className={inputCls} inputMode="numeric" maxLength={10} value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value.replace(/\D/g, '') }))} /></div>
          <div><Label>Notes (optional)</Label><textarea rows={2} className={inputCls} value={form.notes} onChange={set('notes')} /></div>
        </section>

        {quote ? (
          <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm font-black text-slate-900">Price</p>
            <p className="text-xs font-semibold text-slate-500">{quote.distanceKm} km one way · {quote.days} day(s) · price includes the return trip</p>
            {quote.items.map((i) => <Row key={i.categoryId} label={`${i.categoryName} × ${i.quantity}`} value={rupees(i.lineTotal)} />)}
            {quote.pricing.extraDays ? <Row label="Extra days" value={rupees(quote.pricing.extraDays)} /> : null}
            {quote.pricing.overtime ? <Row label="Extra hours" value={rupees(quote.pricing.overtime)} /> : null}
            <Row label="Total" value={rupees(quote.pricing.total)} strong />
            <Row label={`Advance to confirm (${quote.pricing.advancePercent}%)`} value={rupees(quote.pricing.advanceAmount)} />
            <Row label="Balance on the event day" value={rupees(quote.pricing.balanceAmount)} />
            {!quote.available ? <p className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-600">Some vehicles are no longer available. Change the quantity.</p> : null}
          </section>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t border-slate-100 bg-white p-4">
        <button type="button" disabled={!ready || quoting} onClick={getQuote} className="flex-1 rounded-xl border border-slate-900 py-3 text-sm font-black text-slate-900 disabled:opacity-40">{quoting ? 'Calculating…' : 'See price'}</button>
        <button type="button" disabled={!ready || !quote?.available || sending} onClick={send} className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white disabled:opacity-40">{sending ? 'Sending…' : 'Send request'}</button>
      </div>
    </div>
  );
};

export default EventNew;
