import React, { useEffect, useState } from 'react';
import {
  X, MapPin, Navigation, Phone, User, Car, Clock, IndianRupee, CreditCard, Star, Ban, Package, ExternalLink,
} from 'lucide-react';
import { BACKEND_ORIGIN } from '../../../../shared/api/runtimeConfig';
import { adminService } from '../../services/adminService';

// ---------- formatting ----------
export const formatDateTime = (value) => {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
};
const formatTime = (value) => {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
};
export const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const clean = (v) => String(v ?? '').replace(/_/g, ' ').toLowerCase();
const mediaUrl = (u) => (!u ? '' : /^https?:/i.test(u) ? u : `${BACKEND_ORIGIN || ''}${u.startsWith('/') ? '' : '/'}${u}`);

const STATUS_STYLES = {
  COMPLETED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700', UPCOMING: 'bg-yellow-100 text-yellow-700',
  ONGOING: 'bg-blue-100 text-blue-700', ON_TRIP: 'bg-blue-100 text-blue-700', ACCEPTED: 'bg-indigo-100 text-indigo-700',
};
const PAYMENT_STYLES = {
  CASH: 'bg-gray-100 text-gray-700', ONLINE: 'bg-emerald-50 text-emerald-700', WALLET: 'bg-indigo-50 text-indigo-700', SUBSCRIPTION: 'bg-sky-50 text-sky-700',
};

export const StatusBadge = ({ status }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize tracking-wide ${STATUS_STYLES[String(status || '').toUpperCase()] || 'bg-gray-100 text-gray-600'}`}>
    {clean(status) || 'unknown'}
  </span>
);
export const PaymentBadge = ({ method }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize tracking-wide ${PAYMENT_STYLES[String(method || '').toUpperCase()] || 'bg-gray-100 text-gray-700'}`}>
    {clean(method) || 'cash'}
  </span>
);

// ---------- table cells ----------
const who = (row, kind) => {
  const o = row[kind] || {};
  return {
    name: o.name || (kind === 'user' ? row.userName : row.driverName) || '',
    phone: o.phone || (kind === 'user' ? row.userPhone : row.driverPhone) || '',
    extra: kind === 'driver' ? [o.vehicleNumber].filter(Boolean).join(' ') : '',
  };
};
const unassigned = (n) => !n || n === '--' || n === 'Unassigned';

const SERVICE_STYLES = {
  city: 'bg-yellow-50 text-yellow-800 ring-yellow-200', airport: 'bg-sky-50 text-sky-700 ring-sky-200', outstation: 'bg-violet-50 text-violet-700 ring-violet-200',
  pooling: 'bg-emerald-50 text-emerald-700 ring-emerald-200', parcel: 'bg-orange-50 text-orange-700 ring-orange-200', intercity: 'bg-rose-50 text-rose-700 ring-rose-200',
};
export const ServiceBadge = ({ row }) => {
  const key = row.serviceKey || (row.parcel ? 'parcel' : 'city');
  const label = row.serviceLabel || (key === 'parcel' ? 'Parcel delivery' : 'City ride');
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${SERVICE_STYLES[key] || 'bg-gray-50 text-gray-600 ring-gray-200'}`}>{label}</span>;
};

export const BookingCell = ({ row }) => (
  <div className="leading-tight">
    <p className="font-mono text-[12px] font-bold text-gray-900">{row.requestId || '-'}</p>
    <p className="text-[11px] font-medium text-gray-400">{formatDateTime(row.date)}</p>
    <div className="mt-1"><ServiceBadge row={row} /></div>
  </div>
);
export const CustomerCell = ({ row }) => {
  const c = who(row, 'user');
  return (
    <div className="leading-tight">
      <p className="text-[13px] font-bold text-gray-800">{c.name && c.name !== '--' ? c.name : '-'}</p>
      {c.phone ? <p className="text-[11px] font-medium text-gray-400">{c.phone}</p> : null}
    </div>
  );
};
export const DriverCell = ({ row }) => {
  const d = who(row, 'driver');
  if (unassigned(d.name)) return <span className="text-xs italic text-gray-300">Unassigned</span>;
  return (
    <div className="leading-tight">
      <p className="text-[13px] font-semibold text-gray-700">{d.name}</p>
      <p className="text-[11px] font-medium text-gray-400">{[d.phone, d.extra].filter(Boolean).join(' · ')}</p>
    </div>
  );
};
export const RouteCell = ({ row }) => (
  <div className="w-[250px] leading-tight">
    <p className="flex items-center gap-1.5 truncate text-[12px] font-medium text-gray-700" title={row.pickupLabel}>
      <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />{row.pickupLabel || '-'}
    </p>
    <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] font-medium text-gray-500" title={row.dropLabel}>
      <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />{row.dropLabel || '-'}
    </p>
  </div>
);
export const VehicleCell = ({ row }) => (
  <div className="flex w-[190px] items-center gap-2">
    {row.vehicleImage ? <img src={mediaUrl(row.vehicleImage)} alt="" className="h-7 w-11 shrink-0 rounded object-cover" loading="lazy" /> : null}
    <div className="min-w-0 leading-tight">
      <p className="truncate text-[12px] font-bold capitalize text-gray-700" title={row.vehicleName || ''}>{row.vehicleName || clean(row.transportType)}</p>
      {row.distanceKm ? <p className="text-[11px] font-medium text-gray-400">{row.distanceKm} km</p> : null}
    </div>
  </div>
);
export const FareCell = ({ row }) => <span className="whitespace-nowrap text-[13px] font-bold text-gray-900">{money(row.fare)}</span>;

export const StatCards = ({ items }) => (
  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
    {items.map((s) => (
      <div key={s.label} className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{s.label}</p>
        <p className={`mt-1 text-xl font-black ${s.tone || 'text-gray-900'}`}>{s.value}</p>
      </div>
    ))}
  </div>
);


// ---------- filters ----------
export const EMPTY_BOOKING_FILTERS = { service: '', vehicle: '', payment: '', city: '', driver: '', dateFrom: '', dateTo: '' };

export const SERVICE_OPTIONS = {
  rides: [['', 'All bookings'], ['city', 'City ride'], ['airport', 'Airport transfer'], ['outstation', 'Outstation'], ['pooling', 'Car pooling']],
  live: [['', 'All bookings'], ['city', 'City ride'], ['airport', 'Airport transfer'], ['outstation', 'Outstation'], ['pooling', 'Car pooling'], ['parcel', 'Parcel delivery']],
  parcel: null,
};

const selectCls = 'h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-[12px] font-semibold text-gray-700 outline-none focus:border-yellow-400';
const Field = ({ label, children }) => (
  <label className="block min-w-[120px] flex-1">
    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</span>
    {children}
  </label>
);

export const BookingFilterBar = ({ filters, onChange, serviceOptions = SERVICE_OPTIONS.rides }) => {
  const [cities, setCities] = useState([]);
  useEffect(() => {
    let alive = true;
    adminService.getServiceLocations().then((res) => {
      const d = res?.data?.data || res?.data || {};
      const list = d.results || d.service_locations || (Array.isArray(d) ? d : []);
      if (alive) setCities(list.map((c) => ({ id: c._id || c.id, name: c.service_location_name || c.name })).filter((c) => c.id));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const set = (k) => (e) => onChange({ ...filters, [k]: e.target.value });
  const active = Object.values(filters).filter(Boolean).length;
  const isPoolingOnly = filters.service === 'pooling';

  return (
    <div className="border-b border-gray-100 bg-gray-50/60 px-4 py-3">
      <div className="flex flex-wrap items-end gap-3">
        {serviceOptions ? (
          <Field label="Booking type">
            <select value={filters.service} onChange={set('service')} className={selectCls}>
              {serviceOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        ) : null}
        <Field label="City">
          <select value={filters.city} onChange={set('city')} disabled={isPoolingOnly} className={selectCls}>
            <option value="">All cities</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Vehicle">
          <select value={filters.vehicle} onChange={set('vehicle')} disabled={isPoolingOnly} className={selectCls}>
            <option value="">All vehicles</option><option value="bike">Bike</option><option value="auto">Auto / E-rickshaw</option><option value="car">Car</option>
          </select>
        </Field>
        <Field label="Payment">
          <select value={filters.payment} onChange={set('payment')} className={selectCls}>
            <option value="">All payments</option><option value="cash">Cash</option><option value="online">Online</option><option value="wallet">Wallet</option>
          </select>
        </Field>
        <Field label="Driver">
          <select value={filters.driver} onChange={set('driver')} disabled={isPoolingOnly} className={selectCls}>
            <option value="">Any</option><option value="assigned">Assigned</option><option value="unassigned">Not assigned</option>
          </select>
        </Field>
        <Field label="From"><input type="date" value={filters.dateFrom} onChange={set('dateFrom')} className={selectCls} /></Field>
        <Field label="To"><input type="date" value={filters.dateTo} onChange={set('dateTo')} className={selectCls} /></Field>
        <button type="button" onClick={() => onChange({ ...EMPTY_BOOKING_FILTERS })} disabled={!active}
          className="h-8 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-40">
          Reset{active ? ` (${active})` : ''}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-gray-500">
        <span>Booking types:</span>
        {['city', 'airport', 'outstation', 'pooling', 'parcel'].map((k) => (
          <span key={k} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${SERVICE_STYLES[k]}`}>
            {{ city: 'City ride', airport: 'Airport transfer', outstation: 'Outstation', pooling: 'Car pooling', parcel: 'Parcel delivery' }[k]}
          </span>
        ))}
      </div>
    </div>
  );
};

// ---------- details drawer ----------
const mapsLink = (from, to) => {
  const f = from?.coordinates, t = to?.coordinates;
  if (!f || !t || f.length < 2 || t.length < 2) return '';
  return `https://www.google.com/maps/dir/?api=1&origin=${f[1]},${f[0]}&destination=${t[1]},${t[0]}`;
};

const Section = ({ icon: Icon, title, children }) => (
  <div className="rounded-xl border border-gray-100 bg-white p-4">
    <p className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-gray-400"><Icon size={14} /> {title}</p>
    {children}
  </div>
);
const KV = ({ label, children, mono }) => (
  <div>
    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
    <div className={`text-[13px] font-semibold text-gray-900 ${mono ? 'font-mono' : ''}`}>{children || '--'}</div>
  </div>
);
const Line = ({ label, value, bold, minus }) => (
  <div className={`flex items-center justify-between py-1 text-[13px] ${bold ? 'border-t border-gray-200 pt-2 font-black text-gray-900' : 'text-gray-600'}`}>
    <span>{label}</span><span className={minus ? 'text-red-600' : ''}>{minus ? '- ' : ''}{money(value)}</span>
  </div>
);

export const BookingDetailsDrawer = ({ booking, onClose }) => {
  if (!booking) return null;
  const b = booking;
  const f = b.fareBreakdown || {};
  const t = b.timeline || {};
  const user = who(b, 'user');
  const driver = who(b, 'driver');
  const isDelivery = Boolean(b.parcel);
  const pool = b.pooling;
  const link = mapsLink(b.pickupLocation, b.dropLocation);
  const steps = [
    ['Requested', t.requestedAt], ['Driver accepted', t.acceptedAt], ['Driver arrived', t.arrivedAt],
    ['Trip started', t.startedAt], ['Completed', t.completedAt], ['Cancelled', t.cancelledAt],
  ].filter(([, v]) => v);
  const photos = [...(b.parcel?.photos || [])].map((p) => (typeof p === 'string' ? p : p?.url)).filter(Boolean);
  const proofs = [['Pickup proof', b.parcel?.pickupProof, b.parcel?.pickupProofAt], ['Delivery proof', b.parcel?.deliveryProof, b.parcel?.deliveryProofAt]].filter(([, u]) => u);

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-xl flex-col bg-gray-50 text-gray-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-5 py-4">
          <div>
            <div className="mb-1"><ServiceBadge row={b} /></div>
            <p className="font-mono text-lg font-black text-gray-900">{b.requestId}</p>
            <p className="text-xs font-medium text-gray-500">{formatDateTime(b.date)}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={b.tripStatus} />
            <button onClick={onClose} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-900" aria-label="Close"><X size={20} /></button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <Section icon={MapPin} title="Route">
            <div className="space-y-3">
              <div className="flex gap-3"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" /><div><p className="text-[10px] font-bold uppercase text-gray-400">Pickup</p><p className="text-[13px] font-semibold text-gray-900">{b.pickupAddress || b.pickupLabel || '--'}</p></div></div>
              <div className="flex gap-3"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" /><div><p className="text-[10px] font-bold uppercase text-gray-400">Drop</p><p className="text-[13px] font-semibold text-gray-900">{b.dropAddress || b.dropLabel || '--'}</p></div></div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-gray-100 pt-3 text-[12px] font-semibold text-gray-600">
                {b.distanceKm ? <span className="flex items-center gap-1"><Navigation size={13} /> {b.distanceKm} km</span> : null}
                {b.durationMin ? <span className="flex items-center gap-1"><Clock size={13} /> {b.durationMin} min</span> : null}
                {b.airportName ? <span className="flex items-center gap-1 text-sky-700">Airport: {b.airportName}</span> : null}
                {link ? <a href={link} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-blue-600 hover:underline">Open in Maps <ExternalLink size={12} /></a> : null}
              </div>
            </div>
          </Section>

          <div className="grid gap-3 sm:grid-cols-2">
            <Section icon={User} title="Customer">
              <p className="text-[14px] font-bold text-gray-900">{user.name || '--'}</p>
              {user.phone ? <a href={`tel:${user.phone}`} className="mt-1 flex items-center gap-1 text-[12px] font-semibold text-blue-600"><Phone size={12} /> {user.phone}</a> : null}
            </Section>
            <Section icon={Car} title="Driver & vehicle">
              {unassigned(driver.name) ? <p className="text-[13px] italic text-gray-400">No driver assigned</p> : (
                <>
                  <p className="text-[14px] font-bold text-gray-900">{driver.name}</p>
                  {driver.phone ? <a href={`tel:${driver.phone}`} className="mt-1 flex items-center gap-1 text-[12px] font-semibold text-blue-600"><Phone size={12} /> {driver.phone}</a> : null}
                  <p className="mt-1 text-[12px] font-semibold capitalize text-gray-600">{[b.vehicleName || b.driver?.vehicleType, b.driver?.vehicleNumber].filter(Boolean).join(' · ')}</p>
                </>
              )}
            </Section>
          </div>

          {pool ? (
            <Section icon={Car} title="Car pooling seats">
              <div className="grid grid-cols-2 gap-3">
                <KV label="Route">{pool.routeName}</KV>
                <KV label="Travel date">{formatDateTime(pool.travelDate).replace(/, \d{2}:\d{2}.*$/, '')}</KV>
                <KV label="Departure">{[pool.scheduleLabel, pool.departureTime].filter(Boolean).join(' · ')}</KV>
                <KV label="Arrival">{pool.arrivalTime}</KV>
                <KV label="Seats booked">{pool.seatsBooked} ({(pool.selectedSeats || []).join(', ') || '--'})</KV>
                <KV label="Fare per seat">{money(pool.farePerSeat)}</KV>
                <KV label="Vehicle">{[pool.vehicleModel, pool.vehicleNumber].filter(Boolean).join(' · ')}</KV>
                <KV label="Commission split">{`Driver ${pool.driverCommissionPercentage}% · Owner ${pool.ownerCommissionPercentage}% · Tax ${pool.serviceTaxPercentage}%`}</KV>
              </div>
            </Section>
          ) : null}

          <Section icon={IndianRupee} title="Fare breakdown">
            <Line label="Base fare" value={f.baseFare || f.totalFare - (f.waitingCharge + f.tollCharges + f.airportFee + f.platformFee) + f.promoDiscount} />
            {f.waitingCharge ? <Line label={`Waiting charge (${f.waitingMinutes} min)`} value={f.waitingCharge} /> : null}
            {f.tollCharges ? <Line label="Toll" value={f.tollCharges} /> : null}
            {f.airportFee ? <Line label="Airport fee" value={f.airportFee} /> : null}
            {f.surgeMultiplier > 1 ? <Line label={`Surge x${f.surgeMultiplier}`} value={0} /> : null}
            {f.platformFee ? <Line label="Platform fee" value={f.platformFee} /> : null}
            {f.promoDiscount ? <Line label={`Promo ${f.promoCode}`} value={f.promoDiscount} minus /> : null}
            <Line label="Total fare" value={f.totalFare ?? b.fare} bold />
            {(f.commission || f.driverEarnings) ? (
              <div className="mt-3 rounded-lg bg-gray-50 p-3">
                <Line label="PALKI commission" value={f.commission} />
                <Line label="Driver earnings" value={f.driverEarnings} />
              </div>
            ) : null}
          </Section>

          <Section icon={CreditCard} title="Payment">
            <div className="grid grid-cols-2 gap-3">
              <KV label="Method"><PaymentBadge method={b.paymentOption} /></KV>
              <KV label="Status"><span className="capitalize">{b.paymentStatus || '--'}</span></KV>
            </div>
            {b.paymentDetail ? <p className="mt-2 text-[12px] text-gray-500">{b.paymentDetail}</p> : null}
            {b.paymentReference ? <p className="mt-1 break-all font-mono text-[11px] text-gray-400">Ref. {b.paymentReference}</p> : null}
          </Section>

          {steps.length ? (
            <Section icon={Clock} title="Timeline">
              <ol className="space-y-2 border-l-2 border-gray-200 pl-4">
                {steps.map(([label, at]) => (
                  <li key={label} className="relative text-[13px]">
                    <span className="absolute -left-[22px] top-1.5 h-2 w-2 rounded-full bg-yellow-400 ring-2 ring-white" />
                    <span className="font-semibold text-gray-800">{label}</span> <span className="text-gray-400">· {formatTime(at)}</span>
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}

          {b.cancellation ? (
            <Section icon={Ban} title="Cancellation">
              <div className="grid grid-cols-2 gap-3">
                <KV label="Cancelled by"><span className="capitalize">{b.cancellation.by || '--'}</span></KV>
                <KV label="Reason">{b.cancellation.reason}</KV>
              </div>
            </Section>
          ) : null}

          {b.feedback ? (
            <Section icon={Star} title="Rider feedback">
              <p className="flex items-center gap-1 text-[14px] font-black text-gray-900"><Star size={15} className="fill-yellow-400 text-yellow-400" /> {b.feedback.rating} / 5{b.feedback.tipAmount ? <span className="ml-3 text-[12px] font-semibold text-green-600">Tip {money(b.feedback.tipAmount)}</span> : null}</p>
              {b.feedback.comment ? <p className="mt-1 text-[13px] italic text-gray-600">“{b.feedback.comment}”</p> : null}
            </Section>
          ) : null}

          {isDelivery ? (
            <Section icon={Package} title="Parcel">
              <div className="grid grid-cols-2 gap-3">
                <KV label="Category">{b.parcel.category}</KV>
                <KV label="Weight">{b.parcel.weight}</KV>
                <KV label="Sender">{[b.parcel.senderName, b.parcel.senderMobile].filter(Boolean).join(' · ')}</KV>
                <KV label="Receiver">{[b.parcel.receiverName, b.parcel.receiverMobile].filter(Boolean).join(' · ')}</KV>
              </div>
              {b.parcel.description ? <p className="mt-3 text-[13px] text-gray-600">{b.parcel.description}</p> : null}
              {b.parcel.instructions ? <p className="mt-1 text-[12px] italic text-gray-500">Note: {b.parcel.instructions}</p> : null}
              {photos.length ? (
                <div className="mt-3 grid grid-cols-3 gap-2">{photos.map((u) => <a key={u} href={mediaUrl(u)} target="_blank" rel="noreferrer"><img src={mediaUrl(u)} alt="Parcel" className="h-20 w-full rounded-lg border border-gray-200 object-cover" /></a>)}</div>
              ) : null}
              {proofs.length ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {proofs.map(([label, u, at]) => (
                    <a key={label} href={mediaUrl(u)} target="_blank" rel="noreferrer" className="block">
                      <img src={mediaUrl(u)} alt={label} className="h-24 w-full rounded-lg border border-gray-200 object-cover" />
                      <p className="mt-1 text-[11px] font-semibold text-gray-500">{label}{at ? ` · ${formatTime(at)}` : ''}</p>
                    </a>
                  ))}
                </div>
              ) : null}
            </Section>
          ) : null}
        </div>

        <div className="border-t border-gray-200 bg-white px-5 py-3 text-right">
          <button onClick={onClose} className="rounded-lg bg-black px-6 py-2 text-sm font-bold text-white hover:bg-gray-900">Close</button>
        </div>
      </div>
    </div>
  );
};
