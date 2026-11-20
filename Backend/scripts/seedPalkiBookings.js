/**
 * Part 3 of the PALKI demo data: full booking records for the admin
 * Trips / Ongoing / Deliveries pages.
 *
 *  - fills in the 80 demo rides (distance, timeline, fare split, feedback, promo)
 *  - turns 10 of them into cancelled bookings (with who/why)
 *  - adds 6 live bookings (3 accepted, 3 on the way)
 *  - adds 14 parcel deliveries (completed / cancelled / on trip) with sender,
 *    receiver, weight and proof photos
 *
 * Demo records have addresses starting "[demo]". No booking is left in
 * "searching", so no real driver is ever offered a demo ride.
 * Idempotent. Run after seedPalkiData.js and seedPalkiData2.js:
 *   node scripts/seedPalkiBookings.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ride } from '../src/modules/taxi/user/models/Ride.js';
import { Delivery } from '../src/modules/taxi/user/models/Delivery.js';
import { User } from '../src/modules/taxi/user/models/User.js';
import { Driver } from '../src/modules/taxi/driver/models/Driver.js';
import { Vehicle } from '../src/modules/taxi/admin/models/Vehicle.js';
import { SetPrice } from '../src/modules/taxi/admin/models/SetPrice.js';
import { ServiceLocation } from '../src/modules/taxi/admin/models/ServiceLocation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

let seed = 777;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const MIN = 60000;
const DAY = 864e5;

const PLACES = {
  Indore: ['Vijay Nagar', 'Palasia', 'Rajwada', 'Bhawarkuan', 'Sapna Sangeeta', 'Scheme 78', 'Rau', 'LIG Colony', 'Geeta Bhawan', 'Airport Road'],
  Lucknow: ['Hazratganj', 'Gomti Nagar', 'Aliganj', 'Charbagh', 'Indira Nagar', 'Alambagh', 'Aminabad'],
  Kanpur: ['Swaroop Nagar', 'Kakadeo', 'Civil Lines', 'Kidwai Nagar', 'Govind Nagar'],
  Varanasi: ['Lanka', 'Godowlia', 'Sigra', 'Cantt', 'Assi Ghat'],
  Agra: ['Sadar Bazaar', 'Sanjay Place', 'Taj Ganj', 'Kamla Nagar'],
  Prayagraj: ['Civil Lines', 'Katra', 'George Town', 'Allahpur'],
  Noida: ['Sector 18', 'Sector 62', 'Sector 137', 'Sector 50'],
};
const CANCEL_USER = ['Driver is too far', 'Changed my plan', 'Booked by mistake', 'Waiting too long'];
const CANCEL_DRIVER = ['Rider not at pickup', 'Vehicle problem', 'Pickup too far'];
const COMMENTS = ['Smooth ride, polite driver.', 'Reached on time.', 'Clean car and safe driving.', 'Good experience.', 'Driver knew the route well.', 'Nice and comfortable.', ''];
const PARCELS = [
  ['Documents', '0.5 kg', 'Property papers in a sealed envelope'], ['Clothes', '2 kg', 'Two folded kurtas in a bag'], ['Electronics', '1.5 kg', 'Wireless router, boxed'],
  ['Groceries', '4 kg', 'Monthly staples'], ['Gifts', '1 kg', 'Birthday gift box'], ['Medicines', '0.3 kg', 'Prescription medicines'],
  ['Books & Stationery', '3 kg', 'College books'], ['Food Parcel', '2 kg', 'Tiffin box'],
];
const SENDERS = ['Rakesh Soni', 'Anita Dubey', 'Mohit Jain', 'Sarita Verma', 'Imran Khan', 'Pallavi Joshi', 'Harsh Gupta', 'Nidhi Rathore'];
const RECEIVERS = ['Sunil Kumar', 'Rekha Yadav', 'Ajay Tiwari', 'Pooja Mishra', 'Farhan Ali', 'Mamta Singh', 'Gaurav Pandey', 'Kiran Chauhan'];
const PROOF = '/5_Parcel.png';

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || undefined });
  const [drivers, users, vehicles, locs] = await Promise.all([
    Driver.find({ phone: /^900002\d{4}$/ }).sort({ phone: 1 }).lean(),
    User.find({ phone: /^900001\d{4}$/ }).sort({ phone: 1 }).lean(),
    Vehicle.find().lean(),
    ServiceLocation.find().lean(),
  ]);
  if (!drivers.length || !users.length) throw new Error('Run seedPalkiData.js / seedPalkiData2.js first');
  const vBy = Object.fromEntries(vehicles.map((v) => [String(v._id), v]));
  const bike = vehicles.find((v) => v.name === 'Bike');
  const locBy = (name) => locs.find((l) => l.name === name);
  const cityOf = (d) => (d.city && PLACES[d.city] ? d.city : 'Indore');
  const addr = (city) => `[demo] ${pick(PLACES[city])}, ${city}`;
  const money = (n) => Math.round(n);
  const out = {};

  // ---- 1) enrich the existing demo rides --------------------------------------
  const demo = await Ride.find({ serviceType: 'ride', pickupAddress: /^\[demo\]/ }).sort({ createdAt: 1 }).lean();
  let enriched = 0; let cancelled = 0;
  for (const [i, r] of demo.entries()) {
    const d = drivers.find((x) => String(x._id) === String(r.driverId)) || drivers[0];
    const city = cityOf(d);
    const km = 2 + Math.round(rnd() * 140) / 10;
    const mins = Math.max(6, Math.round(km * 3.4));
    const created = new Date(r.createdAt).getTime();
    const accepted = created + 2 * MIN; const arrived = accepted + (3 + Math.round(rnd() * 5)) * MIN; const started = arrived + 2 * MIN; const done = started + mins * MIN;
    const promoOn = i % 9 === 0;
    const discount = promoOn ? Math.min(50, Math.round(r.fare * 0.2)) : 0;
    const waiting = i % 7 === 0 ? 2 * (1 + (i % 3)) : 0;
    const fare = r.fare + waiting * 2 - discount;
    const base = {
      baseFare: r.fare, waitingMinutes: waiting, waitingCharge: waiting * 2, fare,
      pickupAddress: addr(city), dropAddress: addr(city), service_location_id: (locBy(city === 'Indore' ? 'Indore' : 'Uttar Pradesh') || {})._id,
      transport_type: 'taxi', route: { distanceMeters: Math.round(km * 1000), durationMinutes: mins, provider: 'demo' },
      estimatedDistanceMeters: Math.round(km * 1000), estimatedDurationMinutes: mins, bookingSource: 'app', bookingMode: 'normal',
      'pricingSnapshot.admin_commission_type_from_driver': 1, 'pricingSnapshot.admin_commission_from_driver': d.owner_id ? 8 : 12,
    };
    if (promoOn) Object.assign(base, { 'promo.code': 'WELCOME50IN', 'promo.discount_amount': discount, 'promo.fare_before_discount': fare + discount, 'promo.fare_after_discount': fare });

    if (i % 8 === 7) {
      // cancelled booking
      const byUser = i % 16 === 7;
      Object.assign(base, {
        status: 'cancelled', liveStatus: 'cancelled', cancelledBy: byUser ? 'user' : 'driver', cancelReason: pick(byUser ? CANCEL_USER : CANCEL_DRIVER),
        cancelledAt: new Date(accepted + 4 * MIN), acceptedAt: new Date(accepted), commissionAmount: 0, driverEarnings: 0,
      });
      await Ride.updateOne({ _id: r._id }, { $set: base, $unset: { completedAt: 1, startedAt: 1, arrivedAt: 1, feedback: 1 } }, { timestamps: false });
      cancelled += 1;
    } else {
      const commissionAmount = money((fare * (d.owner_id ? 8 : 12)) / 100);
      Object.assign(base, {
        acceptedAt: new Date(accepted), arrivedAt: new Date(arrived), startedAt: new Date(started), completedAt: new Date(done),
        commissionAmount, driverEarnings: fare - commissionAmount,
      });
      if (i % 4 !== 3) {
        base.feedback = { rating: 3 + Math.round(rnd() * 2), comment: pick(COMMENTS), tipAmount: i % 11 === 0 ? 20 : 0, submittedAt: new Date(done + 5 * MIN) };
      }
      await Ride.updateOne({ _id: r._id }, { $set: base }, { timestamps: false });
    }
    enriched += 1;
  }
  out.ridesEnriched = enriched; out.ridesCancelled = cancelled;

  // ---- 2) live bookings -------------------------------------------------------
  const havLive = await Ride.countDocuments({ pickupAddress: /^\[demo-live\]/ });
  if (!havLive) {
    const live = [];
    const spare = drivers.slice(12);
    for (let i = 0; i < 6; i += 1) {
      const d = spare[i % spare.length]; const u = users[(i * 5 + 2) % users.length]; const city = cityOf(d);
      const v = vBy[String(d.vehicleTypeId)] || vehicles[3];
      const sp = await SetPrice.findOne({ vehicle_type: v._id, pricing_scope: 'ride' }).lean();
      const km = 4 + Math.round(rnd() * 90) / 10; const fare = money((sp?.base_price || 70) + km * (sp?.price_per_distance || 13));
      const now = Date.now(); const ongoing = i >= 3;
      const [clng, clat] = d.location.coordinates;
      live.push({
        userId: u._id, driverId: d._id, vehicleTypeId: v._id, vehicleIconType: v.icon_types, serviceType: 'ride', transport_type: 'taxi',
        status: ongoing ? 'ongoing' : 'accepted', liveStatus: ongoing ? 'started' : (i % 2 ? 'arriving' : 'accepted'),
        pickupLocation: { type: 'Point', coordinates: [clng, clat] }, pickupAddress: `[demo-live] ${pick(PLACES[city])}, ${city}`,
        dropLocation: { type: 'Point', coordinates: [clng + 0.03, clat + 0.02] }, dropAddress: `[demo-live] ${pick(PLACES[city])}, ${city}`,
        fare, baseFare: fare, paymentMethod: i % 2 ? 'online' : 'cash', route: { distanceMeters: Math.round(km * 1000), durationMinutes: Math.round(km * 3.4), provider: 'demo' },
        estimatedDistanceMeters: Math.round(km * 1000), estimatedDurationMinutes: Math.round(km * 3.4),
        acceptedAt: new Date(now - (8 + i) * MIN), arrivedAt: ongoing ? new Date(now - 4 * MIN) : null, startedAt: ongoing ? new Date(now - 3 * MIN) : null,
        lastDriverLocation: { type: 'Point', coordinates: [clng + 0.004, clat + 0.003], heading: 40, speed: 22, updatedAt: new Date(now - MIN) },
        createdAt: new Date(now - (10 + i) * MIN), updatedAt: new Date(now - MIN),
      });
    }
    await Ride.create(live, { timestamps: false });
    out.liveBookings = live.length;
  }

  // ---- 3) parcel deliveries ---------------------------------------------------
  const haveDel = await Ride.countDocuments({ serviceType: 'parcel', pickupAddress: /^\[demo/ });
  if (!haveDel) {
    const statuses = ['completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'cancelled', 'cancelled', 'ongoing', 'ongoing', 'accepted', 'accepted'];
    const now = Date.now(); let made = 0;
    for (const [i, st] of statuses.entries()) {
      const d = drivers[(i * 3 + 1) % drivers.length]; const u = users[(i * 4 + 1) % users.length]; const city = cityOf(d);
      const [category, weight, description] = PARCELS[i % PARCELS.length];
      const km = 3 + Math.round(rnd() * 120) / 10; const fare = money(40 + km * 9);
      const created = now - (st === 'ongoing' || st === 'accepted' ? (12 + i) * MIN : Math.floor(rnd() * 25 * DAY) + DAY / 2);
      const [clng, clat] = d.location.coordinates;
      const pickup = { type: 'Point', coordinates: [clng + (rnd() - 0.5) * 0.04, clat + (rnd() - 0.5) * 0.04] };
      const drop = { type: 'Point', coordinates: [clng + (rnd() - 0.5) * 0.06, clat + (rnd() - 0.5) * 0.06] };
      const sender = SENDERS[i % SENDERS.length]; const receiver = RECEIVERS[i % RECEIVERS.length];
      const accepted = created + 3 * MIN; const started = accepted + 7 * MIN; const completed = started + Math.round(km * 3.5) * MIN;
      const done = st === 'completed';
      const parcel = {
        category, weight, description, deliveryCategory: '2wheeler', goodsTypeFor: 'both', deliveryScope: 'city', isOutstation: false,
        senderName: sender, senderMobile: `98${String(26000000 + i * 1371)}`, receiverName: receiver, receiverMobile: `97${String(31000000 + i * 977)}`,
        photos: [PROOF], instructions: i % 3 === 0 ? 'Please call before arriving.' : '',
        ...(done ? { pickupProof: { url: PROOF, at: new Date(started) }, deliveryProof: { url: PROOF, at: new Date(completed) } } : {}),
      };
      const base = {
        userId: u._id, driverId: d._id, vehicleTypeId: bike?._id, vehicleIconType: 'bike', serviceType: 'parcel', transport_type: 'delivery',
        status: st, liveStatus: st === 'ongoing' ? 'started' : st === 'accepted' ? 'accepted' : st,
        pickupLocation: pickup, pickupAddress: `[demo] ${pick(PLACES[city])}, ${city}`, dropLocation: drop, dropAddress: `[demo] ${pick(PLACES[city])}, ${city}`,
        fare, baseFare: fare, paymentMethod: i % 3 === 0 ? 'online' : 'cash', route: { distanceMeters: Math.round(km * 1000), durationMinutes: Math.round(km * 3.5), provider: 'demo' },
        estimatedDistanceMeters: Math.round(km * 1000), estimatedDurationMinutes: Math.round(km * 3.5),
        acceptedAt: new Date(accepted), startedAt: st === 'accepted' ? null : new Date(started),
        ...(done ? { completedAt: new Date(completed), commissionAmount: money(fare * 0.12), driverEarnings: fare - money(fare * 0.12) } : {}),
        ...(st === 'cancelled' ? { cancelledAt: new Date(accepted + 3 * MIN), cancelledBy: i % 2 ? 'user' : 'driver', cancelReason: i % 2 ? 'Changed my plan' : 'Pickup too far', startedAt: null } : {}),
        ...(st === 'ongoing' ? { lastDriverLocation: { type: 'Point', coordinates: [clng + 0.003, clat + 0.002], heading: 80, speed: 18, updatedAt: new Date(now - MIN) } } : {}),
        parcel, createdAt: new Date(created), updatedAt: new Date(created),
      };
      const [ride] = await Ride.create([base], { timestamps: false });
      const [del] = await Delivery.create([{
        rideId: ride._id, userId: u._id, driverId: d._id, vehicleTypeId: bike?._id, vehicleIconType: 'bike', status: st, liveStatus: base.liveStatus,
        pickupLocation: pickup, pickupAddress: base.pickupAddress, dropLocation: drop, dropAddress: base.dropAddress, fare, paymentMethod: base.paymentMethod, parcel,
        acceptedAt: base.acceptedAt, startedAt: base.startedAt, completedAt: base.completedAt,
      }], { timestamps: false });
      await Ride.updateOne({ _id: ride._id }, { $set: { deliveryId: del._id } }, { timestamps: false });
      made += 1;
    }
    out.deliveries = made;
  }

  console.log(JSON.stringify(out, null, 1));
  await mongoose.disconnect();
};

run().catch((e) => { console.error('seed3 failed:', e.message); process.exit(1); });
