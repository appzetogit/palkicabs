import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { Zone } from '../../driver/models/Zone.js';
import { resolveConfiguredGatewayCredentials } from '../../services/paymentGatewayService.js';
import { resolveRouteCached } from '../../services/routeService.js';
import { sendPushNotificationToEntities } from '../../services/pushNotificationService.js';
import {
  EventBooking, EventSettings, EventType, EventVehicle, EventVehicleCategory, EventPricing,
  EventWallet, EventWalletTransaction, EventWithdrawal,
} from '../models/eventModels.js';
import { priceBooking, realTimeExtra, round2, splitVehicleAmount, straightLineKm } from './eventFareService.js';

/** A push message to riders / drivers. Never lets a failed push break a booking. */
const notify = ({ userIds = [], driverIds = [], title, body, bookingId }) => {
  const ids = (list) => [...new Set(list.map(String).filter(Boolean))];
  if (!ids(userIds).length && !ids(driverIds).length) return;
  sendPushNotificationToEntities({ userIds: ids(userIds), driverIds: ids(driverIds), title, body, data: { type: 'event_booking', bookingId: String(bookingId || '') } }).catch(() => {});
};
const driversOf = (booking) => booking.assignments.filter((a) => a.driverId).map((a) => a.driverId);

const COMMITTED = ['requested', 'assigned', 'confirmed', 'ongoing']; // these hold vehicles
const HOLDING = ['assigned', 'confirmed', 'ongoing']; // these hold specific vehicles
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clean = (v) => String(v ?? '').trim();
const isId = (v) => mongoose.isValidObjectId(v);

// ---- settings ------------------------------------------------------------------
export const getSettings = async () =>
  (await EventSettings.findOneAndUpdate({ key: 'default' }, { $setOnInsert: { key: 'default' } }, { upsert: true, returnDocument: 'after' }).lean());

export const updateSettings = async (body = {}) => {
  const set = {};
  for (const k of ['advancePercent', 'bufferHours', 'minLeadHours', 'freeCancelHours', 'lateCancelRefundPercent', 'minWithdrawal']) {
    if (body[k] !== undefined && body[k] !== '') {
      const v = Number(body[k]);
      if (!Number.isFinite(v) || v < 0 || ((k.endsWith('Percent')) && v > 100)) throw new ApiError(400, `${k} is not valid`);
      set[k] = v;
    }
  }
  return EventSettings.findOneAndUpdate({ key: 'default' }, { $set: set }, { upsert: true, returnDocument: 'after' }).lean();
};

// ---- zone, distance, window --------------------------------------------------------
export const zoneForPoint = async ({ lat, lng }) =>
  Zone.findOne({ active: true, geometry: { $geoIntersects: { $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] } } } }).select('name').lean();

export const roadDistanceKm = async (pickup, drop) => {
  const route = await resolveRouteCached({ origin: [pickup.lng, pickup.lat], destination: [drop.lng, drop.lat] }).catch(() => null);
  if (route?.distanceMeters > 0) return { km: round2(route.distanceMeters / 1000), source: 'route' };
  return { km: round2(straightLineKm(pickup, drop) * 1.25), source: 'estimate' };
};

const windowOf = (startAt, endAt, bufferHours) => ({
  from: new Date(new Date(startAt).getTime() - bufferHours * 3600000),
  to: new Date(new Date(endAt).getTime() + bufferHours * 3600000),
});

// ---- availability ---------------------------------------------------------------------
/** For one zone and window: per category, how many vehicles exist, are spoken for, and are left. */
export const categoryAvailability = async ({ zoneId, startAt, endAt, excludeBookingId = null }) => {
  const settings = await getSettings();
  const win = windowOf(startAt, endAt, settings.bufferHours);
  const zone = new mongoose.Types.ObjectId(String(zoneId));
  const [cats, pricings, fleet, bookings] = await Promise.all([
    EventVehicleCategory.find({ active: true }).sort({ order: 1, name: 1 }).lean(),
    EventPricing.find({ zoneId: zone, active: true }).lean(),
    EventVehicle.aggregate([{ $match: { zoneId: zone, status: 'approved' } }, { $group: { _id: '$categoryId', count: { $sum: 1 } } }]),
    EventBooking.find({
      zoneId: zone, status: { $in: COMMITTED }, startAt: { $lt: win.to }, endAt: { $gt: win.from },
      ...(excludeBookingId ? { _id: { $ne: excludeBookingId } } : {}),
    }).select('items').lean(),
  ]);
  const priced = new Set(pricings.map((p) => String(p.categoryId)));
  const total = Object.fromEntries(fleet.map((f) => [String(f._id), f.count]));
  const booked = {};
  for (const b of bookings) for (const i of b.items) booked[String(i.categoryId)] = (booked[String(i.categoryId)] || 0) + i.quantity;
  return cats
    .filter((c) => priced.has(String(c._id)))
    .map((c) => {
      const t = total[String(c._id)] || 0; const bk = booked[String(c._id)] || 0;
      return { categoryId: String(c._id), name: c.name, seats: c.seats, image: c.image, total: t, booked: Math.min(bk, t), available: Math.max(0, t - bk), full: t - bk <= 0 };
    });
};

// ---- quote / create ----------------------------------------------------------------------
const parsePoint = (p, label) => {
  const lat = Number(p?.lat); const lng = Number(p?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new ApiError(400, `${label} location is required`);
  return { address: clean(p?.address), lat, lng };
};

export const buildQuote = async (body = {}, { forCreate = false } = {}) => {
  const settings = await getSettings();
  const eventType = isId(body.eventTypeId) ? await EventType.findOne({ _id: body.eventTypeId, active: true }).lean() : null;
  if (!eventType) throw new ApiError(400, 'Choose a valid event type');

  const pickup = parsePoint(body.pickup, 'Pickup');
  const drop = parsePoint(body.drop, 'Drop');
  const startAt = new Date(body.startAt); const endAt = new Date(body.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) throw new ApiError(400, 'Start and end date-time are required');
  if (endAt <= startAt) throw new ApiError(400, 'End time must be after the start time');
  if (forCreate && startAt.getTime() < Date.now() + settings.minLeadHours * 3600000) {
    throw new ApiError(400, `Events must be booked at least ${settings.minLeadHours} hours before they start`);
  }

  const requested = new Map();
  for (const it of Array.isArray(body.items) ? body.items : []) {
    const q = Math.floor(num(it?.quantity));
    if (!isId(it?.categoryId) || q < 1) continue;
    requested.set(String(it.categoryId), (requested.get(String(it.categoryId)) || 0) + q);
  }
  if (requested.size === 0) throw new ApiError(400, 'Choose at least one vehicle');

  const zone = await zoneForPoint(pickup);
  if (!zone) throw new ApiError(404, 'Event booking is not available at this pickup location yet');

  const [cats, pricings, availability, distance] = await Promise.all([
    EventVehicleCategory.find({ _id: { $in: [...requested.keys()] }, active: true }).lean(),
    EventPricing.find({ zoneId: zone._id, categoryId: { $in: [...requested.keys()] }, active: true }).lean(),
    categoryAvailability({ zoneId: zone._id, startAt, endAt }),
    roadDistanceKm(pickup, drop),
  ]);
  const catBy = Object.fromEntries(cats.map((c) => [String(c._id), c]));
  const priceBy = Object.fromEntries(pricings.map((p) => [String(p.categoryId), p]));
  const availBy = Object.fromEntries(availability.map((a) => [a.categoryId, a]));

  const lines = [];
  const availabilityChecks = [];
  for (const [categoryId, quantity] of requested) {
    const cat = catBy[categoryId];
    if (!cat || !priceBy[categoryId]) throw new ApiError(400, `${cat?.name || 'This vehicle type'} is not available in this zone`);
    const a = availBy[categoryId];
    availabilityChecks.push({ categoryId, name: cat.name, requested: quantity, available: a?.available || 0, ok: (a?.available || 0) >= quantity });
    lines.push({ categoryId, categoryName: cat.name, quantity, pricing: priceBy[categoryId] });
  }

  const advancePercent = eventType.advancePercent ?? settings.advancePercent;
  const priced = priceBooking({ lines, distanceKm: distance.km, startAt, endAt, advancePercent });
  if (priced.error) throw new ApiError(400, priced.error);

  return {
    eventType, pickup, drop, startAt, endAt, zone, settings,
    distanceKm: distance.km, distanceSource: distance.source,
    days: priced.days, durationHours: priced.durationHours, items: priced.items, pricing: priced.pricing,
    availability: availabilityChecks, available: availabilityChecks.every((c) => c.ok),
  };
};

const newCode = () => `EVT${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

export const createBooking = async (userId, body = {}) => {
  const q = await buildQuote(body, { forCreate: true });
  const unavailable = q.availability.find((c) => !c.ok);
  if (unavailable) throw new ApiError(409, `Only ${unavailable.available} ${unavailable.name} left for these dates`);
  return EventBooking.create({
    code: newCode(), userId, eventTypeId: q.eventType._id, eventTypeName: q.eventType.name,
    eventTitle: clean(body.eventTitle), notes: clean(body.notes), zoneId: q.zone._id, zoneName: q.zone.name,
    pickup: q.pickup, drop: q.drop, distanceKm: q.distanceKm, distanceSource: q.distanceSource,
    startAt: q.startAt, endAt: q.endAt, durationHours: q.durationHours, days: q.days,
    contactName: clean(body.contactName), contactPhone: clean(body.contactPhone),
    items: q.items, pricing: q.pricing, status: 'requested',
  });
};

// ---- admin: assign vehicles --------------------------------------------------------------------
/** Approved vehicles of a category in the booking's zone that are free for this booking's window. */
export const freeVehiclesFor = async (booking, categoryId) => {
  const settings = await getSettings();
  const win = windowOf(booking.startAt, booking.endAt, settings.bufferHours);
  const busy = await EventBooking.find({
    _id: { $ne: booking._id }, status: { $in: HOLDING }, startAt: { $lt: win.to }, endAt: { $gt: win.from },
  }).select('assignments.vehicleId').lean();
  const busyIds = new Set(busy.flatMap((b) => b.assignments.map((a) => String(a.vehicleId))));
  const vehicles = await EventVehicle.find({ zoneId: booking.zoneId, categoryId, status: 'approved' }).sort({ vehicleNumber: 1 }).lean();
  return vehicles.map((v) => ({ ...v, busy: busyIds.has(String(v._id)) }));
};

export const assignVehicles = async (bookingId, vehicleIds = []) => {
  const booking = await EventBooking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (!['requested', 'assigned', 'confirmed'].includes(booking.status)) throw new ApiError(409, `A ${booking.status} booking cannot be assigned`);
  const ids = [...new Set((Array.isArray(vehicleIds) ? vehicleIds : []).map(String).filter(isId))];

  const vehicles = await EventVehicle.find({ _id: { $in: ids }, zoneId: booking.zoneId, status: 'approved' }).lean();
  if (vehicles.length !== ids.length) throw new ApiError(400, 'Some vehicles are not approved vehicles of this zone');

  // exactly the vehicles asked for, per category
  const need = Object.fromEntries(booking.items.map((i) => [String(i.categoryId), i.quantity]));
  const have = {};
  for (const v of vehicles) have[String(v.categoryId)] = (have[String(v.categoryId)] || 0) + 1;
  for (const [cat, qty] of Object.entries(need)) {
    if ((have[cat] || 0) !== qty) {
      const name = booking.items.find((i) => String(i.categoryId) === cat)?.categoryName || 'vehicle';
      throw new ApiError(400, `Assign exactly ${qty} ${name} (selected ${have[cat] || 0})`);
    }
  }
  if (Object.keys(have).some((c) => !need[c])) throw new ApiError(400, 'A selected vehicle is not part of this booking');

  // none may be busy
  for (const catId of Object.keys(need)) {
    const free = new Set((await freeVehiclesFor(booking, catId)).filter((v) => !v.busy).map((v) => String(v._id)));
    const taken = vehicles.filter((v) => String(v.categoryId) === catId && !free.has(String(v._id)));
    if (taken.length) throw new ApiError(409, `${taken[0].name} (${taken[0].vehicleNumber}) is already booked for these dates`);
  }

  const drivers = {};
  booking.assignments = vehicles.map((v) => {
    const item = booking.items.find((i) => String(i.categoryId) === String(v.categoryId));
    const split = splitVehicleAmount({ amount: item.unitTotal, ownerType: v.ownerType, commissionPercent: item.commissionPercent });
    drivers[String(v._id)] = v;
    return {
      vehicleId: v._id, categoryId: v.categoryId, categoryName: item.categoryName, ownerType: v.ownerType, driverId: v.driverId || null,
      driverName: v.driverName || '', driverPhone: v.driverPhone || '', vehicleName: v.name, vehicleNumber: v.vehicleNumber,
      amount: item.unitTotal, driverShare: split.driverShare, adminShare: split.adminShare,
      // admin vehicles have no app login: they are told by phone, so they count as accepted
      driverStatus: v.ownerType === 'admin' ? 'accepted' : 'pending',
    };
  });
  if (booking.status === 'requested') { booking.status = 'assigned'; booking.assignedAt = new Date(); }
  await booking.save();
  notify({ userIds: [booking.userId], title: 'Vehicles ready for your event', body: `${booking.code}: pay the advance to confirm your booking.`, bookingId: booking._id });
  notify({ driverIds: driversOf(booking), title: 'New event job', body: `${booking.code}: your vehicle was picked for an event. Open Event Bookings to accept.`, bookingId: booking._id });
  return booking;
};

// ---- payments ----------------------------------------------------------------------------------------
const razorpayRequest = async ({ method, path, body, keyId, keySecret }) => {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status || 502, payload?.error?.description || 'Razorpay request failed');
  return payload;
};

const startOfDayIST = (d) => new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(d))}T00:00:00+05:30`);
const paidAmount = (b, stage) => round2(b.payments.filter((p) => p.stage === stage && p.status === 'paid').reduce((n, p) => n + p.amount, 0));

/** What the customer owes at a stage, and whether they may pay it now. */
export const paymentDue = (booking) => {
  const advancePaid = paidAmount(booking, 'advance');
  const balancePaid = paidAmount(booking, 'balance');
  const advanceDue = round2(booking.pricing.advanceAmount - advancePaid);
  const remaining = round2(booking.pricing.total - advancePaid - balancePaid - paidAmount(booking, 'extra'));
  const day = startOfDayIST(booking.startAt).getTime();
  if (booking.status === 'assigned' && advanceDue > 0) return { stage: 'advance', amount: advanceDue, canPay: true };
  if (booking.status === 'confirmed' && remaining > 0) return { stage: 'balance', amount: remaining, canPay: Date.now() >= day, payFrom: new Date(day) };
  // charges added after the balance was paid (real overtime), payable until the customer settles them
  if (['ongoing', 'completed'].includes(booking.status) && remaining > 0) return { stage: 'extra', amount: remaining, canPay: true };
  return { stage: null, amount: 0, canPay: false };
};

export const createPaymentOrder = async (booking, userId) => {
  const due = paymentDue(booking);
  if (!due.stage) throw new ApiError(409, 'Nothing is due on this booking right now');
  if (!due.canPay) throw new ApiError(400, 'The balance can be paid from the day of the event');
  const { keyId, keySecret } = await resolveConfiguredGatewayCredentials('razor_pay');
  const order = await razorpayRequest({
    method: 'POST', path: '/orders', keyId, keySecret,
    body: { amount: Math.round(due.amount * 100), currency: 'INR', receipt: `evt_${String(booking._id).slice(-8)}_${due.stage}_${Date.now().toString(36)}`, notes: { bookingId: String(booking._id), stage: due.stage, userId: String(userId) } },
  });
  return { keyId, orderId: order.id, amount: order.amount, currency: 'INR', stage: due.stage, due: due.amount };
};

export const verifyPayment = async (booking, userId, { orderId, paymentId, signature }) => {
  const { keyId, keySecret } = await resolveConfiguredGatewayCredentials('razor_pay');
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  const given = Buffer.from(String(signature || '')); const exp = Buffer.from(expected);
  if (given.length !== exp.length || !crypto.timingSafeEqual(given, exp)) throw new ApiError(400, 'Invalid payment signature');

  const already = await EventBooking.findOne({ 'payments.paymentId': paymentId }).select('_id userId').lean();
  if (already) {
    if (String(already._id) !== String(booking._id)) throw new ApiError(409, 'This payment was already used');
    return EventBooking.findById(booking._id);
  }

  const due = paymentDue(booking);
  if (!due.stage) throw new ApiError(409, 'Nothing is due on this booking');
  const order = await razorpayRequest({ method: 'GET', path: `/orders/${encodeURIComponent(orderId)}`, keyId, keySecret });
  const notes = order?.notes || {};
  if (Number(order?.amount) !== Math.round(due.amount * 100) || String(notes.bookingId) !== String(booking._id) || String(notes.userId) !== String(userId) || notes.stage !== due.stage) {
    throw new ApiError(400, 'Payment does not match this booking');
  }

  const from = due.stage === 'advance' ? ['assigned'] : due.stage === 'extra' ? ['ongoing', 'completed'] : ['confirmed'];
  const to = due.stage === 'advance' ? 'confirmed' : due.stage === 'extra' ? booking.status : 'ongoing';
  // advance and balance are paid once; extra charges can be paid more than once, each with its own order
  const once = due.stage === 'extra' ? { 'payments.orderId': { $ne: orderId } } : { 'payments.stage': { $ne: due.stage } };
  const updated = await EventBooking.findOneAndUpdate(
    { _id: booking._id, status: { $in: from }, ...once },
    { $push: { payments: { stage: due.stage, amount: due.amount, orderId, paymentId, status: 'paid', paidAt: new Date() } }, $set: { status: to, ...(to === 'confirmed' ? { confirmedAt: new Date() } : {}) } },
    { returnDocument: 'after' },
  );
  if (!updated) throw new ApiError(409, 'This booking was already updated');
  if (due.stage === 'extra') {
    notify({ userIds: [updated.userId], title: 'Payment received', body: `${updated.code}: extra charges paid. Thank you.`, bookingId: updated._id });
  }
  if (to === 'confirmed') {
    notify({ userIds: [updated.userId], title: 'Event booking confirmed', body: `${updated.code} is confirmed. The balance is payable on the event day.`, bookingId: updated._id });
    notify({ driverIds: driversOf(updated), title: 'Event confirmed', body: `${updated.code} is confirmed for ${new Date(updated.startAt).toLocaleDateString('en-IN')}.`, bookingId: updated._id });
  }
  return updated;
};

// ---- cancel / reject ------------------------------------------------------------------------------
const refundOnline = async (booking, amount) => {
  if (amount <= 0) return { refunded: 0 };
  const { keyId, keySecret } = await resolveConfiguredGatewayCredentials('razor_pay');
  let left = amount; let done = 0;
  for (const p of booking.payments.filter((x) => x.status === 'paid')) {
    if (left <= 0) break;
    const part = Math.min(left, p.amount);
    try {
      const r = await razorpayRequest({ method: 'POST', path: `/payments/${encodeURIComponent(p.paymentId)}/refund`, body: { amount: Math.round(part * 100), notes: { booking: booking.code } }, keyId, keySecret });
      await EventBooking.updateOne({ _id: booking._id, 'payments.paymentId': p.paymentId }, { $set: { 'payments.$.status': part >= p.amount ? 'refunded' : 'paid', 'payments.$.refundedAt': new Date(), 'payments.$.refundId': r.id } });
      done += part; left -= part;
    } catch { /* leaves the refund for the admin to do by hand */ }
  }
  return { refunded: round2(done) };
};

export const cancelBooking = async (bookingId, { by, reason = '', userId = null }) => {
  const booking = await EventBooking.findOne({ _id: bookingId, ...(userId ? { userId } : {}) });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (!['requested', 'assigned', 'confirmed'].includes(booking.status)) throw new ApiError(409, `A ${booking.status} booking cannot be cancelled`);
  if (booking.assignments.some((a) => a.tripStartedAt)) throw new ApiError(409, 'The event has already started, so it cannot be cancelled');

  const settings = await getSettings();
  const paid = paidAmount(booking, 'advance') + paidAmount(booking, 'balance');
  let refund = 0;
  if (paid > 0) {
    const hoursLeft = (booking.startAt.getTime() - Date.now()) / 3600000;
    refund = by === 'admin' || hoursLeft >= settings.freeCancelHours ? paid : round2((paid * settings.lateCancelRefundPercent) / 100);
  }
  const claimed = await EventBooking.findOneAndUpdate(
    { _id: booking._id, status: { $in: ['requested', 'assigned', 'confirmed'] } },
    { $set: { status: 'cancelled', cancelledBy: by, cancelReason: clean(reason), refundAmount: refund } },
    { returnDocument: 'after' },
  );
  if (!claimed) throw new ApiError(409, 'Booking was already updated');
  const result = await refundOnline(claimed, refund);
  notify({ userIds: by === 'admin' ? [claimed.userId] : [], driverIds: driversOf(claimed), title: 'Event booking cancelled', body: `${claimed.code} was cancelled.`, bookingId: claimed._id });
  return { booking: claimed, refundDue: refund, refunded: result.refunded };
};

export const rejectBooking = async (bookingId, reason = '') => {
  const booking = await EventBooking.findOneAndUpdate(
    { _id: bookingId, status: { $in: ['requested', 'assigned'] }, 'payments.0': { $exists: false } },
    { $set: { status: 'rejected', adminNote: clean(reason) } },
    { returnDocument: 'after' },
  );
  if (!booking) throw new ApiError(409, 'Only an unpaid request can be rejected - cancel a paid booking instead');
  notify({ userIds: [booking.userId], title: 'Event request update', body: `${booking.code}: we could not arrange vehicles for these dates.`, bookingId: booking._id });
  return booking;
};

// ---- admin: adjustments and completion -----------------------------------------------------------------------
export const addAdjustment = async (bookingId, { label, amount, assignmentId = null }) => {
  const amt = round2(amount);
  if (!clean(label) || !Number.isFinite(amt) || amt === 0) throw new ApiError(400, 'A label and a non-zero amount are required');
  const booking = await EventBooking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (!['assigned', 'confirmed', 'ongoing'].includes(booking.status)) throw new ApiError(409, 'Charges can be added until the booking is completed');
  const advancePaid = paidAmount(booking, 'advance');
  const balancePaid = paidAmount(booking, 'balance');
  if (balancePaid > 0 && amt < 0) throw new ApiError(409, 'A discount cannot be given after the balance is paid');
  // a charge may be tied to one vehicle (its real overtime): a driver's own vehicle then earns from it too
  let linked = null;
  if (assignmentId) {
    if (!isId(assignmentId) || !booking.assignments.id(assignmentId)) throw new ApiError(400, 'That vehicle is not part of this booking');
    if (amt < 0) throw new ApiError(400, 'A vehicle-linked charge must be positive');
    linked = assignmentId;
  }
  booking.adjustments.push({ label: clean(label), amount: amt, assignmentId: linked });
  const adj = round2(booking.adjustments.reduce((n, a) => n + a.amount, 0));
  const total = round2(booking.pricing.tripTotal + booking.pricing.extraDays + booking.pricing.overtime + adj);
  if (total <= 0) throw new ApiError(400, 'Total would not be positive');
  booking.pricing.adjustments = adj;
  booking.pricing.total = total;
  if (advancePaid === 0) booking.pricing.advanceAmount = round2((total * booking.pricing.advancePercent) / 100);
  // once the balance is paid it stays what was paid; anything added later is an "extra" payment
  booking.pricing.balanceAmount = balancePaid > 0 ? balancePaid : round2(total - Math.max(advancePaid, booking.pricing.advanceAmount));
  booking.markModified('pricing');
  await booking.save();
  if (booking.status === 'ongoing' && amt > 0) {
    notify({ userIds: [booking.userId], title: 'Extra charge on your event', body: `${booking.code}: ${clean(label)} Rs ${amt}. Open the booking to pay.`, bookingId: booking._id });
  }
  return booking;
};

export const creditEventWallet = async (driverId, amount, { bookingId = null, note = '' } = {}) => {
  const wallet = await EventWallet.findOneAndUpdate({ driverId }, { $inc: { balance: amount, totalEarned: amount }, $setOnInsert: { driverId } }, { upsert: true, returnDocument: 'after' });
  await EventWalletTransaction.create({ driverId, type: 'earning', amount, balanceAfter: wallet.balance, bookingId, note });
  return wallet;
};

export const confirmWithoutAdvance = async (booking) => {
  if (booking.status !== 'assigned' || booking.pricing.advanceAmount > 0) throw new ApiError(409, 'An advance payment is required');
  return EventBooking.findOneAndUpdate({ _id: booking._id, status: 'assigned' }, { $set: { status: 'confirmed', confirmedAt: new Date() } }, { returnDocument: 'after' });
};

export const completeBooking = async (bookingId) => {
  const current = await EventBooking.findById(bookingId);
  if (!current) throw new ApiError(404, 'Booking not found');
  // fully prepaid bookings never go through "ongoing", so they may be completed from confirmed
  const prepaid = current.status === 'confirmed' && paymentDue(current).amount === 0;
  if (current.assignments.some((a) => a.tripStartedAt && !a.tripEndedAt)) throw new ApiError(409, 'A trip is still running. Record its end time first.');
  const claimed = await EventBooking.findOneAndUpdate({ _id: bookingId, status: prepaid ? 'confirmed' : 'ongoing' }, { $set: { status: 'completed', completedAt: new Date() } }, { returnDocument: 'after' });
  if (!claimed) throw new ApiError(409, 'Only an ongoing booking (balance paid) can be completed');
  for (const a of claimed.assignments) {
    if (a.settledAt || a.ownerType !== 'driver' || !a.driverId) continue;
    // the real-overtime charges tied to this vehicle are split the same way as its fare
    const linked = round2(claimed.adjustments.filter((x) => x.assignmentId && String(x.assignmentId) === String(a._id) && x.amount > 0).reduce((n, x) => n + x.amount, 0));
    const commission = claimed.items.find((i) => String(i.categoryId) === String(a.categoryId))?.commissionPercent || 0;
    const extraShare = linked > 0 ? splitVehicleAmount({ amount: linked, ownerType: 'driver', commissionPercent: commission }).driverShare : 0;
    const credit = round2(a.driverShare + extraShare);
    if (credit <= 0) continue;
    const marked = await EventBooking.updateOne({ _id: claimed._id, 'assignments._id': a._id, 'assignments.settledAt': null }, { $set: { 'assignments.$.settledAt': new Date(), 'assignments.$.driverShare': credit } });
    if (marked.modifiedCount) await creditEventWallet(a.driverId, credit, { bookingId: claimed._id, note: `${claimed.code} - ${a.vehicleNumber}` });
  }
  notify({ userIds: [claimed.userId], title: 'Event completed', body: `${claimed.code} is completed. Thank you for choosing PALKI.`, bookingId: claimed._id });
  notify({ driverIds: claimed.assignments.filter((a) => a.ownerType === 'driver').map((a) => a.driverId), title: 'Event earnings added', body: `${claimed.code}: your earnings were added to the event wallet.`, bookingId: claimed._id });
  return EventBooking.findById(claimed._id);
};

// ---- the real trip: start and end, recorded by the driver (or by the admin for a vehicle with no app) ----------------
const tripFilter = (bookingId, assignmentId, extra = {}) => ({ _id: bookingId, status: { $in: ['confirmed', 'ongoing'] }, 'assignments._id': assignmentId, ...extra });
const FUTURE_SLACK_MS = 5 * 60000;

const loadAssignment = async ({ bookingId, assignmentId, driverId }) => {
  const booking = await EventBooking.findOne(bookingId ? { _id: bookingId, 'assignments._id': assignmentId } : { 'assignments._id': assignmentId });
  const a = booking?.assignments.id(assignmentId);
  if (!booking || !a || (driverId && String(a.driverId) !== String(driverId))) throw new ApiError(404, 'Assignment not found');
  return { booking, a };
};

export const startTrip = async ({ bookingId = null, assignmentId, driverId = null, by = 'driver' }) => {
  const { booking, a } = await loadAssignment({ bookingId, assignmentId, driverId });
  if (!['confirmed', 'ongoing'].includes(booking.status)) throw new ApiError(409, 'The booking is not confirmed yet');
  if (a.driverStatus !== 'accepted') throw new ApiError(409, 'Accept the job first');
  if (a.tripStartedAt) throw new ApiError(409, 'This trip has already started');
  // not before the day of the event (the same day the customer can pay the balance)
  if (Date.now() < startOfDayIST(booking.startAt).getTime()) throw new ApiError(409, 'You can start the trip on the day of the event');
  const r = await EventBooking.updateOne(
    tripFilter(booking._id, assignmentId, { assignments: { $elemMatch: { _id: a._id, tripStartedAt: null } } }),
    { $set: { 'assignments.$.tripStartedAt': new Date(), 'assignments.$.tripStartedBy': by } },
  );
  if (!r.modifiedCount) throw new ApiError(409, 'This trip has already started');
  notify({ userIds: [booking.userId], title: 'Your event vehicle has started', body: `${booking.code}: ${a.vehicleName} ${a.vehicleNumber} started the trip.`, bookingId: booking._id });
  return EventBooking.findById(booking._id);
};

export const endTrip = async ({ bookingId = null, assignmentId, driverId = null, by = 'driver' }) => {
  const { booking, a } = await loadAssignment({ bookingId, assignmentId, driverId });
  if (!['confirmed', 'ongoing'].includes(booking.status)) throw new ApiError(409, 'The booking is not active');
  if (!a.tripStartedAt) throw new ApiError(409, 'Start the trip first');
  if (a.tripEndedAt) throw new ApiError(409, 'This trip has already ended');
  const r = await EventBooking.updateOne(
    tripFilter(booking._id, assignmentId, { assignments: { $elemMatch: { _id: a._id, tripEndedAt: null } } }),
    { $set: { 'assignments.$.tripEndedAt': new Date(), 'assignments.$.tripEndedBy': by } },
  );
  if (!r.modifiedCount) throw new ApiError(409, 'This trip has already ended');
  notify({ userIds: [booking.userId], title: 'Event trip finished', body: `${booking.code}: ${a.vehicleName} ${a.vehicleNumber} finished the trip.`, bookingId: booking._id });
  return EventBooking.findById(booking._id);
};

/** Admin: set or correct a vehicle's real start and end (for vehicles with no driver app, or a wrong tap). */
export const setTripTimes = async (bookingId, assignmentId, { startedAt, endedAt }) => {
  const { booking, a } = await loadAssignment({ bookingId, assignmentId });
  if (!['confirmed', 'ongoing'].includes(booking.status)) throw new ApiError(409, 'Times can be set until the booking is completed');
  const s0 = startedAt ? new Date(startedAt) : null; const e0 = endedAt ? new Date(endedAt) : null;
  if ((s0 && Number.isNaN(s0.getTime())) || (e0 && Number.isNaN(e0.getTime()))) throw new ApiError(400, 'Dates are not valid');
  if (e0 && !s0) throw new ApiError(400, 'An end time needs a start time');
  if (s0 && e0 && e0 <= s0) throw new ApiError(400, 'End must be after start');
  if ((s0 && s0.getTime() > Date.now() + FUTURE_SLACK_MS) || (e0 && e0.getTime() > Date.now() + FUTURE_SLACK_MS)) throw new ApiError(400, 'Times cannot be in the future');
  a.tripStartedAt = s0; a.tripEndedAt = e0;
  a.tripStartedBy = s0 ? 'admin' : ''; a.tripEndedBy = e0 ? 'admin' : '';
  await booking.save();
  return booking;
};

/** Per vehicle: how long it really ran and what that costs beyond the booked window. */
export const overtimeSuggestions = async (booking) => {
  const b = typeof booking.toObject === 'function' ? booking.toObject() : booking;
  const pricings = await EventPricing.find({ zoneId: b.zoneId, categoryId: { $in: b.items.map((i) => i.categoryId) } }).lean();
  const priceBy = Object.fromEntries(pricings.map((p) => [String(p.categoryId), p]));
  return (b.assignments || []).filter((a) => a.tripStartedAt && a.tripEndedAt).map((a) => {
    const item = b.items.find((i) => String(i.categoryId) === String(a.categoryId)) || {};
    const live = priceBy[String(a.categoryId)] || {};
    // the rules the booking was priced with; old bookings fall back to the zone's current price list
    const pick = (k) => (item[k] !== null && item[k] !== undefined ? item[k] : live[k] ?? 0);
    const rules = { includedHours: pick('includedHours'), extraDayIncludedHours: pick('extraDayIncludedHours'), extraDayCharge: pick('extraDayCharge'), extraHourCharge: pick('extraHourCharge') };
    const r = realTimeExtra({ rules, booked: item, startedAt: a.tripStartedAt, endedAt: a.tripEndedAt });
    const done = (b.adjustments || []).filter((x) => x.assignmentId && String(x.assignmentId) === String(a._id)).reduce((n, x) => n + x.amount, 0);
    return { assignmentId: a._id, vehicle: `${a.vehicleName} ${a.vehicleNumber}`, categoryName: a.categoryName, startedAt: a.tripStartedAt, endedAt: a.tripEndedAt, ...r, bookedHours: b.durationHours, alreadyAdded: round2(done), suggested: Math.max(0, round2(r.extra - done)) };
  });
};

// ---- driver: assignment answer, withdrawals ------------------------------------------------------------------------
export const answerAssignment = async (driverId, assignmentId, accept) => {
  const booking = await EventBooking.findOne({ 'assignments._id': assignmentId, 'assignments.driverId': driverId, status: { $in: ['assigned', 'confirmed'] } });
  if (!booking) throw new ApiError(404, 'Assignment not found');
  const a = booking.assignments.id(assignmentId);
  if (a.driverStatus !== 'pending') throw new ApiError(409, `You already ${a.driverStatus} this`);
  a.driverStatus = accept ? 'accepted' : 'rejected';
  a.respondedAt = new Date();
  await booking.save();
  return booking;
};

export const requestWithdrawal = async (driverId, amount, bank = {}) => {
  const settings = await getSettings();
  const amt = round2(amount);
  if (!Number.isFinite(amt) || amt < settings.minWithdrawal) throw new ApiError(400, `Minimum withdrawal is ₹${settings.minWithdrawal}`);
  // the amount leaves the balance now, so two requests can never spend the same money
  const wallet = await EventWallet.findOneAndUpdate({ driverId, balance: { $gte: amt } }, { $inc: { balance: -amt } }, { returnDocument: 'after' });
  if (!wallet) throw new ApiError(400, 'Not enough balance');
  const w = await EventWithdrawal.create({ driverId, amount: amt, bank });
  await EventWalletTransaction.create({ driverId, type: 'withdrawal_hold', amount: -amt, balanceAfter: wallet.balance, withdrawalId: w._id, note: 'Withdrawal requested' });
  return w;
};

export const settleWithdrawal = async (id, { pay, reference = '', note = '' }) => {
  const w = await EventWithdrawal.findOneAndUpdate({ _id: id, status: 'pending' }, { $set: { status: pay ? 'paid' : 'rejected', reference: clean(reference), adminNote: clean(note), processedAt: new Date() } }, { returnDocument: 'after' });
  if (!w) throw new ApiError(409, 'Withdrawal is not pending');
  notify({ driverIds: [w.driverId], title: pay ? 'Withdrawal paid' : 'Withdrawal rejected', body: pay ? `₹${w.amount} was sent to your bank account.` : `₹${w.amount} was returned to your event wallet.` });
  if (pay) {
    await EventWallet.updateOne({ driverId: w.driverId }, { $inc: { totalWithdrawn: w.amount } });
    const wal = await EventWallet.findOne({ driverId: w.driverId }).lean();
    await EventWalletTransaction.create({ driverId: w.driverId, type: 'withdrawal_paid', amount: 0, balanceAfter: wal?.balance || 0, withdrawalId: w._id, note: clean(reference) || 'Paid' });
  } else {
    const wal = await EventWallet.findOneAndUpdate({ driverId: w.driverId }, { $inc: { balance: w.amount } }, { returnDocument: 'after' });
    await EventWalletTransaction.create({ driverId: w.driverId, type: 'withdrawal_release', amount: w.amount, balanceAfter: wal?.balance || 0, withdrawalId: w._id, note: clean(note) || 'Withdrawal rejected' });
  }
  return w;
};

// ---- serializers ----------------------------------------------------------------------------------------------------
export const serializeForUser = (b) => {
  const due = paymentDue(b);
  const o = typeof b.toObject === 'function' ? b.toObject() : b;
  return {
    _id: o._id, code: o.code, status: o.status, eventTypeName: o.eventTypeName, eventTitle: o.eventTitle, notes: o.notes, zoneName: o.zoneName,
    pickup: o.pickup, drop: o.drop, distanceKm: o.distanceKm, startAt: o.startAt, endAt: o.endAt, days: o.days, durationHours: o.durationHours,
    contactName: o.contactName, contactPhone: o.contactPhone,
    items: o.items, pricing: o.pricing, adjustments: o.adjustments,
    // the customer sees which vehicles are coming, never what each one earns
    vehicles: (o.assignments || []).map((a) => ({ categoryName: a.categoryName, vehicleName: a.vehicleName, vehicleNumber: a.vehicleNumber, driverName: a.driverName, driverPhone: a.driverPhone, tripStartedAt: a.tripStartedAt, tripEndedAt: a.tripEndedAt })),
    payments: (o.payments || []).map((p) => ({ stage: p.stage, amount: p.amount, status: p.status, paidAt: p.paidAt })),
    due, cancelReason: o.cancelReason, refundAmount: o.refundAmount, createdAt: o.createdAt,
  };
};

/** The driver sees only what the job needs, and what he earns. */
export const serializeForDriver = (b, driverId) => {
  const o = typeof b.toObject === 'function' ? b.toObject() : b;
  const mine = (o.assignments || []).filter((a) => String(a.driverId) === String(driverId));
  const live = ['confirmed', 'ongoing', 'completed'].includes(o.status);
  return mine.map((a) => ({
    assignmentId: a._id, bookingCode: o.code, bookingStatus: o.status, driverStatus: a.driverStatus,
    eventTypeName: o.eventTypeName, startAt: o.startAt, endAt: o.endAt, days: o.days,
    pickup: o.pickup, drop: o.drop, distanceKm: o.distanceKm, tripKm: round2(o.distanceKm * 2),
    vehicle: { name: a.vehicleName, number: a.vehicleNumber, category: a.categoryName },
    earning: a.driverShare, settled: Boolean(a.settledAt),
    tripStartedAt: a.tripStartedAt, tripEndedAt: a.tripEndedAt,
    canStart: ['confirmed', 'ongoing'].includes(o.status) && a.driverStatus === 'accepted' && !a.tripStartedAt && Date.now() >= startOfDayIST(o.startAt).getTime(),
    canEnd: ['confirmed', 'ongoing'].includes(o.status) && Boolean(a.tripStartedAt) && !a.tripEndedAt,
    customer: live ? { name: o.contactName, phone: o.contactPhone } : null,
  }));
};
