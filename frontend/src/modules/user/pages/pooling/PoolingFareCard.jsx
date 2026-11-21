import React from 'react';
import { Info, Users, Wallet } from 'lucide-react';

const rupees = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Explains the pooling fare before the rider pays:
 *  - the seat charge and the whole-vehicle fare it adds up to,
 *  - what they pay now (the most they can pay, if nobody else joins),
 *  - how it falls as other riders join, and that the difference comes back.
 */
const PoolingFareCard = ({ quote, loading = false, error = '' }) => {
  if (error) {
    return <div className="mb-6 rounded-3xl border border-rose-100 bg-rose-50 p-5 text-xs font-semibold text-rose-700">{error}</div>;
  }
  if (!quote) {
    return <div className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 text-xs font-semibold text-slate-400">{loading ? 'Calculating your fare…' : 'Select your pickup and drop to see the fare.'}</div>;
  }

  const shared = quote.distancePriced;
  return (
    <div className={`mb-8 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm ${loading ? 'opacity-60' : ''}`}>
      <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Your fare</p>

      <div className="space-y-2 text-xs font-semibold text-slate-600">
        {shared ? (
          <div className="flex justify-between">
            <span>Your ride</span>
            <span className="text-slate-900">{quote.boardKm} → {quote.dropKm} km ({quote.segmentKm} of {quote.routeKm} km)</span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span>Charge per seat (full route)</span>
          <span className="text-slate-900">{rupees(quote.farePerSeat)}</span>
        </div>
        {shared ? (
          <div className="flex justify-between">
            <span>Whole vehicle ({quote.seatsInVehicle} seats)</span>
            <span className="text-slate-900">{rupees(quote.fullVehicleFare)}</span>
          </div>
        ) : null}
        {quote.taxPercentage > 0 ? (
          <div className="flex justify-between">
            <span>Service tax ({quote.taxPercentage}%)</span>
            <span className="text-slate-900">{rupees(quote.maxTaxAmount)}</span>
          </div>
        ) : null}
        <div className="flex items-end justify-between border-t border-slate-100 pt-3">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">You pay now</span>
          <span className="text-2xl font-black text-slate-900">{rupees(quote.maxTotal)}</span>
        </div>
      </div>

      {shared ? (
        <div className="mt-4 space-y-2.5 rounded-2xl bg-indigo-50/60 p-4 text-[11px] font-semibold leading-relaxed text-indigo-900">
          <p className="flex gap-2"><Info size={14} className="mt-0.5 shrink-0" /> This is the most you can pay. If no other rider joins your stretch, you pay for the whole stretch yourself.</p>
          <p className="flex gap-2"><Users size={14} className="mt-0.5 shrink-0" /> When other riders join, the vehicle fare is divided between everyone by the distance they travel — the longer you ride, the more you pay.
            {quote.coRiders > 0
              ? ` ${quote.coRiders} other rider${quote.coRiders > 1 ? 's are' : ' is'} already on your stretch, so you would pay about ${rupees(quote.currentTotal)} right now.`
              : ' Nobody else is on your stretch yet.'}
          </p>
          <p className="flex gap-2"><Wallet size={14} className="mt-0.5 shrink-0" /> After the trip, whatever you paid above your share is added back to your PALKI wallet.</p>
          {quote.freeCancelHours ? <p className="pl-6">Free cancellation up to {quote.freeCancelHours} hours before departure.</p> : null}
        </div>
      ) : null}
    </div>
  );
};

export default PoolingFareCard;
