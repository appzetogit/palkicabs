import React, { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Empty, ImageUpload, Field, Modal, Shell, Spinner, Table, act, btnDanger, btnGhost, btnPrimary, call, inputCls, useLoad } from './eventUi';

/** One editor for the two small lists: event types and vehicle categories. */
const CatalogPage = ({ title, subtitle, url, noun, columns, fields, blank, extraCell }) => {
  const { data, loading, reload } = useLoad(() => call('get', url));
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const body = { ...edit };
    delete body._id; delete body.createdAt; delete body.updatedAt; delete body.__v;
    const ok = await act(() => (edit._id ? call('patch', `${url}/${edit._id}`, body) : call('post', url, body)), `${noun} saved`);
    setSaving(false);
    if (ok) { setEdit(null); reload(); }
  };
  const remove = async (row) => {
    if (!window.confirm(`Delete "${row.name}"?`)) return;
    if (await act(() => call('delete', `${url}/${row._id}`), 'Deleted')) reload();
  };

  return (
    <Shell title={title} subtitle={subtitle} actions={<button type="button" className={btnPrimary} onClick={() => setEdit({ ...blank })}><Plus size={14} /> Add {noun.toLowerCase()}</button>}>
      {loading ? <Spinner /> : !data?.length ? <Empty>Nothing here yet.</Empty> : (
        <Table head={[...columns, 'Status', '']}>
          {data.map((row) => (
            <tr key={row._id}>
              {extraCell(row)}
              <td className="px-4 py-3"><Badge value={row.active ? 'approved' : 'inactive'} /></td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <button type="button" className={btnGhost} onClick={() => setEdit({ ...row })}><Pencil size={13} /> Edit</button>{' '}
                <button type="button" className={btnDanger} onClick={() => remove(row)}><Trash2 size={13} /></button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {edit ? (
        <Modal title={`${edit._id ? 'Edit' : 'Add'} ${noun.toLowerCase()}`} onClose={() => setEdit(null)}
          footer={<><button type="button" className={btnGhost} onClick={() => setEdit(null)}>Cancel</button><button type="button" className={btnPrimary} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button></>}>
          <div className="space-y-4">
            {fields.map(([key, label, type, hint]) => (
              <Field key={key} label={label} hint={hint}>
                {type === 'image' ? <ImageUpload value={edit[key] ? [edit[key]] : []} onChange={(v) => setEdit({ ...edit, [key]: v[0] || '' })} folder="event-catalog" />
                  : type === 'textarea' ? <textarea className={inputCls} rows={3} value={edit[key] ?? ''} onChange={(e) => setEdit({ ...edit, [key]: e.target.value })} />
                  : type === 'checkbox' ? <input type="checkbox" checked={Boolean(edit[key])} onChange={(e) => setEdit({ ...edit, [key]: e.target.checked })} />
                    : <input className={inputCls} type={type || 'text'} value={edit[key] ?? ''} onChange={(e) => setEdit({ ...edit, [key]: type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value })} />}
              </Field>
            ))}
          </div>
        </Modal>
      ) : null}
    </Shell>
  );
};

const Img = ({ src }) => (src ? <img src={src} alt="" className="h-10 w-16 rounded object-cover" /> : <div className="h-10 w-16 rounded bg-slate-100" />);

export const EventTypesPage = () => (
  <CatalogPage
    title="Event types" subtitle="What customers can hire vehicles for: a wedding, a corporate trip, a yatra..."
    url="/admin/events/types" noun="Event type" columns={['', 'Name', 'Advance %', 'Order']}
    blank={{ name: '', description: '', image: '', advancePercent: '', order: 0, active: true }}
    fields={[['name', 'Name'], ['description', 'Description', 'textarea'], ['image', 'Photo', 'image'], ['advancePercent', 'Advance % (blank = use the global setting)', 'number', 'Share of the total the customer pays online to confirm.'], ['order', 'Order', 'number'], ['active', 'Active', 'checkbox']]}
    extraCell={(r) => (<><td className="px-4 py-3"><Img src={r.image} /></td><td className="px-4 py-3"><p className="font-bold text-slate-900">{r.name}</p><p className="text-xs text-slate-400">{r.description}</p></td><td className="px-4 py-3">{r.advancePercent ?? <span className="text-slate-400">default</span>}</td><td className="px-4 py-3">{r.order}</td></>)}
  />
);

export const EventCategoriesPage = () => (
  <CatalogPage
    title="Vehicle categories" subtitle="SUV, Sedan, Tempo Traveller... Prices, fleet counts and availability are all per category."
    url="/admin/events/categories" noun="Vehicle category" columns={['', 'Name', 'Seats', 'Order']}
    blank={{ name: '', seats: 4, description: '', image: '', order: 0, active: true }}
    fields={[['name', 'Name'], ['seats', 'Seats', 'number'], ['description', 'Description', 'textarea'], ['image', 'Photo', 'image'], ['order', 'Order', 'number'], ['active', 'Active', 'checkbox']]}
    extraCell={(r) => (<><td className="px-4 py-3"><Img src={r.image} /></td><td className="px-4 py-3"><p className="font-bold text-slate-900">{r.name}</p><p className="text-xs text-slate-400">{r.description}</p></td><td className="px-4 py-3">{r.seats}</td><td className="px-4 py-3">{r.order}</td></>)}
  />
);
