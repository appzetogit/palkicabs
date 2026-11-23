import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Empty, Field, Modal, Shell, Spinner, Table, act, btnDanger, btnGhost, btnPrimary, call, inputCls, rupees, useCategories, useLoad, useZones } from './eventUi';

const NUM = [
  ['extraPerKm', 'Per km beyond the last slab (₹)'], ['returnPercent', 'Return trip % of the way there', '100 = the same price as the way there'],
  ['includedHours', 'Hours included on day 1'], ['extraDayCharge', 'Each extra day (₹)'], ['extraDayIncludedHours', 'Hours included per extra day'],
  ['extraHourCharge', 'Each extra hour beyond that (₹)'], ['commissionPercent', 'PALKI commission % on driver vehicles', 'PALKI-owned vehicles: PALKI keeps all of it'],
];
const BLANK = { slabs: [{ fromKm: 0, toKm: 50, price: '' }], extraPerKm: 0, returnPercent: 100, includedHours: 10, extraDayCharge: 0, extraDayIncludedHours: 10, extraHourCharge: 0, commissionPercent: 15, active: true };

const EventPricingPage = () => {
  const zones = useZones();
  const cats = useCategories();
  const [zoneId, setZoneId] = useState('');
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!zoneId && zones.data?.length) setZoneId(zones.data[0]._id); }, [zones.data, zoneId]);
  const { data: rows, loading, reload } = useLoad(() => (zoneId ? call('get', '/admin/events/pricing', null, { params: { zoneId } }) : Promise.resolve([])), [zoneId]);

  const byCat = Object.fromEntries((rows || []).map((r) => [String(r.categoryId?._id), r]));

  const open = (cat) => {
    const r = byCat[String(cat._id)];
    setEdit({ categoryId: cat._id, categoryName: cat.name, ...(r ? { ...r, slabs: r.slabs.map((s) => ({ ...s })) } : { ...BLANK, slabs: BLANK.slabs.map((s) => ({ ...s })) }), _id: r?._id });
  };
  const setSlab = (i, k, v) => setEdit({ ...edit, slabs: edit.slabs.map((s, j) => (j === i ? { ...s, [k]: v === '' ? '' : Number(v) } : s)) });
  const addSlab = () => { const last = edit.slabs[edit.slabs.length - 1]; setEdit({ ...edit, slabs: [...edit.slabs, { fromKm: last?.toKm ?? 0, toKm: (last?.toKm ?? 0) + 50, price: '' }] }); };

  const save = async () => {
    setSaving(true);
    const ok = await act(() => call('put', '/admin/events/pricing', { ...edit, zoneId }), 'Pricing saved');
    setSaving(false);
    if (ok) { setEdit(null); reload(); }
  };
  const remove = async () => {
    if (!edit._id || !window.confirm('Remove this price? The category can no longer be booked in this zone.')) return;
    if (await act(() => call('delete', `/admin/events/pricing/${edit._id}`), 'Removed')) { setEdit(null); reload(); }
  };

  return (
    <Shell title="Pricing" subtitle="One price list per zone and vehicle category: a price for each distance slab (one way), the return is added automatically.">
      <div className="mb-4 max-w-xs"><Field label="Zone">
        <select className={inputCls} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>{(zones.data || []).map((z) => <option key={z._id} value={z._id}>{z.name}</option>)}</select>
      </Field></div>
      {loading || cats.loading ? <Spinner /> : !cats.data?.length ? <Empty>Add vehicle categories first.</Empty> : (
        <Table head={['Category', 'Slabs (one way)', 'Return', 'Extra day', 'Extra hour', 'Commission', '']}>
          {cats.data.map((c) => {
            const r = byCat[String(c._id)];
            return (
              <tr key={c._id}>
                <td className="px-4 py-3 font-bold text-slate-900">{c.name}</td>
                {r ? (
                  <>
                    <td className="px-4 py-3 text-xs">{r.slabs.map((s) => `${s.fromKm}-${s.toKm} km: ${rupees(s.price)}`).join(' · ')}</td>
                    <td className="px-4 py-3">{r.returnPercent}%</td>
                    <td className="px-4 py-3">{rupees(r.extraDayCharge)}</td>
                    <td className="px-4 py-3">{rupees(r.extraHourCharge)}</td>
                    <td className="px-4 py-3">{r.commissionPercent}%</td>
                  </>
                ) : <td colSpan={5} className="px-4 py-3 text-xs font-semibold text-amber-600">No price set: customers cannot book this category here.</td>}
                <td className="px-4 py-3 text-right"><button type="button" className={btnGhost} onClick={() => open(c)}>{r ? 'Edit' : 'Set price'}</button></td>
              </tr>
            );
          })}
        </Table>
      )}
      {edit ? (
        <Modal wide title={`${edit.categoryName} price`} onClose={() => setEdit(null)}
          footer={<>{edit._id ? <button type="button" className={btnDanger} onClick={remove}>Remove</button> : null}<button type="button" className={btnGhost} onClick={() => setEdit(null)}>Cancel</button><button type="button" className={btnPrimary} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button></>}>
          <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-500">Distance slabs: price of ONE way, per vehicle</p>
          <div className="space-y-2">
            {edit.slabs.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className={inputCls} type="number" placeholder="From km" value={s.fromKm} onChange={(e) => setSlab(i, 'fromKm', e.target.value)} />
                <input className={inputCls} type="number" placeholder="To km" value={s.toKm} onChange={(e) => setSlab(i, 'toKm', e.target.value)} />
                <input className={inputCls} type="number" placeholder="Price ₹" value={s.price} onChange={(e) => setSlab(i, 'price', e.target.value)} />
                <button type="button" className={btnDanger} disabled={edit.slabs.length < 2} onClick={() => setEdit({ ...edit, slabs: edit.slabs.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <button type="button" className={`${btnGhost} mt-2`} onClick={addSlab}><Plus size={13} /> Add slab</button>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {NUM.map(([k, label, hint]) => (
              <Field key={k} label={label} hint={hint}><input className={inputCls} type="number" min="0" value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></Field>
            ))}
          </div>
        </Modal>
      ) : null}
    </Shell>
  );
};

export default EventPricingPage;
