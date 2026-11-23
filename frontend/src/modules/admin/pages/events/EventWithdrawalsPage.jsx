import React, { useState } from 'react';
import { Badge, Empty, Shell, Spinner, Table, act, btnDanger, btnPrimary, call, rupees, useLoad, when } from './eventUi';

const bankText = (b) => (b && typeof b === 'object' ? Object.entries(b).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ') : '');

const EventWithdrawalsPage = () => {
  const [status, setStatus] = useState('pending');
  const { data, loading, reload } = useLoad(() => call('get', '/admin/events/withdrawals', null, { params: { status } }), [status]);

  const pay = async (w) => {
    const ref = window.prompt('Payment reference (UTR / transaction id), after you have sent the money');
    if (ref === null) return;
    if (await act(() => call('post', `/admin/events/withdrawals/${w._id}/pay`, { reference: ref }), 'Marked paid')) reload();
  };
  const reject = async (w) => {
    const note = window.prompt('Reason for rejecting (the amount goes back to the driver)');
    if (note === null) return;
    if (await act(() => call('post', `/admin/events/withdrawals/${w._id}/reject`, { note }), 'Rejected')) reload();
  };

  return (
    <Shell title="Withdrawals" subtitle="Drivers' requests to take out their event earnings. Send the money, then mark it paid.">
      <div className="mb-4 flex gap-2">
        {['pending', 'paid', 'rejected', ''].map((s) => (
          <button key={s || 'all'} type="button" onClick={() => setStatus(s)} className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${status === s ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{s || 'all'}</button>
        ))}
      </div>
      {loading ? <Spinner /> : !data?.length ? <Empty>No withdrawal requests.</Empty> : (
        <Table head={['Requested', 'Driver', 'Amount', 'Bank details', 'Wallet left', 'Status', '']}>
          {data.map((w) => (
            <tr key={w._id}>
              <td className="px-4 py-3 whitespace-nowrap">{when(w.createdAt)}</td>
              <td className="px-4 py-3"><p className="font-bold">{w.driverId?.name}</p><p className="text-xs text-slate-400">{w.driverId?.phone}</p></td>
              <td className="px-4 py-3 font-black">{rupees(w.amount)}</td>
              <td className="max-w-xs px-4 py-3 text-xs">{bankText(w.bank) || bankText(w.driverId?.bankDetails) || '-'}</td>
              <td className="px-4 py-3">{rupees(w.wallet?.balance)}</td>
              <td className="px-4 py-3"><Badge value={w.status} />{w.reference ? <p className="mt-1 text-[11px] text-slate-400">{w.reference}</p> : null}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                {w.status === 'pending' ? (<><button type="button" className={btnPrimary} onClick={() => pay(w)}>Mark paid</button>{' '}<button type="button" className={btnDanger} onClick={() => reject(w)}>Reject</button></>) : null}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Shell>
  );
};

export default EventWithdrawalsPage;
