/**
 * Demo data for Event Booking: event types, vehicle categories, zone prices,
 * vehicles (admin-owned with their driver, plus driver-owned ones) and a few
 * bookings in different stages. Idempotent:  node scripts/seedEvents.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Zone } from '../src/modules/taxi/driver/models/Zone.js';
import { Driver } from '../src/modules/taxi/driver/models/Driver.js';
import { User } from '../src/modules/taxi/user/models/User.js';
import { TaxiAppModule } from '../src/modules/taxi/admin/models/TaxiAppModule.js';
import { EventBooking, EventPricing, EventSettings, EventType, EventVehicle, EventVehicleCategory } from '../src/modules/taxi/event/models/eventModels.js';
import { assignVehicles, completeBooking, createBooking } from '../src/modules/taxi/event/services/eventService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SITE = 'https://palkicabs.com';
const opts = { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true };

const TYPES = [
  ['Wedding', 'Baraat, guest pickups and family transport'], ['Corporate Event', 'Employee and client transport for conferences and offsites'],
  ['Birthday / Party', 'Cars for a celebration'], ['Religious Function / Yatra', 'Group travel for pujas, yatras and darshan'], ['School / College Trip', 'Group transport for institutions'],
];
// name, seats, image, price multiplier vs SUV
const CATEGORIES = [
  ['Hatchback', 4, `${SITE}/vehicles/hatchback.jpg`, 0.6], ['Sedan', 4, `${SITE}/vehicles/dzire.jpg`, 0.75], ['SUV', 6, `${SITE}/vehicles/innova-crysta.jpg`, 1],
  ['Tempo Traveller', 12, `${SITE}/vehicles/traveller.jpg`, 1.6], ['Mini Bus', 25, `${SITE}/mini_bus.png`, 2.6],
];
// per zone: how many admin-owned vehicles of each category
const FLEET = {
  Indore: { Hatchback: 4, Sedan: 6, SUV: 5, 'Tempo Traveller': 3, 'Mini Bus': 2 },
  'Uttar Pradesh': { Hatchback: 6, Sedan: 8, SUV: 10, 'Tempo Traveller': 5, 'Mini Bus': 3 },
};
const MODELS = { Hatchback: 'Maruti Suzuki WagonR', Sedan: 'Maruti Suzuki Dzire', SUV: 'Toyota Innova Crysta', 'Tempo Traveller': 'Force Traveller', 'Mini Bus': 'Tata Starbus 25 seater' };
const DRIVERS = ['Ramesh Yadav', 'Suresh Patel', 'Mahesh Verma', 'Dinesh Sharma', 'Rajesh Gupta', 'Mukesh Singh', 'Naresh Joshi', 'Pawan Mishra', 'Sunil Tiwari', 'Anil Chauhan', 'Vijay Rathore', 'Kamlesh Dubey'];

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || undefined });
  const out = {};

  await EventSettings.findOneAndUpdate({ key: 'default' }, { $setOnInsert: { key: 'default', advancePercent: 30, bufferHours: 2, minLeadHours: 24, freeCancelHours: 48, lateCancelRefundPercent: 0, minWithdrawal: 500 } }, opts);

  // the home-screen tile that opens the rider's Event Booking section (order and on/off stay admin-editable)
  await TaxiAppModule.findOneAndUpdate({ name: 'Event Booking' }, {
    $set: { name: 'Event Booking', transport_type: 'event', service_type: 'event', short_description: 'Cars and buses for weddings, trips and functions', mobile_menu_icon: '/mini_bus.png' },
    $setOnInsert: { order_by: 6, active: 1 },
  }, opts);

  for (const [i, [name, description]] of TYPES.entries()) await EventType.findOneAndUpdate({ name }, { $set: { name, description, order: i + 1, active: true } }, opts);
  const cats = {};
  for (const [i, [name, seats, image]] of CATEGORIES.entries()) cats[name] = await EventVehicleCategory.findOneAndUpdate({ name }, { $set: { name, seats, order: i + 1, active: true }, $setOnInsert: { image } }, opts);
  out.types = TYPES.length; out.categories = CATEGORIES.length;

  const zones = await Zone.find({ name: { $in: ['Indore', 'Uttar Pradesh'] } }).lean();
  if (!zones.length) throw new Error('Zones missing - run seedPalkiData.js first');

  // prices: the client's own example is the SUV in Indore: 100 km one way = Rs 5,000
  let priceRows = 0;
  for (const zone of zones) {
    const zoneFactor = zone.name === 'Indore' ? 1 : 1.05;
    for (const [name, , , mult] of CATEGORIES) {
      const p = (n) => Math.round((n * mult * zoneFactor) / 50) * 50;
      await EventPricing.findOneAndUpdate({ zoneId: zone._id, categoryId: cats[name]._id }, { $set: {
        slabs: [{ fromKm: 0, toKm: 50, price: p(3000) }, { fromKm: 50, toKm: 100, price: p(5000) }, { fromKm: 100, toKm: 200, price: p(9000) }, { fromKm: 200, toKm: 300, price: p(12500) }],
        extraPerKm: p(40), returnPercent: 100, includedHours: 10, extraDayCharge: p(3000), extraDayIncludedHours: 10, extraHourCharge: p(400), commissionPercent: 15, active: true,
      } }, opts);
      priceRows += 1;
    }
  }
  out.priceRows = priceRows;

  // admin-owned vehicles, each with its own driver
  let n = 0; let vehicles = 0;
  for (const zone of zones) {
    const plate = zone.name === 'Indore' ? 'MP09EV' : 'UP32EV';
    for (const [catName, count] of Object.entries(FLEET[zone.name] || {})) {
      for (let k = 0; k < count; k += 1) {
        n += 1;
        const vehicleNumber = `${plate}${String(1000 + n)}`;
        await EventVehicle.findOneAndUpdate({ vehicleNumber }, { $set: {
          ownerType: 'admin', zoneId: zone._id, categoryId: cats[catName]._id, name: MODELS[catName], vehicleNumber, seats: cats[catName].seats,
          images: [CATEGORIES.find((c) => c[0] === catName)[2]], driverName: DRIVERS[n % DRIVERS.length], driverPhone: `9000060${String(100 + n).slice(-3)}`, status: 'approved', approvedAt: new Date(),
        } }, opts);
        vehicles += 1;
      }
    }
  }
  // driver-owned: two approved, one waiting for approval
  const indore = zones.find((z) => z.name === 'Indore');
  const drivers = await Driver.find({ phone: /^900002\d{4}$/ }).sort({ phone: 1 }).limit(3).lean();
  for (const [i, d] of drivers.entries()) {
    const catName = ['SUV', 'Sedan', 'SUV'][i];
    await EventVehicle.findOneAndUpdate({ vehicleNumber: `MP09DV${2000 + i}` }, { $set: {
      ownerType: 'driver', driverId: d._id, driverName: d.name, driverPhone: d.phone, zoneId: indore._id, categoryId: cats[catName]._id,
      name: MODELS[catName], vehicleNumber: `MP09DV${2000 + i}`, seats: cats[catName].seats, images: [CATEGORIES.find((c) => c[0] === catName)[2]], status: i < 2 ? 'approved' : 'pending', approvedAt: i < 2 ? new Date() : null,
    } }, opts);
    vehicles += 1;
  }
  out.vehicles = vehicles;

  // a few bookings in different stages
  if (!(await EventBooking.exists({ code: /^EVTDEMO/ }))) {
    const users = await User.find({ phone: /^900001\d{4}$/ }).sort({ phone: 1 }).limit(4).lean();
    const day = (n, h = 9) => new Date(new Date(`${new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)}T00:00:00+05:30`).getTime() + h * 3600000);
    const INDORE = { address: 'Vijay Nagar, Indore', lat: 22.7533, lng: 75.8937 };
    const UJJAIN = { address: 'Mahakaleshwar, Ujjain', lat: 23.1828, lng: 75.7683 };
    const OMK = { address: 'Omkareshwar', lat: 22.2446, lng: 76.1503 };
    const types = Object.fromEntries((await EventType.find().lean()).map((t) => [t.name, t._id]));
    const catId = (n) => String(cats[n]._id);
    const mk = async (user, body, code) => { const b = await createBooking(user._id, body); b.code = code; await b.save(); return b; };

    // 1) a request waiting for the admin (the client's example: 10 vehicles)
    await mk(users[0], { eventTypeId: types.Wedding, eventTitle: 'Sharma family wedding', pickup: INDORE, drop: UJJAIN, startAt: day(20, 14), endAt: day(20, 22), contactName: 'Anil Sharma', contactPhone: '9000010001', items: [{ categoryId: catId('SUV'), quantity: 2 }, { categoryId: catId('Sedan'), quantity: 3 }, { categoryId: catId('Tempo Traveller'), quantity: 1 }] }, 'EVTDEMO001');
    // 2) assigned, waiting for the customer's advance
    const b2 = await mk(users[1], { eventTypeId: types['Corporate Event'], eventTitle: 'Annual offsite', pickup: INDORE, drop: OMK, startAt: day(25, 7), endAt: day(26, 20), contactName: 'Priya Jain', contactPhone: '9000010002', items: [{ categoryId: catId('SUV'), quantity: 2 }] }, 'EVTDEMO002');
    const suv = await EventVehicle.find({ zoneId: indore._id, categoryId: cats.SUV._id, status: 'approved' }).sort({ vehicleNumber: 1 }).limit(2).lean();
    await assignVehicles(b2._id, suv.map((v) => String(v._id)));
    // 3) confirmed: advance paid
    const b3 = await mk(users[2], { eventTypeId: types['Religious Function / Yatra'], eventTitle: 'Mahakal darshan group', pickup: INDORE, drop: UJJAIN, startAt: day(8, 5), endAt: day(8, 19), contactName: 'Rakesh Verma', contactPhone: '9000010003', items: [{ categoryId: catId('Tempo Traveller'), quantity: 1 }] }, 'EVTDEMO003');
    const tt = await EventVehicle.find({ zoneId: indore._id, categoryId: cats['Tempo Traveller']._id, status: 'approved' }).sort({ vehicleNumber: 1 }).limit(1).lean();
    await assignVehicles(b3._id, tt.map((v) => String(v._id)));
    await EventBooking.updateOne({ _id: b3._id }, { $set: { status: 'confirmed', confirmedAt: new Date() }, $push: { payments: { stage: 'advance', amount: b3.pricing.advanceAmount, orderId: 'order_demoevt3', paymentId: 'pay_demoevt3', status: 'paid' } } });
    // 4) finished in the past, driver-owned vehicle, so the driver's event wallet has earnings
    const b4 = await mk(users[3], { eventTypeId: types['Birthday / Party'], eventTitle: 'Birthday trip', pickup: INDORE, drop: UJJAIN, startAt: day(40, 9), endAt: day(40, 18), contactName: 'Neha Pandey', contactPhone: '9000010004', items: [{ categoryId: catId('SUV'), quantity: 1 }] }, 'EVTDEMO004');
    const mine = await EventVehicle.findOne({ vehicleNumber: 'MP09DV2000' }).lean();
    await assignVehicles(b4._id, [String(mine._id)]);
    await EventBooking.updateOne({ _id: b4._id }, { $set: { status: 'ongoing', startAt: day(-3, 9), endAt: day(-3, 18) }, $push: { payments: { $each: [{ stage: 'advance', amount: b4.pricing.advanceAmount, orderId: 'o', paymentId: 'pay_demoevt4a', status: 'paid' }, { stage: 'balance', amount: b4.pricing.balanceAmount, orderId: 'o', paymentId: 'pay_demoevt4b', status: 'paid' }] } } });
    await completeBooking(b4._id);
    out.bookings = 4;
  }

  console.log(JSON.stringify(out, null, 1));
  await mongoose.disconnect();
};

run().catch((e) => { console.error('seed events failed:', e.message); process.exit(1); });
