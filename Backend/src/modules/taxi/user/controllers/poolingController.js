import crypto from 'node:crypto';
import { PoolingRoute } from '../../admin/models/PoolingRoute.js';
import { PoolingVehicle } from '../../admin/models/PoolingVehicle.js';
import { PoolingBooking } from '../../admin/models/PoolingBooking.js';
import { PoolingSeatReservation } from '../../admin/models/PoolingSeatReservation.js';
import { PoolingTrip } from '../../admin/models/PoolingTrip.js';
import { UserWallet } from '../models/UserWallet.js';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { resolveConfiguredGatewayCredentials } from '../../services/paymentGatewayService.js';
import {
  fullVehicleFare,
  isDistancePriced,
  quoteBooking,
  round2,
  routeLengthKm,
  seatCountOf,
  stopKm,
} from '../../services/poolingFareService.js';

const ok = (res, data, message) => res.status(200).json({ success: true, data, message });
const created = (res, data, message) => res.status(201).json({ success: true, data, message });

const toCleanString = (value) => String(value || '').trim();
const FREE_CANCEL_HOURS = 2; // full refund to the rider's wallet up to this long before departure
const RAZORPAY_BASE = 'https://api.razorpay.com/v1';

const normalizeTravelDate = (value) => {
  const rawValue = toCleanString(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue;
  }
  const parsed = new Date(rawValue);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  throw new ApiError(400, 'travelDate must be in YYYY-MM-DD format');
};

const getCurrentUserId = (req) => String(req.auth?.sub || req.user?._id || '').trim();

const razorpayRequest = async ({ method, path, body, keyId, keySecret }) => {
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch(`${RAZORPAY_BASE}${path}`, {
    method,
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status || 502, payload?.error?.description || payload?.error?.message || 'Razorpay request failed');
  }
  return payload;
};

const createPoolingBookingCode = () =>
  `POOL${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

const createBoardingOtp = () => String(crypto.randomInt(1000, 10000));

const findStop = (route, stopId, kind) => {
  const primary = (kind === 'pickup' ? route?.pickupPoints : route?.dropPoints) || [];
  const stops = route?.stops || [];
  const hit = [...primary, ...stops].find((item) => String(item?.id || '') === String(stopId || ''));
  if (hit) return hit;
  // No stop chosen: board at the start of the route, get off at its end.
  const pool = primary.length ? primary : stops;
  const byKm = [...pool].sort((x, y) => stopKm(x) - stopKm(y));
  return kind === 'pickup' ? byKm[0] || null : byKm[byKm.length - 1] || null;
};

const getVehicleSeatIds = (vehicle = {}) => {
  const layout = Array.isArray(vehicle?.blueprint?.layout) ? vehicle.blueprint.layout : [];
  return layout.filter((item) => item?.type === 'seat').map((item) => `${item.r}-${item.c}`);
};

const getBookedSeatIds = async ({ routeId, vehicleId, scheduleId, travelDate }) => {
  const reservations = await PoolingSeatReservation.find({ route: routeId, vehicle: vehicleId, scheduleId, travelDate }).select('seatId').lean();
  return reservations.map((item) => String(item?.seatId || '')).filter(Boolean);
};

// ---- timing -----------------------------------------------------------------
const departureAt = (travelDate, schedule) => {
  const [hh = '00', mm = '00'] = String(schedule?.departureTime || '00:00').split(':');
  return new Date(`${travelDate}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:00+05:30`);
};

const dayKey = (travelDate) =>
  ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${travelDate}T12:00:00+05:30`).getUTCDay()];

const assertBookable = async ({ route, schedule, vehicleId, travelDate }) => {
  const departure = departureAt(travelDate, schedule);
  const now = Date.now();
  const buffer = Math.max(0, Number(route.boardingBufferMinutes || 0)) * 60000;
  if (departure.getTime() - buffer <= now) {
    throw new ApiError(400, 'Booking is closed for this departure');
  }
  const advance = Math.max(0, Number(route.maxAdvanceBookingHours || 0));
  if (advance > 0 && departure.getTime() - now > advance * 3600000) {
    throw new ApiError(400, `Bookings open ${advance} hours before departure`);
  }
  const days = (Array.isArray(schedule.activeDays) ? schedule.activeDays : []).map((d) => String(d).slice(0, 3).toLowerCase());
  if (days.length > 0 && !days.includes(dayKey(travelDate))) {
    throw new ApiError(400, 'This vehicle does not run on the selected day');
  }
  const trip = await PoolingTrip.findOne({ route: route._id, vehicle: vehicleId, scheduleId: schedule.id, travelDate }).lean();
  if (trip && trip.status !== 'scheduled') {
    throw new ApiError(409, 'This trip has already started');
  }
  return departure;
};

const othersOnTrip = ({ routeId, vehicleId, scheduleId, travelDate }) =>
  PoolingBooking.find({
    route: routeId,
    vehicle: vehicleId,
    scheduleId,
    travelDate: new Date(`${travelDate}T00:00:00.000Z`),
    bookingStatus: { $in: ['confirmed', 'boarded'] },
  }).select('boardKm dropKm seatsBooked').lean();

/** Validates a booking request and returns everything priced. Shared by quote, order and verify. */
const prepareBooking = async (body, { requireSeats = true } = {}) => {
  const routeId = toCleanString(body?.routeId);
  const vehicleId = toCleanString(body?.vehicleId);
  const scheduleId = toCleanString(body?.scheduleId);
  const travelDate = normalizeTravelDate(body?.travelDate || body?.date);
  const selectedSeats = Array.isArray(body?.selectedSeats)
    ? [...new Set(body.selectedSeats.map((item) => toCleanString(item)).filter(Boolean))]
    : [];

  if (!routeId || !vehicleId || !scheduleId || (requireSeats && selectedSeats.length === 0)) {
    throw new ApiError(400, 'routeId, vehicleId, scheduleId and selectedSeats are required');
  }

  const [route, vehicle] = await Promise.all([PoolingRoute.findById(routeId).lean(), PoolingVehicle.findById(vehicleId).lean()]);
  if (!route || String(route.status || '') !== 'active' || route.active === false) throw new ApiError(404, 'Pooling route not found');
  if (!vehicle || String(vehicle.status || '') !== 'active' || vehicle.approve === false) throw new ApiError(404, 'Pooling vehicle not found');

  const allowed = (route.assignedVehicleTypeIds || []).map(String);
  if (allowed.length > 0 && !allowed.includes(vehicleId)) throw new ApiError(400, 'Selected vehicle is not assigned to this route');

  const schedule = (route.schedules || []).find((item) => String(item?.id || '') === scheduleId && String(item?.status || 'active') === 'active');
  if (!schedule) throw new ApiError(404, 'Selected route schedule is not available');

  const pickupStop = findStop(route, toCleanString(body?.pickupStopId), 'pickup');
  const dropStop = findStop(route, toCleanString(body?.dropStopId), 'drop');
  if (!pickupStop || !dropStop) throw new ApiError(400, 'Pickup and drop points are required for pooling booking');

  // pickup must come before drop along the route: by sequence, else by distance when both stops have one
  const seq = (st) => (st?.sequence === undefined || st?.sequence === null || st?.sequence === '' ? null : Number(st.sequence));
  const [ps, ds] = [seq(pickupStop), seq(dropStop)];
  const [pk, dk] = [stopKm(pickupStop), stopKm(dropStop)];
  const behind = Number.isFinite(ps) && Number.isFinite(ds) ? ps >= ds : pk > 0 && dk > 0 && pk >= dk;
  if (behind) throw new ApiError(400, 'Drop point must be after the pickup point on this route');

  const seats = requireSeats ? selectedSeats.length : Math.max(1, Number(body?.seats || 1));
  if (seats > Math.max(1, Number(route.maxSeatsPerBooking || 1))) {
    throw new ApiError(400, `Maximum ${route.maxSeatsPerBooking} seats allowed per booking`);
  }

  if (requireSeats) {
    const vehicleSeatIds = new Set(getVehicleSeatIds(vehicle));
    const invalid = selectedSeats.find((seatId) => !vehicleSeatIds.has(seatId));
    if (invalid) throw new ApiError(400, `Seat ${invalid} is not available in this vehicle`);
  }

  const departure = await assertBookable({ route, schedule, vehicleId, travelDate });
  const others = await othersOnTrip({ routeId, vehicleId, scheduleId, travelDate });
  const quote = quoteBooking({ route, vehicle, pickupStop, dropStop, seats, others });
  if (quote.error) throw new ApiError(400, quote.error);
  if (!Number.isFinite(quote.maxTotal) || quote.maxTotal <= 0) throw new ApiError(400, 'Pooling fare is not configured');

  return { routeId, vehicleId, scheduleId, travelDate, selectedSeats, route, vehicle, schedule, pickupStop, dropStop, seats, departure, quote };
};

// ---- serializers --------------------------------------------------------------
const bookingEstimate = ({ booking, route, vehicle, others }) => {
  if (!booking.distancePriced) return null;
  const q = quoteBooking({
    route,
    vehicle,
    pickupStop: { kmFromStart: booking.boardKm },
    dropStop: { kmFromStart: booking.dropKm },
    seats: booking.seatsBooked,
    others: others.filter((o) => String(o._id) !== String(booking._id)),
  });
  if (q.error) return null;
  const total = Math.min(q.currentTotal, round2(booking.fare));
  return {
    baseFare: q.currentBaseFare,
    taxAmount: q.currentTaxAmount,
    total,
    refundIfNoChange: Math.max(0, round2(booking.fare - total)),
    coRiders: q.coRiders,
  };
};

const serializePoolingBooking = (booking, extra = {}) => {
  const route = booking?.route || {};
  const vehicle = booking?.vehicle || {};
  const schedule = (route.schedules || []).find((s) => s.id === booking?.scheduleId) || {};
  const travelDay = booking?.travelDate ? new Date(booking.travelDate).toISOString().slice(0, 10) : '';
  const settled = Boolean(booking?.settledAt);
  return {
    _id: booking?._id,
    bookingId: booking?.bookingId || '',
    route: route?._id ? route : undefined,
    vehicle: vehicle?._id ? vehicle : undefined,
    scheduleId: booking?.scheduleId || '',
    departureTime: schedule.departureTime || '',
    arrivalTime: schedule.arrivalTime || '',
    pickupStopId: booking?.pickupStopId || '',
    dropStopId: booking?.dropStopId || '',
    pickupLabel: booking?.pickupLabel || '',
    dropLabel: booking?.dropLabel || '',
    boardKm: Number(booking?.boardKm || 0),
    dropKm: Number(booking?.dropKm || 0),
    distancePriced: Boolean(booking?.distancePriced),
    seatsBooked: Number(booking?.seatsBooked || 0),
    selectedSeats: Array.isArray(booking?.selectedSeats) ? booking.selectedSeats : [],
    // charged up front (the maximum)
    fare: Number(booking?.fare || 0),
    paidAmount: Number(booking?.fare || 0),
    baseFare: Number(booking?.baseFare || 0),
    serviceTaxPercentage: Number(booking?.serviceTaxPercentage || 0),
    serviceTaxAmount: Number(booking?.serviceTaxAmount || 0),
    // after the trip
    finalFare: settled ? Number(booking.finalFare || 0) : null,
    finalBaseFare: settled ? Number(booking.finalBaseFare || 0) : null,
    finalTaxAmount: settled ? Number(booking.finalTaxAmount || 0) : null,
    refundAmount: Number(booking?.refundAmount || 0),
    refundTo: booking?.refundTo || '',
    settled,
    estimate: extra.estimate || null,
    currency: booking?.currency || 'INR',
    paymentStatus: booking?.paymentStatus || 'pending',
    bookingStatus: booking?.bookingStatus || 'confirmed',
    boardingOtp: ['confirmed', 'boarded'].includes(booking?.bookingStatus) ? booking?.otp || '' : '',
    travelDate: booking?.travelDate || '',
    travelDay,
    canCancel: booking?.bookingStatus === 'confirmed',
    createdAt: booking?.createdAt || null,
    updatedAt: booking?.updatedAt || null,
    payment: { provider: booking?.payment?.provider, paymentId: booking?.payment?.paymentId, status: booking?.payment?.status, paidAt: booking?.payment?.paidAt },
  };
};

const withPrimaryVehicleDriver = (route) => {
  const routeObject = typeof route?.toObject === 'function' ? route.toObject() : route;
  const primaryVehicle = Array.isArray(routeObject?.assignedVehicleTypeIds) ? routeObject.assignedVehicleTypeIds[0] : null;
  const priced = isDistancePriced(routeObject);
  return {
    ...routeObject,
    driverName: routeObject?.driverName || primaryVehicle?.driverName || '',
    driverPhone: routeObject?.driverPhone || primaryVehicle?.driverPhone || '',
    pricing: primaryVehicle
      ? {
        distancePriced: priced,
        routeKm: routeLengthKm(routeObject),
        farePerSeat: Number(routeObject.farePerSeat || 0),
        seatsInVehicle: seatCountOf(primaryVehicle),
        fullVehicleFare: fullVehicleFare(routeObject, primaryVehicle),
      }
      : null,
  };
};

// ---- endpoints ----------------------------------------------------------------
export const searchPoolingRoutes = asyncHandler(async (req, res) => {
  const escape = (v) => String(v || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const from = escape(req.query.from);
  const to = escape(req.query.to);
  const filter = { status: 'active', active: { $ne: false } };
  const clauses = [];
  if (from) clauses.push({ originLabel: { $regex: from, $options: 'i' } });
  if (to) clauses.push({ destinationLabel: { $regex: to, $options: 'i' } });
  if (clauses.length) filter.$and = clauses;

  const routes = await PoolingRoute.find(filter).populate('assignedVehicleTypeIds');
  return ok(res, routes.map(withPrimaryVehicleDriver), 'Routes fetched successfully');
});

export const getPoolingRouteDetails = asyncHandler(async (req, res) => {
  const route = await PoolingRoute.findById(req.params.id).populate('assignedVehicleTypeIds');
  if (!route) throw new ApiError(404, 'Route not found');

  const travelDate = toCleanString(req.query?.travelDate || req.query?.date);
  let seatAvailability = {};
  let tripStatus = {};

  if (travelDate) {
    const normalizedTravelDate = normalizeTravelDate(travelDate);
    const vehicleIds = (route.assignedVehicleTypeIds || []).map((item) => String(item?._id || item)).filter(Boolean);
    const scheduleIds = (route.schedules || []).filter((item) => String(item?.status || 'active') === 'active').map((item) => String(item?.id || '')).filter(Boolean);

    if (vehicleIds.length > 0 && scheduleIds.length > 0) {
      const [reservations, trips] = await Promise.all([
        PoolingSeatReservation.find({ route: route._id, vehicle: { $in: vehicleIds }, scheduleId: { $in: scheduleIds }, travelDate: normalizedTravelDate }).select('vehicle scheduleId seatId').lean(),
        PoolingTrip.find({ route: route._id, travelDate: normalizedTravelDate }).select('vehicle scheduleId status').lean(),
      ]);
      seatAvailability = reservations.reduce((acc, item) => {
        const key = `${String(item.vehicle)}:${String(item.scheduleId || '')}`;
        acc[key] = acc[key] || [];
        acc[key].push(String(item.seatId || ''));
        return acc;
      }, {});
      tripStatus = Object.fromEntries(trips.map((t) => [`${String(t.vehicle)}:${t.scheduleId}`, t.status]));
    }
  }

  return ok(res, { ...withPrimaryVehicleDriver(route), seatAvailability, tripStatus }, 'Route details fetched successfully');
});

/** What the rider sees before paying: the most they can pay, and what they pay if others join. */
export const quotePoolingBooking = asyncHandler(async (req, res) => {
  const { quote, route, vehicle, selectedSeats, departure } = await prepareBooking(req.body || {}, { requireSeats: Array.isArray(req.body?.selectedSeats) && req.body.selectedSeats.length > 0 });
  return ok(res, {
    ...quote,
    selectedSeats,
    departureAt: departure.toISOString(),
    freeCancelHours: FREE_CANCEL_HOURS,
    vehicleName: vehicle.name,
    routeName: route.routeName,
  }, 'Fare quote');
});

export const createPoolingBookingOrder = asyncHandler(async (req, res) => {
  const userId = getCurrentUserId(req);
  if (!userId) throw new ApiError(401, 'User authentication is required');

  const p = await prepareBooking(req.body || {});
  const alreadyBooked = await getBookedSeatIds(p);
  const conflict = p.selectedSeats.find((seatId) => alreadyBooked.includes(seatId));
  if (conflict) throw new ApiError(409, `Seat ${conflict} was already booked by another user`);

  const { keyId, keySecret } = await resolveConfiguredGatewayCredentials('razor_pay');
  const order = await razorpayRequest({
    method: 'POST',
    path: '/orders',
    body: {
      amount: Math.round(p.quote.maxTotal * 100),
      currency: 'INR',
      receipt: `upool_${userId.slice(-8)}_${Date.now().toString(36)}`,
      notes: {
        userId,
        routeId: p.routeId,
        vehicleId: p.vehicleId,
        scheduleId: p.scheduleId,
        travelDate: p.travelDate,
        seats: [...p.selectedSeats].sort().join(','),
        pickup: String(p.pickupStop.id || ''),
        drop: String(p.dropStop.id || ''),
      },
    },
    keyId,
    keySecret,
  });

  return created(res, {
    keyId,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency || 'INR',
    travelDate: p.travelDate,
    fare: p.quote.maxTotal,
    baseFare: p.quote.maxBaseFare,
    serviceTaxPercentage: p.quote.taxPercentage,
    serviceTaxAmount: p.quote.maxTaxAmount,
    quote: p.quote,
  }, 'Pooling payment order created successfully');
});

export const verifyPoolingBookingPayment = asyncHandler(async (req, res) => {
  const userId = getCurrentUserId(req);
  const orderId = toCleanString(req.body?.razorpay_order_id);
  const paymentId = toCleanString(req.body?.razorpay_payment_id);
  const signature = toCleanString(req.body?.razorpay_signature);

  if (!userId) throw new ApiError(401, 'User authentication is required');
  if (!orderId || !paymentId || !signature) throw new ApiError(400, 'Payment verification fields are required');

  const { keyId, keySecret } = await resolveConfiguredGatewayCredentials('razor_pay');
  const expectedSignature = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  const given = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    throw new ApiError(400, 'Invalid payment signature');
  }

  const populate = (q) => q.populate('route', 'routeName originLabel destinationLabel schedules').populate('vehicle', 'name vehicleNumber driverName driverPhone');
  const existing = await populate(PoolingBooking.findOne({ 'payment.paymentId': paymentId }));
  if (existing) {
    if (String(existing.user) !== userId) throw new ApiError(409, 'This payment was already used');
    return ok(res, serializePoolingBooking(existing), 'Pooling booking already confirmed');
  }

  const p = await prepareBooking(req.body || {});

  // The paid order must be exactly this booking: same rider, same seats, same amount.
  const order = await razorpayRequest({ method: 'GET', path: `/orders/${encodeURIComponent(orderId)}`, keyId, keySecret });
  const notes = order?.notes || {};
  const matches = Number(order?.amount) === Math.round(p.quote.maxTotal * 100)
    && String(notes.userId) === userId
    && String(notes.routeId) === p.routeId
    && String(notes.vehicleId) === p.vehicleId
    && String(notes.scheduleId) === p.scheduleId
    && String(notes.travelDate) === p.travelDate
    && String(notes.seats) === [...p.selectedSeats].sort().join(',');
  if (!matches || String(order?.status) !== 'paid') throw new ApiError(400, 'Payment could not be verified');

  const alreadyBooked = await getBookedSeatIds(p);
  const refundAndFail = async (message) => {
    // a retried verify refunds again; Razorpay rejects a second full refund, so the rider is never refunded twice
    let refunded = true;
    await razorpayRequest({ method: 'POST', path: `/payments/${encodeURIComponent(paymentId)}/refund`, body: { amount: order.amount, notes: { reason: 'pooling seat conflict' } }, keyId, keySecret })
      .catch((e) => { refunded = /already.*refund/i.test(String(e?.message || '')); if (!refunded) console.error('[pooling] refund failed', paymentId, e?.message); });
    throw new ApiError(409, refunded ? `${message} Your payment is being refunded.` : `${message} We could not refund automatically. Please contact support with payment ${paymentId}.`);
  };
  const conflict = p.selectedSeats.find((seatId) => alreadyBooked.includes(seatId));
  if (conflict) await refundAndFail(`Seat ${conflict} was just booked by another user.`);

  const q = p.quote;
  const booking = await PoolingBooking.create({
    bookingId: createPoolingBookingCode(),
    user: userId,
    route: p.routeId,
    vehicle: p.vehicleId,
    scheduleId: p.scheduleId,
    pickupStopId: String(p.pickupStop.id || ''),
    dropStopId: String(p.dropStop.id || ''),
    seatsBooked: p.selectedSeats.length,
    selectedSeats: p.selectedSeats,
    boardKm: q.boardKm,
    dropKm: q.dropKm,
    distancePriced: q.distancePriced,
    fare: q.maxTotal,
    baseFare: q.maxBaseFare,
    serviceTaxPercentage: q.taxPercentage,
    serviceTaxAmount: q.maxTaxAmount,
    driverCommissionPercentage: Number(p.vehicle.adminCommissionPercentage || 0),
    ownerCommissionPercentage: Number(p.vehicle.ownerCommissionPercentage || 0),
    currency: 'INR',
    paymentStatus: 'paid',
    bookingStatus: 'confirmed',
    travelDate: new Date(`${p.travelDate}T00:00:00.000Z`),
    pickupLabel: p.pickupStop.name || p.pickupStop.address || p.route.originLabel || '',
    dropLabel: p.dropStop.name || p.dropStop.address || p.route.destinationLabel || '',
    otp: createBoardingOtp(),
    payment: { provider: 'razorpay', orderId, paymentId, signature, status: 'paid', paidAt: new Date() },
  });

  try {
    await PoolingSeatReservation.insertMany(
      p.selectedSeats.map((seatId) => ({ route: p.routeId, vehicle: p.vehicleId, booking: booking._id, scheduleId: p.scheduleId, travelDate: p.travelDate, seatId })),
      { ordered: true },
    );
  } catch (error) {
    await PoolingBooking.deleteOne({ _id: booking._id });
    await PoolingSeatReservation.deleteMany({ booking: booking._id });
    if (error?.code === 11000) await refundAndFail('One or more selected seats were just booked by another user.');
    throw error;
  }

  const hydrated = await populate(PoolingBooking.findById(booking._id));
  return created(res, serializePoolingBooking(hydrated), 'Pooling booking confirmed successfully');
});

export const createPoolingBooking = asyncHandler(async (_req, _res) => {
  throw new ApiError(405, 'Direct pooling booking is disabled. Please complete online payment first.');
});

/** The rider's bookings, each with what they are paying right now given who else is on the trip. */
export const getMyPoolingBookings = asyncHandler(async (req, res) => {
  const userId = getCurrentUserId(req);
  if (!userId) throw new ApiError(401, 'User authentication is required');

  const bookings = await PoolingBooking.find({ user: userId })
    .populate('route')
    .populate('vehicle')
    .sort({ createdAt: -1 })
    .lean();

  const live = bookings.filter((b) => ['confirmed', 'boarded'].includes(b.bookingStatus) && b.distancePriced);
  const tripKeys = [...new Set(live.map((b) => `${b.route?._id}|${b.vehicle?._id}|${b.scheduleId}|${new Date(b.travelDate).toISOString()}`))];
  const tripOthers = {};
  await Promise.all(tripKeys.map(async (key) => {
    const [route, vehicle, scheduleId, date] = key.split('|');
    tripOthers[key] = await PoolingBooking.find({ route, vehicle, scheduleId, travelDate: new Date(date), bookingStatus: { $in: ['confirmed', 'boarded'] } }).select('boardKm dropKm seatsBooked').lean();
  }));

  return ok(res, bookings.map((b) => {
    const key = `${b.route?._id}|${b.vehicle?._id}|${b.scheduleId}|${new Date(b.travelDate).toISOString()}`;
    const estimate = live.includes(b) && b.route && b.vehicle ? bookingEstimate({ booking: b, route: b.route, vehicle: b.vehicle, others: tripOthers[key] || [] }) : null;
    return serializePoolingBooking(b, { estimate });
  }), 'My bookings fetched successfully');
});

export const getMyPoolingBooking = asyncHandler(async (req, res) => {
  const userId = getCurrentUserId(req);
  const booking = await PoolingBooking.findOne({ _id: req.params.id, user: userId }).populate('route').populate('vehicle').lean();
  if (!booking) throw new ApiError(404, 'Booking not found');
  const others = booking.distancePriced && ['confirmed', 'boarded'].includes(booking.bookingStatus)
    ? await PoolingBooking.find({ route: booking.route._id, vehicle: booking.vehicle._id, scheduleId: booking.scheduleId, travelDate: booking.travelDate, bookingStatus: { $in: ['confirmed', 'boarded'] } }).select('boardKm dropKm seatsBooked').lean()
    : [];
  const estimate = others.length ? bookingEstimate({ booking, route: booking.route, vehicle: booking.vehicle, others }) : null;
  return ok(res, serializePoolingBooking(booking, { estimate }), 'Booking fetched');
});

/** Free cancel up to FREE_CANCEL_HOURS before departure: the whole payment goes back to the wallet. */
export const cancelMyPoolingBooking = asyncHandler(async (req, res) => {
  const userId = getCurrentUserId(req);
  const booking = await PoolingBooking.findOne({ _id: req.params.id, user: userId }).populate('route', 'schedules routeName').lean();
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.bookingStatus !== 'confirmed') throw new ApiError(409, 'Only a confirmed booking can be cancelled');

  const schedule = (booking.route?.schedules || []).find((s) => s.id === booking.scheduleId);
  const day = new Date(booking.travelDate).toISOString().slice(0, 10);
  const departure = departureAt(day, schedule);
  const refund = departure.getTime() - Date.now() >= FREE_CANCEL_HOURS * 3600000 ? round2(booking.fare) : 0;

  const claimed = await PoolingBooking.findOneAndUpdate(
    { _id: booking._id, bookingStatus: 'confirmed' },
    { $set: { bookingStatus: 'cancelled', cancelledAt: new Date(), cancelledBy: 'rider', refundAmount: refund, refundTo: refund > 0 ? 'wallet' : '' } },
    { returnDocument: 'after' },
  );
  if (!claimed) throw new ApiError(409, 'Booking was already updated');
  await PoolingSeatReservation.deleteMany({ booking: booking._id });

  if (refund > 0) {
    await UserWallet.findOneAndUpdate(
      { userId },
      {
        $inc: { balance: refund },
        $push: { transactions: { kind: 'credit', amount: refund, title: `Pooling refund ${booking.bookingId}`, referenceKey: `pool-refund-${booking._id}` } },
        $setOnInsert: { userId },
      },
      { upsert: true },
    );
  }

  return ok(res, { bookingId: booking.bookingId, refundAmount: refund, refundTo: refund > 0 ? 'wallet' : '', freeCancelHours: FREE_CANCEL_HOURS }, refund > 0 ? 'Booking cancelled. Refund added to your wallet.' : 'Booking cancelled. It was too close to departure for a refund.');
});
