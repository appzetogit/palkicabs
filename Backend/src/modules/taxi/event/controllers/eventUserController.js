import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { EventBooking, EventType } from '../models/eventModels.js';
import {
  buildQuote, cancelBooking, categoryAvailability, confirmWithoutAdvance, createBooking, createPaymentOrder,
  paymentDue, serializeForUser, verifyPayment, zoneForPoint,
} from '../services/eventService.js';

const ok = (res, data, message) => res.json({ success: true, data, message });
const userId = (req) => String(req.auth?.sub || '');

const mine = async (req) => {
  const b = await EventBooking.findOne({ _id: req.params.id, userId: userId(req) });
  if (!b) throw new ApiError(404, 'Booking not found');
  return b;
};

export const listTypes = asyncHandler(async (_req, res) =>
  ok(res, await EventType.find({ active: true }).select('name description image advancePercent').sort({ order: 1, name: 1 }).lean()));

/** Which vehicle categories can be hired at a pickup point for the dates, and how many are left. */
export const availability = asyncHandler(async (req, res) => {
  const { pickup, startAt, endAt } = req.body || {};
  const lat = Number(pickup?.lat); const lng = Number(pickup?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new ApiError(400, 'Pickup location is required');
  const start = new Date(startAt); const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new ApiError(400, 'Valid start and end date-time are required');
  const zone = await zoneForPoint({ lat, lng });
  if (!zone) throw new ApiError(404, 'Event booking is not available at this pickup location yet');
  const categories = await categoryAvailability({ zoneId: zone._id, startAt: start, endAt: end });
  ok(res, { zone: { id: String(zone._id), name: zone.name }, categories, allFull: categories.length > 0 && categories.every((c) => c.full) });
});

export const quote = asyncHandler(async (req, res) => {
  const q = await buildQuote(req.body || {});
  ok(res, {
    zone: { id: String(q.zone._id), name: q.zone.name }, eventType: { id: String(q.eventType._id), name: q.eventType.name },
    distanceKm: q.distanceKm, distanceSource: q.distanceSource, startAt: q.startAt, endAt: q.endAt, days: q.days, durationHours: q.durationHours,
    items: q.items.map(({ commissionPercent, ...item }) => item), pricing: q.pricing,
    availability: q.availability, available: q.available,
    minLeadHours: q.settings.minLeadHours,
  });
});

export const create = asyncHandler(async (req, res) => {
  const b = await createBooking(userId(req), req.body || {});
  ok(res, serializeForUser(b), 'Request sent. We will assign vehicles and confirm shortly.');
});

export const list = asyncHandler(async (req, res) => {
  const rows = await EventBooking.find({ userId: userId(req) }).sort({ createdAt: -1 }).limit(100);
  ok(res, rows.map(serializeForUser));
});

export const get = asyncHandler(async (req, res) => ok(res, serializeForUser(await mine(req))));

export const cancel = asyncHandler(async (req, res) => {
  const r = await cancelBooking(req.params.id, { by: 'user', reason: req.body?.reason, userId: userId(req) });
  ok(res, { booking: serializeForUser(r.booking), refundDue: r.refundDue, refunded: r.refunded }, r.refundDue > 0 ? 'Booking cancelled. Your refund is on its way.' : 'Booking cancelled.');
});

/** Booking with no advance to pay: the customer simply confirms the assigned vehicles. */
export const confirm = asyncHandler(async (req, res) => {
  const b = await mine(req);
  const updated = await confirmWithoutAdvance(b);
  ok(res, serializeForUser(updated), 'Booking confirmed');
});

export const payOrder = asyncHandler(async (req, res) => ok(res, await createPaymentOrder(await mine(req), userId(req)), 'Payment order created'));

export const payVerify = asyncHandler(async (req, res) => {
  const b = await mine(req);
  const updated = await verifyPayment(b, userId(req), {
    orderId: String(req.body?.razorpay_order_id || ''), paymentId: String(req.body?.razorpay_payment_id || ''), signature: String(req.body?.razorpay_signature || ''),
  });
  ok(res, serializeForUser(updated), 'Payment received');
});

export const due = asyncHandler(async (req, res) => ok(res, paymentDue(await mine(req))));
