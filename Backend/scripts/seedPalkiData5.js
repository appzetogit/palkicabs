/**
 * Part 5 of the PALKI demo data (after parts 1-4 and seedPalkiBookings.js).
 *
 *  - turns Razorpay ON (test keys already live in Admin > Third-party > Payment)
 *  - parcel / delivery vehicles with per-km pricing and commission
 *  - toll plazas around Indore and eastern Uttar Pradesh
 *  - labels some demo rides as Airport / Outstation trips
 *  - car-pooling bookings (completed / cancelled / upcoming) with seat reservations
 *
 * Toll plaza positions come from OpenStreetMap; the rates are typical NHAI car
 * rates and should be checked against the plaza's notice board before launch.
 * Idempotent:  node scripts/seedPalkiData5.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PaymentGateway } from '../src/modules/taxi/admin/models/PaymentGateway.js';
import { Vehicle } from '../src/modules/taxi/admin/models/Vehicle.js';
import { TaxiAppModule } from '../src/modules/taxi/admin/models/TaxiAppModule.js';
import { TollPlaza } from '../src/modules/taxi/admin/models/TollPlaza.js';
import { ServiceLocation } from '../src/modules/taxi/admin/models/ServiceLocation.js';
import { Airport } from '../src/modules/taxi/admin/models/Airport.js';
import { Ride } from '../src/modules/taxi/user/models/Ride.js';
import { Delivery } from '../src/modules/taxi/user/models/Delivery.js';
import { User } from '../src/modules/taxi/user/models/User.js';
import { PoolingRoute } from '../src/modules/taxi/admin/models/PoolingRoute.js';
import { PoolingVehicle } from '../src/modules/taxi/admin/models/PoolingVehicle.js';
import { PoolingBooking } from '../src/modules/taxi/admin/models/PoolingBooking.js';
import { PoolingSeatReservation } from '../src/modules/taxi/admin/models/PoolingSeatReservation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const opts = { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true };
const upsert = (Model, filter, doc) => Model.findOneAndUpdate(filter, { $set: doc }, opts);
const DAY = 864e5;
const day = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(t));

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || undefined });
  const out = {};

  // 1) Razorpay on (keys + test mode are in the third-party settings already)
  await upsert(PaymentGateway, { slug: 'razorpay' }, { name: 'Razorpay', slug: 'razorpay', active: true });
  out.razorpay = 'active (test mode)';

  // 2) parcel / delivery vehicles
  const parcelModule = await TaxiAppModule.findOne({ service_type: { $in: ['normal'] }, transport_type: 'delivery' }).lean();
  const parcel = [
    // name, image, category, capacity, base(min fare), free km, per km, free wait min, wait/min
    ['Parcel Bike', '/vehicles/bike.jpg', '2wheeler', 1, 59, 1.5, 11, 5, 1, 'bike'],
    ['Parcel Auto', '/vehicles/auto.jpg', 'trucks', 3, 93, 1.5, 16, 5, 1.5, 'auto'],
    ['Mini Truck', '/5_Parcel.png', 'trucks', 8, 267, 2, 25, 10, 3, 'truck'],
  ];
  const pv = {};
  for (const [name, image, delivery_category, capacity, base, freeKm, perKm, freeMin, waitMin, icon] of parcel) {
    pv[name] = await upsert(Vehicle, { name }, {
      name, short_description: `${name} for parcels and small goods`, description: `${name} delivery`, transport_type: 'delivery', dispatch_type: 'both', icon_types: icon,
      category: icon === 'truck' ? '' : icon, capacity, is_taxi: 'delivery', delivery_category, image, icon: image, map_icon: image, status: 1, active: true, service_tax: 5,
      admin_commission_type_from_driver: 1, admin_commission_from_driver: 12, admin_commission_type_for_owner: 1, admin_commission_for_owner: 8,
      delivery_distance_pricing: { enabled: true, base_price: base, free_distance: freeKm, distance_price: perKm, free_time: freeMin, time_price: waitMin },
      ...(parcelModule ? { app_modules: [parcelModule._id] } : {}),
    });
  }
  // keep the demo deliveries consistent with those vehicles
  const dels = await Ride.find({ serviceType: 'parcel', pickupAddress: /^\[demo/ }).sort({ createdAt: 1 }).lean();
  const names = ['Parcel Bike', 'Parcel Bike', 'Parcel Auto', 'Mini Truck'];
  for (const [i, r] of dels.entries()) {
    const v = pv[names[i % names.length]];
    await Ride.updateOne({ _id: r._id }, { $set: { vehicleTypeId: v._id, vehicleIconType: v.icon_types, transport_type: 'delivery' } }, { timestamps: false });
    if (r.deliveryId) await Delivery.updateOne({ _id: r.deliveryId }, { $set: { vehicleTypeId: v._id, vehicleIconType: v.icon_types } }, { timestamps: false });
  }
  out.parcelVehicles = parcel.length;

  // 3) toll plazas (car-class vehicles pay; two-wheelers and autos are exempt)
  const locs = Object.fromEntries((await ServiceLocation.find({ name: { $in: ['Indore', 'Uttar Pradesh'] } }).lean()).map((l) => [l.name, l]));
  const vehicles = await Vehicle.find({ transport_type: 'taxi' }).lean();
  const RATE = { 'Maruti Suzuki Swift': [75, 115], 'Hatchback': [75, 115], 'Maruti Suzuki Dzire': [75, 115], 'Maruti Eeco': [75, 115], 'Maruti Suzuki Ertiga': [120, 180],
    'Toyota Innova Crysta': [120, 180], 'Toyota Fortuner': [120, 180], 'Tempo Traveller': [235, 350] };
  const prices = vehicles.filter((v) => RATE[v.name]).map((v) => ({ vehicle_type_id: v._id, one_way: RATE[v.name][0], return_trip: RATE[v.name][1] }));
  const plazas = [
    ['Dewas Toll Plaza', 'NH 52 (Agra-Mumbai)', 22.9752, 76.2188, 'Indore'], ['Indore-Dewas Toll Plaza (Indore side)', 'NH 52', 22.9595, 76.0843, 'Indore'],
    ['Indore-Dewas Toll Plaza (Bypass)', 'NH 52', 22.8247, 75.9383, 'Indore'],
    ['Handia / Sujala Toll Plaza', 'NH 19 (Prayagraj-Varanasi)', 25.3787, 82.1568, 'Uttar Pradesh'], ['Lalanagar Toll Plaza', 'NH 19', 25.2682, 82.4859, 'Uttar Pradesh'],
    ['Daffi Toll Plaza', 'NH 19 (Varanasi)', 25.2483, 82.994, 'Uttar Pradesh'], ['Rajapur Maksudan Toll Plaza', 'NH 30 (Prayagraj)', 25.5918, 81.8417, 'Uttar Pradesh'],
    ['Khokhraj / Sirohi Toll Plaza', 'NH 30 (Prayagraj)', 25.5762, 81.5296, 'Uttar Pradesh'], ['Ronahi Toll Plaza', 'NH 27 (Ayodhya)', 26.768, 81.9496, 'Uttar Pradesh'],
    ['Mandawnagar Toll Plaza', 'NH 27 (Gorakhpur)', 26.8107, 82.7315, 'Uttar Pradesh'], ['Chaukadi Toll Plaza', 'NH 27 (Gorakhpur)', 26.7813, 82.4171, 'Uttar Pradesh'],
    ['Tendua Toll Plaza (Gorakhpur Bypass)', 'NH 27', 26.7241, 83.2745, 'Uttar Pradesh'],
  ];
  for (const [name, highway, lat, lng, place] of plazas) {
    await upsert(TollPlaza, { name }, { name, highway, location: { type: 'Point', coordinates: [lng, lat] }, radius_meters: 300, service_location_ids: [locs[place]._id], prices, active: true,
      notes: 'Position from OpenStreetMap; rates are typical NHAI car rates - verify before launch.' });
  }
  out.tollPlazas = plazas.length;

  // 4) airport / outstation labels on demo rides
  const airports = await Airport.find().lean();
  const rides = await Ride.find({ serviceType: 'ride', status: 'completed', pickupAddress: /^\[demo\]/ }).sort({ createdAt: 1 }).lean();
  const cars = new Set((await Vehicle.find({ category: 'car', transport_type: 'taxi' }).select('_id').lean()).map((v) => String(v._id)));
  const carRides = rides.filter((r) => cars.has(String(r.vehicleTypeId)));
  const OUTSTATION = ['Ujjain', 'Dewas', 'Bhopal', 'Kanpur', 'Varanasi', 'Prayagraj', 'Agra'];
  let airportN = 0; let outN = 0;
  for (const [i, r] of carRides.entries()) {
    if (i % 5 === 0 && airports.length) {
      const ap = airports[i % airports.length];
      await Ride.updateOne({ _id: r._id }, { $set: { 'trip_category.category': 'airport', 'trip_category.airport_id': ap._id, 'trip_category.airport_name': ap.name, 'trip_category.airport_fee': 50, dropAddress: `[demo] ${ap.name}` } }, { timestamps: false });
      airportN += 1;
    } else if (i % 5 === 2) {
      const city = OUTSTATION[i % OUTSTATION.length]; const km = 70 + (i % 6) * 45;
      const fare = Math.round(km * 14 + 150);
      const commission = Math.round(fare * 0.12);
      await Ride.updateOne({ _id: r._id }, { $set: { 'trip_category.category': 'outstation', dropAddress: `[demo] ${city} (outstation)`, fare, baseFare: fare, commissionAmount: commission, driverEarnings: fare - commission,
        'route.distanceMeters': km * 1000, 'route.durationMinutes': Math.round(km * 1.4), estimatedDistanceMeters: km * 1000, estimatedDurationMinutes: Math.round(km * 1.4) } }, { timestamps: false });
      outN += 1;
    }
  }
  out.airportRides = airportN; out.outstationRides = outN;

  // 5) car-pooling bookings
  const routes = await PoolingRoute.find({ routeCode: { $exists: true } }).lean();
  const pvehicles = await PoolingVehicle.find().lean();
  const users = await User.find({ phone: /^900001\d{4}$/ }).sort({ phone: 1 }).lean();
  if (routes.length && pvehicles.length) {
    const STATUS = ['completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed',
      'cancelled', 'cancelled', 'no_show', 'cancelled', 'confirmed', 'confirmed', 'confirmed', 'confirmed', 'confirmed', 'confirmed', 'confirmed', 'confirmed'];
    const now = Date.now(); let made = 0;
    for (const [i, st] of STATUS.entries()) {
      const route = routes[i % routes.length];
      const indoreSide = ['Indore'].includes(route.originLabel);
      const vehicle = pvehicles.find((v) => (indoreSide ? /^MP/ : /^UP/).test(v.vehicleNumber)) || pvehicles[0];
      const sched = route.schedules[i % route.schedules.length];
      const pickup = route.pickupPoints[0]; const drop = route.dropPoints[0];
      const seats = 1 + (i % 3);
      let offset;
      if (st === 'confirmed') offset = i < 19 ? 0 : (i - 18); // 3 today, rest on following days
      else offset = -(1 + (i % 14));
      const [hh, mm] = (sched.departureTime || '07:30').split(':').map(Number);
      const travel = new Date(`${day(now + offset * DAY)}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:30`);
      const baseFare = seats * route.farePerSeat; const tax = Math.round(baseFare * 0.05); const dComm = Math.round(baseFare * 0.1); const oComm = Math.round(baseFare * 0.05);
      const bookingId = `PLKPB${1001 + i}`;
      const created = new Date(travel.getTime() - (1 + (i % 3)) * DAY);
      const seatIds = Array.from({ length: seats }, (_, k) => `S${((i * 2 + k) % (vehicle.capacity - 1)) + 1}`);
      const refund = st === 'cancelled' || st === 'no_show';
      const doc = await PoolingBooking.findOneAndUpdate({ bookingId }, { $set: {
        bookingId, user: users[(i * 3 + 4) % users.length]._id, route: route._id, scheduleId: sched.id, vehicle: vehicle._id, pickupStopId: pickup.id, dropStopId: drop.id,
        seatsBooked: seats, selectedSeats: seatIds, fare: baseFare + tax, baseFare, serviceTaxPercentage: 5, serviceTaxAmount: tax, driverCommissionPercentage: 10, driverCommissionAmount: dComm,
        ownerCommissionPercentage: 5, ownerCommissionAmount: oComm, currency: 'INR', pickupLabel: pickup.address || pickup.name, dropLabel: drop.address || drop.name,
        paymentStatus: refund && st === 'cancelled' ? 'refunded' : 'paid', bookingStatus: st, travelDate: travel, otp: String(1000 + ((i * 731) % 9000)),
        payment: { provider: 'razorpay', orderId: `order_demo${1000 + i}`, paymentId: `pay_demo${1000 + i}`, status: 'paid', paidAt: created }, createdAt: created, updatedAt: created,
      } }, { ...opts, timestamps: false });
      if (st === 'confirmed') {
        for (const seatId of seatIds) {
          await PoolingSeatReservation.findOneAndUpdate({ route: route._id, vehicle: vehicle._id, scheduleId: sched.id, travelDate: day(travel), seatId },
            { $set: { booking: doc._id } }, { upsert: true, setDefaultsOnInsert: true });
        }
      }
      made += 1;
    }
    out.poolingBookings = made;
  }

  console.log(JSON.stringify(out, null, 1));
  await mongoose.disconnect();
};

run().catch((e) => { console.error('seed5 failed:', e.message); process.exit(1); });
