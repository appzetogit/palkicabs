/**
 * Car-pooling trip lifecycle, from the driver's side.
 *
 *   scheduled -> started (driver taps Start) -> riders board (driver enters each rider's OTP)
 *             -> completed (driver taps Complete): every booking is settled
 *
 * Settlement: riders who boarded pay their distance share (see poolingFareService);
 * the difference from what they paid up front goes back to their wallet. A rider who
 * never boarded is a no-show and keeps paying what they paid. The platform keeps its
 * commission, the owner (if the vehicle has one) gets their share, the driver gets the rest.
 */
import crypto from 'node:crypto';
import { PoolingBooking } from '../admin/models/PoolingBooking.js';
import { PoolingTrip } from '../admin/models/PoolingTrip.js';
import { PoolingVehicle } from '../admin/models/PoolingVehicle.js';
import { PoolingRoute } from '../admin/models/PoolingRoute.js';
import { Owner } from '../admin/models/Owner.js';
import { OwnerWalletTransaction } from '../admin/models/OwnerWalletTransaction.js';
import { UserWallet } from '../user/models/UserWallet.js';
import { User } from '../user/models/User.js';
import { ApiError } from '../../../utils/ApiError.js';
import { round2, seatCountOf, settleShares } from './poolingFareService.js';

const istDay = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
const dayOf = (travelDate) => istDay(new Date(travelDate)).slice(0, 10);
const utcDay = (travelDate) => new Date(travelDate).toISOString().slice(0, 10);

const noShowRow = (booking, vehicle) => {
  // A no-show forfeits what was paid: commission and shares are taken on the base amount paid.
  const base = round2(booking.baseFare);
  const platform = round2((base * Math.max(0, Number(vehicle.adminCommissionPercentage || 0))) / 100);
  const ownerPct = vehicle.ownerId ? Math.max(0, Number(vehicle.ownerCommissionPercentage || 0)) : 0;
  const ownerShare = round2(((base - platform) * ownerPct) / 100);
  return {
    bookingId: String(booking._id),
    finalBaseFare: base,
    finalTaxAmount: round2(booking.serviceTaxAmount),
    finalFare: round2(booking.fare),
    platformCommission: platform,
    ownerShare,
    driverEarning: round2(base - platform - ownerShare),
    refund: 0,
  };
};

const tripBookings = ({ routeId, vehicleId, scheduleId, travelDate, statuses }) =>
  PoolingBooking.find({
    route: routeId,
    vehicle: vehicleId,
    scheduleId,
    travelDate: new Date(`${travelDate}T00:00:00.000Z`),
    ...(statuses ? { bookingStatus: { $in: statuses } } : {}),
  });

/** All of this vehicle's trips (grouped bookings) for the driver app. */
export const listDriverTrips = async ({ vehicleId }) => {
  const since = new Date(Date.now() - 45 * 86400000);
  const [vehicle, bookings] = await Promise.all([
    PoolingVehicle.findById(vehicleId).lean(),
    PoolingBooking.find({ vehicle: vehicleId, travelDate: { $gte: since } })
      .populate({ path: 'user', model: User, select: 'name phone' })
      .populate({ path: 'route', model: PoolingRoute })
      .sort({ travelDate: -1, createdAt: 1 })
      .lean(),
  ]);
  if (!vehicle) throw new ApiError(404, 'Pooling vehicle not found');

  const groups = new Map();
  for (const b of bookings) {
    if (!b.route?._id) continue;
    const key = `${b.route._id}|${b.scheduleId}|${utcDay(b.travelDate)}`;
    if (!groups.has(key)) groups.set(key, { route: b.route, scheduleId: b.scheduleId, travelDate: utcDay(b.travelDate), bookings: [] });
    groups.get(key).bookings.push(b);
  }
  const trips = await PoolingTrip.find({ vehicle: vehicleId, travelDate: { $in: [...groups.values()].map((g) => g.travelDate) } }).lean();
  const tripByKey = Object.fromEntries(trips.map((t) => [`${t.route}|${t.scheduleId}|${t.travelDate}`, t]));
  const today = istDay();

  return [...groups.entries()].map(([key, g]) => {
    const trip = tripByKey[key] || null;
    const schedule = (g.route.schedules || []).find((s) => s.id === g.scheduleId) || {};
    const live = g.bookings.filter((b) => ['confirmed', 'boarded'].includes(b.bookingStatus));
    const estimate = trip?.status === 'completed' ? [] : settleShares({ route: g.route, vehicle, bookings: live });
    const estById = Object.fromEntries(estimate.map((e) => [e.bookingId, e]));
    const status = trip?.status || 'scheduled';

    return {
      key,
      routeId: String(g.route._id),
      routeName: g.route.routeName,
      origin: g.route.originLabel,
      destination: g.route.destinationLabel,
      scheduleId: g.scheduleId,
      scheduleLabel: schedule.label || '',
      departureTime: schedule.departureTime || '',
      arrivalTime: schedule.arrivalTime || '',
      travelDate: g.travelDate,
      status,
      seatsInVehicle: seatCountOf(vehicle),
      seatsBooked: live.reduce((n, b) => n + b.seatsBooked, 0),
      canStart: status === 'scheduled' && live.length > 0 && g.travelDate <= today,
      canComplete: status === 'started',
      passengers: g.bookings.map((b) => ({
        bookingId: String(b._id),
        code: b.bookingId,
        name: b.user?.name || 'Rider',
        phone: b.user?.phone || '',
        seats: b.seatsBooked,
        selectedSeats: b.selectedSeats,
        pickup: b.pickupLabel,
        drop: b.dropLabel,
        boardKm: b.boardKm,
        dropKm: b.dropKm,
        status: b.bookingStatus,
        paid: round2(b.fare),
        finalFare: b.settledAt ? round2(b.finalFare) : null,
        estimatedFare: estById[String(b._id)] ? estById[String(b._id)].finalFare : null,
        driverEarning: b.settledAt ? round2(b.driverEarningAmount) : (estById[String(b._id)]?.driverEarning ?? null),
      })),
      totals: {
        collected: round2(live.reduce((n, b) => n + b.fare, 0)),
        estimatedDriverEarning: round2(estimate.reduce((n, e) => n + e.driverEarning, 0)),
        settledDriverEarning: trip?.status === 'completed' ? round2(trip.settlement?.driverEarning) : null,
      },
    };
  });
};

export const startTrip = async ({ vehicleId, routeId, scheduleId, travelDate }) => {
  if (travelDate > istDay()) throw new ApiError(400, 'This trip is on a later day');
  const live = await tripBookings({ routeId, vehicleId, scheduleId, travelDate, statuses: ['confirmed', 'boarded'] }).countDocuments();
  if (live === 0) throw new ApiError(400, 'No confirmed bookings on this trip');
  const trip = await PoolingTrip.findOneAndUpdate(
    { route: routeId, vehicle: vehicleId, scheduleId, travelDate, status: { $in: ['scheduled', 'started'] } },
    { $set: { status: 'started' }, $setOnInsert: { startedAt: new Date() } },
    { upsert: true, returnDocument: 'after' },
  ).catch((e) => { if (e?.code === 11000) throw new ApiError(409, 'This trip is already completed'); throw e; });
  return { tripId: String(trip._id), status: trip.status, startedAt: trip.startedAt };
};

export const boardPassenger = async ({ vehicleId, bookingId, otp }) => {
  const booking = await PoolingBooking.findOne({ _id: bookingId, vehicle: vehicleId });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.bookingStatus === 'boarded') return { bookingId, status: 'boarded', already: true };
  if (booking.bookingStatus !== 'confirmed') throw new ApiError(409, `Booking is ${booking.bookingStatus}`);

  const trip = await PoolingTrip.findOne({ route: booking.route, vehicle: vehicleId, scheduleId: booking.scheduleId, travelDate: utcDay(booking.travelDate) }).lean();
  if (trip?.status !== 'started') throw new ApiError(409, 'Start the trip before boarding riders');

  const given = Buffer.from(String(otp || '').trim());
  const expected = Buffer.from(String(booking.otp || ''));
  if (given.length === 0 || given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    throw new ApiError(400, 'Wrong OTP');
  }
  booking.bookingStatus = 'boarded';
  booking.boardedAt = new Date();
  await booking.save();
  return { bookingId, status: 'boarded' };
};

const creditRiderWallet = (userId, amount, bookingId, code) =>
  UserWallet.findOneAndUpdate(
    { userId },
    {
      $inc: { balance: amount },
      $push: { transactions: { kind: 'credit', amount, title: `Pooling fare adjustment ${code}`, referenceKey: `pool-settle-${bookingId}` } },
      $setOnInsert: { userId },
    },
    { upsert: true },
  );

export const completeTrip = async ({ vehicleId, routeId, scheduleId, travelDate }) => {
  // Claim the trip first, so a double tap cannot settle twice.
  const claimed = await PoolingTrip.findOneAndUpdate(
    { route: routeId, vehicle: vehicleId, scheduleId, travelDate, status: 'started' },
    { $set: { status: 'completed', completedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!claimed) throw new ApiError(409, 'Trip is not running (start it first, or it is already completed)');

  const [route, vehicle, bookings] = await Promise.all([
    PoolingRoute.findById(routeId).lean(),
    PoolingVehicle.findById(vehicleId).lean(),
    tripBookings({ routeId, vehicleId, scheduleId, travelDate, statuses: ['confirmed', 'boarded'] }).lean(),
  ]);

  const boarded = bookings.filter((b) => b.bookingStatus === 'boarded');
  const noShows = bookings.filter((b) => b.bookingStatus === 'confirmed');
  const rows = [...settleShares({ route, vehicle, bookings: boarded }), ...noShows.map((b) => noShowRow(b, vehicle))];
  const byId = Object.fromEntries(bookings.map((b) => [String(b._id), b]));
  const totals = { riders: boarded.length, noShows: noShows.length, collected: 0, refunded: 0, tax: 0, platformCommission: 0, ownerShare: 0, driverEarning: 0, noShowForfeit: 0 };

  for (const row of rows) {
    const b = byId[row.bookingId];
    const isNoShow = b.bookingStatus === 'confirmed';
    const updated = await PoolingBooking.findOneAndUpdate(
      { _id: b._id, settledAt: null },
      { $set: {
        bookingStatus: isNoShow ? 'no_show' : 'completed',
        finalBaseFare: row.finalBaseFare, finalTaxAmount: row.finalTaxAmount, finalFare: row.finalFare,
        refundAmount: row.refund, refundTo: row.refund > 0 ? 'wallet' : '',
        platformCommissionAmount: row.platformCommission, ownerShareAmount: row.ownerShare, driverEarningAmount: row.driverEarning,
        driverCommissionAmount: row.platformCommission, ownerCommissionAmount: row.ownerShare,
        settledAt: new Date(),
      } },
    );
    if (!updated) continue;
    if (row.refund > 0) await creditRiderWallet(b.user, row.refund, b._id, b.bookingId);
    totals.collected += row.finalFare;
    totals.refunded += row.refund;
    totals.tax += row.finalTaxAmount;
    totals.platformCommission += row.platformCommission;
    totals.ownerShare += row.ownerShare;
    totals.driverEarning += row.driverEarning;
    if (isNoShow) totals.noShowForfeit += row.finalFare;
  }
  for (const k of Object.keys(totals)) totals[k] = round2(totals[k]);

  if (totals.driverEarning > 0) {
    await PoolingVehicle.updateOne({ _id: vehicleId }, { $inc: { walletBalance: totals.driverEarning, totalEarnings: totals.driverEarning } });
  }
  if (vehicle.ownerId && totals.ownerShare > 0) {
    const owner = await Owner.findOneAndUpdate({ _id: vehicle.ownerId }, { $inc: { 'wallet.balance': totals.ownerShare } }, { returnDocument: 'after' });
    if (owner) {
      await OwnerWalletTransaction.create({
        ownerId: owner._id, amount: totals.ownerShare, kind: 'credit', balance: round2(owner.wallet?.balance || 0),
        title: `Pooling trip ${route.routeName} ${travelDate} (${vehicle.vehicleNumber})`,
      });
    }
  }

  await PoolingTrip.updateOne({ _id: claimed._id }, { $set: { settlement: totals } });
  return { tripId: String(claimed._id), status: 'completed', settlement: totals };
};

export const driverEarnings = async ({ vehicleId }) => {
  const vehicle = await PoolingVehicle.findById(vehicleId).select('walletBalance totalEarnings name vehicleNumber').lean();
  if (!vehicle) throw new ApiError(404, 'Pooling vehicle not found');
  const recent = await PoolingTrip.find({ vehicle: vehicleId, status: 'completed' }).sort({ completedAt: -1 }).limit(30).populate('route', 'routeName').lean();
  return {
    walletBalance: round2(vehicle.walletBalance),
    totalEarnings: round2(vehicle.totalEarnings),
    trips: recent.map((t) => ({ tripId: String(t._id), routeName: t.route?.routeName || '', travelDate: t.travelDate, completedAt: t.completedAt, ...t.settlement })),
  };
};
