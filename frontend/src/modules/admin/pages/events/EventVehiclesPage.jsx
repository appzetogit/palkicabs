import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Empty, ImageUpload, Field, Modal, Shell, Spinner, Table, act, btnDanger, btnGhost, btnPrimary, call, inputCls, useCategories, useLoad, useZones } from './eventUi';

const BLANK = { zoneId: '', categoryId: '', name: '', vehicleNumber: '', color: '', seats: 4, images: [], driverName: '', driverPhone: '' };

const EventVehiclesPage = () => {
  const zones = useZones();
  const cats = useCategories();
  const [f, setF] = useState({ status: '', ownerType: '', zoneId: '', categoryId: '', q: '' });
  const { data, loading, reload } = useLoad(() => call('get', '/admin/events/vehicles', null, { params: f }), [f.status, f.ownerType, f.zoneId, f.categoryId, f.q]);
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);

  const open = (v) => setEdit(v ? { _id: v._id, zoneId: v.zoneId?._id, categoryId: v.categoryId?._id, name: v.name, vehicleNumber: v.vehicleNumber, color: v.color, seats: v.seats, images: v.images || [], driverName: v.driverName, driverPhone: v.driverPhone, ownerType: v.ownerType } : { ...BLANK });
  const save = async () => {
    setSaving(true);
    const body = { ...edit };
    const ok = await act(() => (edit._id ? call('patch', `/admin/events/vehicles/${edit._id}`, body) : call('post', '/admin/events/vehicles', body)), 'Saved');
    setSaving(false);
    if (ok) { setEdit(null); reload(); }
  };
  const run = async (fn, ok) => { if (await act(fn, ok)) reload(); };
  const reject = (v) => { const r = window.prompt('Reason for rejecting'); if (r !== null) run(() => call('post', `/admin/events/vehicles/${v._id}/reject`, { reason: r }), 'Rejected'); };
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });

  return (
    <Shell title="Vehicles" subtitle="PALKI vehicles carry their own driver. Vehicles added by drivers wait here for your approval."
      actions={<button type="button" className={btnPrimary} onClick={() => open(null)}><Plus size={14} /> Add PALKI vehicle</button>}>
      <div className="mb-4 grid gap-2 sm:grid-cols-5">
        <select className={inputCls} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">All status</option>{['pending', 'approved', 'rejected', 'inactive'].map((s) => <option key={s}>{s}</option>)}</select>
        <select className={inputCls} value={f.ownerType} onChange={(e) => setF({ ...f, ownerType: e.target.value })}><option value="">All owners</option><option value="admin">PALKI</option><option value="driver">Driver</option></select>
        <select className={inputCls} value={f.zoneId} onChange={(e) => setF({ ...f, zoneId: e.target.value })}><option value="">All zones</option>{(zones.data || []).map((z) => <option key={z._id} value={z._id}>{z.name}</option>)}</select>
        <select className={inputCls} value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}><option value="">All categories</option>{(cats.data || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
        <input className={inputCls} placeholder="Search name, number, driver" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
      </div>
      {loading ? <Spinner /> : !data?.length ? <Empty>No vehicles.</Empty> : (
        <Table head={['Vehicle', 'Category', 'Zone', 'Owner', 'Driver', 'Status', '']}>
          {data.map((v) => (
            <tr key={v._id}>
              <td className="px-4 py-3"><div className="flex items-center gap-3">{v.images?.[0] ? <img src={v.images[0]} alt="" className="h-10 w-14 rounded object-cover" /> : <div className="h-10 w-14 rounded bg-slate-100" />}<div><p className="font-bold text-slate-900">{v.name}</p><p className="text-xs text-slate-400">{v.vehicleNumber}</p></div></div></td>
              <td className="px-4 py-3">{v.categoryId?.name}</td>
              <td className="px-4 py-3">{v.zoneId?.name}</td>
              <td className="px-4 py-3">{v.ownerType === 'admin' ? 'PALKI' : 'Driver'}</td>
              <td className="px-4 py-3"><p className="font-semibold">{v.driverId?.name || v.driverName}</p><p className="text-xs text-slate-400">{v.driverId?.phone || v.driverPhone}</p></td>
              <td className="px-4 py-3"><Badge value={v.status} />{v.rejectionReason ? <p className="mt-1 text-[11px] text-rose-500">{v.rejectionReason}</p> : null}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                {v.status === 'pending' || v.status === 'rejected' ? <button type="button" className={btnPrimary} onClick={() => run(() => call('post', `/admin/events/vehicles/${v._id}/approve`), 'Approved')}>Approve</button> : null}{' '}
                {v.status === 'pending' ? <button type="button" className={btnDanger} onClick={() => reject(v)}>Reject</button> : null}{' '}
                {v.status === 'approved' ? <button type="button" className={btnGhost} onClick={() => run(() => call('patch', `/admin/events/vehicles/${v._id}`, { status: 'inactive' }), 'Deactivated')}>Deactivate</button> : null}
                {v.status === 'inactive' ? <button type="button" className={btnGhost} onClick={() => run(() => call('patch', `/admin/events/vehicles/${v._id}`, { status: 'approved' }), 'Activated')}>Activate</button> : null}{' '}
                <button type="button" className={btnGhost} onClick={() => open(v)}>Edit</button>{' '}
                <button type="button" className={btnDanger} onClick={() => window.confirm('Delete this vehicle?') && run(() => call('delete', `/admin/events/vehicles/${v._id}`), 'Deleted')}>Delete</button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {edit ? (
        <Modal title={edit._id ? 'Edit vehicle' : 'Add PALKI vehicle'} onClose={() => setEdit(null)}
          footer={<><button type="button" className={btnGhost} onClick={() => setEdit(null)}>Cancel</button><button type="button" className={btnPrimary} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Zone"><select className={inputCls} value={edit.zoneId} onChange={set('zoneId')}><option value="">Choose</option>{(zones.data || []).map((z) => <option key={z._id} value={z._id}>{z.name}</option>)}</select></Field>
            <Field label="Category"><select className={inputCls} value={edit.categoryId} onChange={set('categoryId')}><option value="">Choose</option>{(cats.data || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></Field>
            <Field label="Vehicle name"><input className={inputCls} value={edit.name} onChange={set('name')} placeholder="Toyota Innova Crysta" /></Field>
            <Field label="Vehicle number"><input className={inputCls} value={edit.vehicleNumber} onChange={set('vehicleNumber')} placeholder="MP09AB1234" /></Field>
            <Field label="Colour"><input className={inputCls} value={edit.color} onChange={set('color')} /></Field>
            <Field label="Seats"><input className={inputCls} type="number" value={edit.seats} onChange={set('seats')} /></Field>
            {edit.ownerType !== 'driver' ? (
              <>
                <Field label="Driver name"><input className={inputCls} value={edit.driverName} onChange={set('driverName')} /></Field>
                <Field label="Driver phone"><input className={inputCls} value={edit.driverPhone} onChange={set('driverPhone')} /></Field>
              </>
            ) : null}
            <div className="sm:col-span-2"><Field label="Photos (up to 4)"><ImageUpload value={edit.images || []} onChange={(v) => setEdit({ ...edit, images: v })} max={4} folder="event-vehicle" /></Field></div>
          </div>
        </Modal>
      ) : null}
    </Shell>
  );
};

export default EventVehiclesPage;
