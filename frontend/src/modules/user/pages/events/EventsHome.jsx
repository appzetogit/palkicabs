import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, ChevronRight, Loader2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { StatusPill, errMsg, eventApi, rupees, when } from './eventShared';

const EventsHome = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);

  useEffect(() => {
    eventApi.list().then((d) => setRows(Array.isArray(d) ? d : [])).catch((e) => { toast.error(errMsg(e, 'Could not load your events')); setRows([]); });
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <div className="flex items-center gap-3 bg-white px-4 py-4 shadow-sm">
        <button type="button" onClick={() => navigate('/taxi/user')} className="rounded-full p-2 hover:bg-slate-100" aria-label="Back"><ArrowLeft size={20} /></button>
        <div>
          <p className="text-lg font-black text-slate-900">Event booking</p>
          <p className="text-xs font-semibold text-slate-500">Hire cars and buses for a wedding, a trip or any function</p>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <button type="button" onClick={() => navigate('/taxi/user/events/new')} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 text-sm font-black text-white">
          <Plus size={18} /> Book vehicles for an event
        </button>

        <p className="pt-2 text-[11px] font-black uppercase tracking-wider text-slate-400">Your events</p>
        {rows === null ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-slate-300" /></div> : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
            <CalendarDays className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-bold text-slate-500">No event bookings yet.</p>
          </div>
        ) : rows.map((b) => (
          <button key={b._id} type="button" onClick={() => navigate(`/taxi/user/events/booking/${b._id}`)} className="w-full rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-black text-slate-900">{b.eventTitle || b.eventTypeName}</p>
                <p className="text-xs font-semibold text-slate-500">{b.code} · {when(b.startAt)}</p>
              </div>
              <StatusPill status={b.status} />
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-600">{b.items.map((i) => `${i.categoryName} × ${i.quantity}`).join(', ')}</p>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm font-black text-slate-900">{rupees(b.pricing?.total)}</p>
              {b.due?.stage ? <span className="flex items-center gap-1 text-xs font-black text-indigo-600">Pay {b.due.stage} {rupees(b.due.amount)} <ChevronRight size={14} /></span> : <ChevronRight size={16} className="text-slate-300" />}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default EventsHome;
