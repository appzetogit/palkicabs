import React, { useEffect, useState } from 'react';
import { Empty, Field, Shell, Spinner, Table, call, inputCls, toLocalInput, useLoad, useZones } from './eventUi';

const EventInventoryPage = () => {
  const zones = useZones();
  const [zoneId, setZoneId] = useState('');
  const [from, setFrom] = useState(toLocalInput(new Date(Date.now() + 864e5)));
  const [to, setTo] = useState(toLocalInput(new Date(Date.now() + 2 * 864e5)));
  useEffect(() => { if (!zoneId && zones.data?.length) setZoneId(zones.data[0]._id); }, [zones.data, zoneId]);
  const { data, loading } = useLoad(() => (zoneId ? call('get', '/admin/events/inventory', null, { params: { zoneId, from: new Date(from).toISOString(), to: new Date(to).toISOString() } }) : Promise.resolve([])), [zoneId, from, to]);

  return (
    <Shell title="Inventory" subtitle="How many vehicles of each category are free for a zone and dates. This is what customers see.">
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="Zone"><select className={inputCls} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>{(zones.data || []).map((z) => <option key={z._id} value={z._id}>{z.name}</option>)}</select></Field>
        <Field label="From"><input type="datetime-local" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="datetime-local" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      {loading ? <Spinner /> : !data?.length ? <Empty>No priced categories in this zone.</Empty> : (
        <Table head={['Category', 'Seats', 'Total fleet', 'Booked', 'Available']}>
          {data.map((c) => (
            <tr key={c.categoryId}>
              <td className="px-4 py-3 font-bold text-slate-900">{c.name}</td>
              <td className="px-4 py-3">{c.seats}</td>
              <td className="px-4 py-3">{c.total}</td>
              <td className="px-4 py-3">{c.booked}</td>
              <td className={`px-4 py-3 font-black ${c.full ? 'text-rose-600' : 'text-emerald-600'}`}>{c.full ? 'Full' : c.available}</td>
            </tr>
          ))}
        </Table>
      )}
    </Shell>
  );
};

export default EventInventoryPage;
