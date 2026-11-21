/**
 * Car-pooling demo data for the distance-shared fare model.
 *
 *  - gives every pooling vehicle a real seat layout (seat ids are "row-col")
 *  - sets route distance and the km of every stop
 *  - adds the sample route "Indore to Maheshwar (100 km, Rs 800 per seat)"
 *  - rebuilds the demo bookings: finished trips are settled through the real
 *    completeTrip() code, upcoming trips are left confirmed with OTPs
 *
 * Replaces the old demo pooling bookings (ids PLKPB*). Idempotent:
 *   node scripts/seedPalkiPooling.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PoolingRoute } from '../src/modules/taxi/admin/models/PoolingRoute.js';
import { PoolingVehicle } from '../src/modules/taxi/admin/models/PoolingVehicle.js';
import { PoolingBooking } from '../src/modules/taxi/admin/models/PoolingBooking.js';
import { PoolingSeatReservation } from '../src/modules/taxi/admin/models/PoolingSeatReservation.js';
import { PoolingTrip } from '../src/modules/taxi/admin/models/PoolingTrip.js';
import { User } from '../src/modules/taxi/user/models/User.js';
import { quoteBooking, round2 } from '../src/modules/taxi/services/poolingFareService.js';
import { completeTrip } from '../src/modules/taxi/services/poolingTripService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DAY = 864e5;
const istDay = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(t));

/** n passenger seats: front seat, then rows of three. Seat id = "row-col". */
const seatLayout = (n) => {
  const seats = [[0, 2]];
  for (let r = 1; seats.length < n; r += 1) for (let c = 0; c < 3 && seats.length < n; c += 1) seats.push([r, c]);
  const rows = Math.max(...seats.map(([r]) => r)) + 1;
  return {
    rows, cols: 3,
    layout: [{ r: 0, c: 0, type: 'driver' }, { r: 0, c: 1, type: 'empty' }, ...seats.map(([r, c]) => ({ r, c, type: 'seat' }))],
    seatIds: seats.map(([r, c]) => `${r}-${c}`),
  };
};

const stop = (id, name, address, type, sequence, km, lat, lng) => ({ id, name, address, stopType: type, sequence, etaMinutes: Math.round(km * 1.3), kmFromStart: km, latitude: lat, longitude: lng });

const ROUTES = {
  'IND-UJJ': { km: 55, fare: 150, stops: [stop('i1', 'Vijay Nagar', 'Vijay Nagar, Indore', 'pickup', 1, 0, 22.7533, 75.8937), stop('i2', 'Bhawarkuan', 'Bhawarkuan, Indore', 'pickup', 2, 8, 22.6979, 75.8681), stop('u1', 'Mahakal Temple', 'Mahakaleshwar, Ujjain', 'drop', 3, 55, 23.1828, 75.7683)] },
  'IND-BPL': { km: 190, fare: 400, stops: [stop('i1', 'Vijay Nagar', 'Vijay Nagar, Indore', 'pickup', 1, 0, 22.7533, 75.8937), stop('d1', 'Dewas Bypass', 'Dewas Bypass', 'both', 2, 37, 22.9676, 76.0534), stop('b1', 'ISBT', 'ISBT, Bhopal', 'drop', 3, 190, 23.2599, 77.4126)] },
  'IND-DWS': { km: 37, fare: 100, stops: [stop('i1', 'Bhawarkuan', 'Bhawarkuan, Indore', 'pickup', 1, 0, 22.6979, 75.8681), stop('d1', 'Dewas Bus Stand', 'Bus Stand, Dewas', 'drop', 2, 37, 22.9676, 76.0534)] },
  'LKO-KNP': { km: 80, fare: 200, stops: [stop('l1', 'Charbagh', 'Charbagh, Lucknow', 'pickup', 1, 0, 26.8315, 80.922), stop('k1', 'Kanpur Central', 'Kanpur Central', 'drop', 2, 80, 26.454, 80.3507)] },
  'LKO-VNS': { km: 300, fare: 600, stops: [stop('l1', 'Gomti Nagar', 'Gomti Nagar, Lucknow', 'pickup', 1, 0, 26.8528, 81.0066), stop('r1', 'Raebareli Road', 'Raebareli Road', 'both', 2, 80, 26.43, 81.3), stop('v1', 'Cantt', 'Cantt, Varanasi', 'drop', 3, 300, 25.3263, 82.9826)] },
  'NDA-AGR': { km: 200, fare: 450, stops: [stop('n1', 'Sector 18', 'Sector 18, Noida', 'pickup', 1, 0, 28.57, 77.3219), stop('m1', 'Mathura Toll', 'Mathura Toll Plaza', 'both', 2, 140, 27.6, 77.7), stop('a1', 'Sanjay Place', 'Sanjay Place, Agra', 'drop', 3, 200, 27.1957, 78.0081)] },
};
// The sample from the client: 100 km, Rs 800 per seat, four seats -> Rs 3,200 for the vehicle.
const SAMPLE = {
  routeCode: 'IND-MHW', routeName: 'Indore to Maheshwar (100 km sample)', originLabel: 'Indore', destinationLabel: 'Maheshwar', km: 100, fare: 800,
  stops: [stop('m0', 'Indore Vijay Nagar', 'Vijay Nagar, Indore', 'pickup', 1, 0, 22.7533, 75.8937), stop('m20', 'Mhow Naka', 'Mhow Naka', 'both', 2, 20, 22.55, 75.76),
    stop('m40', 'Simrol', 'Simrol', 'both', 3, 40, 22.57, 75.6), stop('m50', 'Choral', 'Choral', 'both', 4, 50, 22.4, 75.65), stop('m60', 'Sanawad', 'Sanawad', 'both', 5, 60, 22.18, 76.06),
    stop('m100', 'Maheshwar Ghat', 'Maheshwar Ghat', 'drop', 6, 100, 22.18, 75.59)],
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || undefined });
  const out = {};

  // vehicles: seat layouts
  const vehicles = await PoolingVehicle.find().sort({ vehicleNumber: 1 }).lean();
  for (const v of vehicles) {
    const seats = Math.min(6, Math.max(4, Number(v.capacity || 4)));
    const bp = seatLayout(seats);
    await PoolingVehicle.updateOne({ _id: v._id }, { $set: { capacity: seats, blueprint: { rows: bp.rows, cols: bp.cols, layout: bp.layout }, walletBalance: 0, totalEarnings: 0 } });
  }
  const vehicleDocs = await PoolingVehicle.find().sort({ vehicleNumber: 1 }).lean();
  const indoreVehicles = vehicleDocs.filter((v) => /^MP/.test(v.vehicleNumber));
  out.vehicles = vehicleDocs.length;

  // routes: km and stops; sample route
  for (const [code, r] of Object.entries(ROUTES)) {
    await PoolingRoute.updateOne({ routeCode: code }, { $set: { routeDistanceKm: r.km, farePerSeat: r.fare, stops: r.stops, pickupPoints: r.stops.filter((s) => s.stopType !== 'drop'), dropPoints: r.stops.filter((s) => s.stopType !== 'pickup'), maxSeatsPerBooking: 4 } });
  }
  const sampleVehicles = indoreVehicles.map((v) => v._id);
  await PoolingRoute.findOneAndUpdate({ routeCode: SAMPLE.routeCode }, { $set: {
    routeName: SAMPLE.routeName, routeCode: SAMPLE.routeCode, originLabel: SAMPLE.originLabel, destinationLabel: SAMPLE.destinationLabel,
    description: '100 km sample: the whole vehicle costs Rs 3,200 (4 seats x Rs 800) and is shared by distance.',
    assignedVehicleTypeIds: sampleVehicles, routeDistanceKm: SAMPLE.km, farePerSeat: SAMPLE.fare, maxSeatsPerBooking: 4, maxAdvanceBookingHours: 168, boardingBufferMinutes: 30,
    stops: SAMPLE.stops, pickupPoints: SAMPLE.stops.filter((s) => s.stopType !== 'drop'), dropPoints: SAMPLE.stops.filter((s) => s.stopType !== 'pickup'),
    schedules: [{ id: 's1', label: 'Morning', departureTime: '07:30', arrivalTime: '10:30', activeDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], status: 'active' }],
    poolingRules: { allowInstantBooking: true, allowLuggage: true, womenOnly: false, autoAssignNearestPickup: true, maxDetourKm: 5 }, status: 'active', active: true,
  } }, { upsert: true, setDefaultsOnInsert: true });
  const routes = await PoolingRoute.find({ routeDistanceKm: { $gt: 0 } }).lean();
  const routeBy = Object.fromEntries(routes.map((r) => [r.routeCode, r]));
  out.routes = routes.length;

  // wipe the old demo pooling bookings and trips
  const old = await PoolingBooking.find({ bookingId: /^PLKP[BT]/ }).select('_id').lean();
  await PoolingSeatReservation.deleteMany({ booking: { $in: old.map((b) => b._id) } });
  await PoolingBooking.deleteMany({ _id: { $in: old.map((b) => b._id) } });
  await PoolingTrip.deleteMany({});
  await PoolingVehicle.updateMany({}, { $set: { walletBalance: 0, totalEarnings: 0 } });

  const users = await User.find({ phone: /^900001\d{4}$/ }).sort({ phone: 1 }).lean();
  let n = 0;
  const makeBooking = async ({ route, vehicle, scheduleId, travelDate, board, drop, seats, status, user, takenSeats }) => {
    const pickupStop = route.stops.find((s) => s.kmFromStart === board) || route.stops[0];
    const dropStop = route.stops.find((s) => s.kmFromStart === drop) || route.stops[route.stops.length - 1];
    const q = quoteBooking({ route, vehicle, pickupStop, dropStop, seats, others: [] });
    const layout = vehicle.blueprint.layout.filter((l) => l.type === 'seat').map((l) => `${l.r}-${l.c}`);
    const picked = layout.filter((id) => !takenSeats.has(id)).slice(0, seats);
    picked.forEach((id) => takenSeats.add(id));
    n += 1;
    const created = new Date(new Date(`${travelDate}T00:00:00Z`).getTime() - 2 * DAY);
    const doc = await PoolingBooking.create({
      bookingId: `PLKPT${1000 + n}`, user: user._id, route: route._id, vehicle: vehicle._id, scheduleId, pickupStopId: pickupStop.id, dropStopId: dropStop.id,
      seatsBooked: seats, selectedSeats: picked, boardKm: q.boardKm, dropKm: q.dropKm, distancePriced: true, fare: q.maxTotal, baseFare: q.maxBaseFare,
      serviceTaxPercentage: q.taxPercentage, serviceTaxAmount: q.maxTaxAmount, driverCommissionPercentage: vehicle.adminCommissionPercentage || 0, ownerCommissionPercentage: vehicle.ownerCommissionPercentage || 0,
      currency: 'INR', paymentStatus: 'paid', bookingStatus: status, travelDate: new Date(`${travelDate}T00:00:00.000Z`),
      pickupLabel: pickupStop.name, dropLabel: dropStop.name, otp: String(1000 + ((n * 937) % 9000)), boardedAt: status === 'boarded' ? created : null,
      payment: { provider: 'razorpay', orderId: `order_demopool${n}`, paymentId: `pay_demopool${n}`, status: 'paid', paidAt: created },
    });
    if (status === 'confirmed') {
      await PoolingSeatReservation.insertMany(picked.map((seatId) => ({ route: route._id, vehicle: vehicle._id, booking: doc._id, scheduleId, travelDate, seatId })));
    }
    return doc;
  };

  const today = Date.now();
  const sample = routeBy['IND-MHW']; const vSample = indoreVehicles[0]; // 4 seats, owner vehicle
  const plans = [
    // past, finished and settled with the real code: the client's own example (one rider alone, then others join)
    { route: sample, vehicle: vSample, offset: -3, riders: [[0, 100, 1], [60, 100, 1]] },
    { route: sample, vehicle: vSample, offset: -2, riders: [[0, 100, 1], [20, 100, 1], [50, 100, 1]] },
    { route: sample, vehicle: vSample, offset: -1, riders: [[0, 100, 1], [0, 100, 1], [0, 100, 1], [0, 100, 1]] },
    { route: routeBy['IND-UJJ'], vehicle: indoreVehicles[1] || vSample, offset: -2, riders: [[0, 55, 1], [8, 55, 2], [8, 55, 1]], noShow: 2 },
    { route: routeBy['IND-BPL'], vehicle: indoreVehicles[1] || vSample, offset: -4, riders: [[0, 190, 1], [37, 190, 1], [0, 37, 1]] },
  ];
  let settled = 0;
  for (const p of plans) {
    const travelDate = istDay(today + p.offset * DAY);
    const taken = new Set();
    const vehicle = p.vehicle; const scheduleId = p.route.schedules[0].id;
    for (const [i, [board, drop, seats]] of p.riders.entries()) {
      const noShow = p.noShow === i; // this rider never turns up: no refund
      await makeBooking({ route: p.route, vehicle, scheduleId, travelDate, board, drop, seats, status: noShow ? 'confirmed' : 'boarded', user: users[(n * 3 + 5) % users.length], takenSeats: taken });
    }
    await PoolingTrip.create({ route: p.route._id, vehicle: vehicle._id, scheduleId, travelDate, status: 'started', startedAt: new Date(`${travelDate}T02:00:00Z`) });
    await completeTrip({ vehicleId: vehicle._id, routeId: p.route._id, scheduleId, travelDate });
    settled += 1;
  }
  out.settledTrips = settled;

  // upcoming: sample route tomorrow (rider A alone, B joins at 60 km), a second day, plus other routes
  const future = [
    { route: sample, vehicle: vSample, offset: 1, riders: [[0, 100, 1], [60, 100, 1]] },
    { route: sample, vehicle: vSample, offset: 2, riders: [[0, 100, 2], [20, 100, 1]] },
    { route: routeBy['IND-UJJ'], vehicle: indoreVehicles[1] || vSample, offset: 1, riders: [[0, 55, 1]] },
    { route: routeBy['LKO-KNP'], vehicle: vehicleDocs.find((v) => /^UP/.test(v.vehicleNumber)), offset: 1, riders: [[0, 80, 1], [0, 80, 1]] },
    { route: routeBy['LKO-VNS'], vehicle: vehicleDocs.filter((v) => /^UP/.test(v.vehicleNumber))[1], offset: 3, riders: [[0, 300, 1], [80, 300, 1], [80, 300, 2]] },
  ];
  let upcoming = 0;
  for (const p of future) {
    if (!p.vehicle || !p.route) continue;
    const travelDate = istDay(today + p.offset * DAY);
    const taken = new Set();
    for (const [board, drop, seats] of p.riders) {
      await makeBooking({ route: p.route, vehicle: p.vehicle, scheduleId: p.route.schedules[0].id, travelDate, board, drop, seats, status: 'confirmed', user: users[(n * 3 + 5) % users.length], takenSeats: taken });
      upcoming += 1;
    }
  }
  out.upcomingBookings = upcoming;

  const earned = await PoolingVehicle.find({ totalEarnings: { $gt: 0 } }).select('name totalEarnings').lean();
  out.driverEarnings = earned.map((v) => `${v.name}: Rs ${round2(v.totalEarnings)}`);
  console.log(JSON.stringify(out, null, 1));
  await mongoose.disconnect();
};

run().catch((e) => { console.error('seed pooling failed:', e.message); process.exit(1); });
