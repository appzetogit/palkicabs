/**
 * Demo / launch data for PALKI: Indore + Uttar Pradesh.
 *
 * Seeds: logo in business settings, sub-admins, service locations + zones,
 * vehicle types (real photos in frontend/public/vehicles), per-zone ride prices,
 * users (+wallets), approved offline drivers, owners + fleet, banners, promo
 * codes, cancellation reasons, airports and driver subscription plans.
 *
 * Idempotent (upserts on natural keys) and additive: it never deletes anything.
 * Demo phones are 90000xxxxx and demo drivers are always offline, so no real
 * rider can be matched to a fake driver.
 *
 * Usage (from Backend/):  node scripts/seedPalkiData.js
 */
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/modules/taxi/services/passwordService.js';
import { ServiceLocation } from '../src/modules/taxi/admin/models/ServiceLocation.js';
import { Zone } from '../src/modules/taxi/driver/models/Zone.js';
import { Vehicle } from '../src/modules/taxi/admin/models/Vehicle.js';
import { SetPrice } from '../src/modules/taxi/admin/models/SetPrice.js';
import { User } from '../src/modules/taxi/user/models/User.js';
import { UserWallet } from '../src/modules/taxi/user/models/UserWallet.js';
import { Driver } from '../src/modules/taxi/driver/models/Driver.js';
import { Owner } from '../src/modules/taxi/admin/models/Owner.js';
import { FleetVehicle } from '../src/modules/taxi/admin/models/FleetVehicle.js';
import { Admin } from '../src/modules/taxi/admin/models/Admin.js';
import { AdminBusinessSetting } from '../src/modules/taxi/admin/models/AdminBusinessSetting.js';
import { Banner } from '../src/modules/taxi/admin/promotions/models/Banner.js';
import { PromoCode } from '../src/modules/taxi/admin/promotions/models/PromoCode.js';
import { CancellationReason } from '../src/modules/taxi/admin/models/CancellationReason.js';
import { Airport } from '../src/modules/taxi/admin/models/Airport.js';
import { SubscriptionPlan } from '../src/modules/taxi/admin/models/SubscriptionPlan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ---- deterministic jitter so re-runs give the same coordinates -------------
let seed = 20260101;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const jitter = (v, r) => +(v + (rnd() - 0.5) * 2 * r).toFixed(6);
const pick = (a, i) => a[i % a.length];
const upsert = (Model, filter, doc) =>
  Model.findOneAndUpdate(filter, { $set: doc }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true });

// ---- places ----------------------------------------------------------------
const INDORE = { name: 'Indore', address: 'Indore, Madhya Pradesh, India', lat: 22.7196, lng: 75.8577 };
const UP = { name: 'Uttar Pradesh', address: 'Lucknow, Uttar Pradesh, India', lat: 26.8467, lng: 80.9462 };
const INDORE_POLY = [[75.72, 22.58], [76.02, 22.58], [76.02, 22.86], [75.72, 22.86], [75.72, 22.58]];
// Coarse outline of Uttar Pradesh (lng, lat), good enough for dispatch zoning.
const UP_POLY = [[77.1, 28.6], [78.3, 29.0], [79.8, 28.9], [81.0, 29.3], [81.9, 28.4], [83.0, 27.7], [84.2, 27.4], [84.6, 26.4],
  [84.0, 25.6], [83.6, 24.6], [82.8, 24.2], [81.6, 24.1], [80.0, 24.8], [78.6, 25.1], [78.0, 26.0], [77.5, 26.8], [77.1, 27.5], [77.1, 28.6]];

const CITIES = {
  Indore: [{ c: 'Indore', lat: 22.7196, lng: 75.8577, plate: 'MP09' }],
  'Uttar Pradesh': [
    { c: 'Lucknow', lat: 26.8467, lng: 80.9462, plate: 'UP32' },
    { c: 'Kanpur', lat: 26.4499, lng: 80.3319, plate: 'UP78' },
    { c: 'Varanasi', lat: 25.3176, lng: 82.9739, plate: 'UP65' },
    { c: 'Agra', lat: 27.1767, lng: 78.0081, plate: 'UP80' },
    { c: 'Prayagraj', lat: 25.4358, lng: 81.8463, plate: 'UP70' },
    { c: 'Noida', lat: 28.5355, lng: 77.391, plate: 'UP16' },
  ],
};

// name, category(enum bike|auto|car), icon, capacity, photo, ride price [base, baseKm, perKm, wait]
const FLEET = [
  ['Bike', 'bike', 'bike', 1, '/vehicles/bike.jpg', [25, 1.5, 8, 1], 'Bike taxi for quick solo rides', 'Honda', 'Activa'],
  ['Auto Rickshaw', 'auto', 'auto', 3, '/vehicles/auto.jpg', [35, 1.5, 12, 1.5], 'Quick, metered short-distance autos', 'Bajaj', 'RE'],
  ['E-Rickshaw', 'auto', 'auto', 4, '/3_E-Rickshaw.png', [25, 1.5, 9, 1], 'Affordable electric rides', 'Mahindra', 'Treo'],
  ['Hatchback', 'car', 'car', 4, '/vehicles/hatchback.jpg', [70, 2, 13, 2], 'Budget AC hatchback', 'Maruti Suzuki', 'WagonR'],
  ['Maruti Suzuki Swift', 'car', 'car', 4, '/vehicles/swift.jpg', [75, 2, 14, 2], 'Comfortable hatchback for the city', 'Maruti Suzuki', 'Swift'],
  ['Maruti Suzuki Dzire', 'car', 'car', 4, '/vehicles/dzire.jpg', [90, 2, 15, 2.5], 'Comfortable sedan for city and airport runs', 'Maruti Suzuki', 'Dzire'],
  ['Maruti Eeco', 'car', 'car', 5, '/vehicles/eeco.jpg', [85, 2, 14, 2.5], 'Roomy van for small groups', 'Maruti Suzuki', 'Eeco'],
  ['Maruti Suzuki Ertiga', 'car', 'car', 6, '/vehicles/ertiga.jpg', [120, 2, 18, 3], 'Spacious MUV for families and groups', 'Maruti Suzuki', 'Ertiga'],
  ['Toyota Innova Crysta', 'car', 'suv', 6, '/vehicles/innova-crysta.jpg', [160, 2, 22, 4], 'Premium SUV for outstation travel', 'Toyota', 'Innova Crysta'],
  ['Tempo Traveller', 'car', 'car', 12, '/vehicles/traveller.jpg', [250, 2, 28, 5], 'Large group travel', 'Force', 'Traveller'],
  ['Toyota Fortuner', 'car', 'suv', 7, '/vehicles/fortuner.jpg', [300, 2, 32, 6], 'Luxury SUV for executive travel', 'Toyota', 'Fortuner'],
];

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Rohan', 'Karan', 'Rahul', 'Amit', 'Sanjay', 'Vikram', 'Manish', 'Deepak', 'Suresh', 'Ravi', 'Ajay', 'Nitin',
  'Priya', 'Neha', 'Pooja', 'Anjali', 'Sneha', 'Kavita', 'Ritu', 'Sunita', 'Meena', 'Divya', 'Shruti', 'Komal', 'Nisha', 'Swati'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Yadav', 'Patel', 'Mishra', 'Tiwari', 'Joshi', 'Chauhan', 'Agrawal', 'Pandey', 'Jain', 'Rathore', 'Dubey'];
const COLORS = ['White', 'Silver', 'Grey', 'Black', 'Blue', 'Red'];
const fullName = (i) => `${pick(FIRST, i * 7 + 3)} ${pick(LAST, i * 5 + 1)}`;

const run = async () => {
  await mongoose.connect(env_uri(), { dbName: process.env.MONGODB_DB_NAME || undefined });
  const out = {};
  const demoHash = await hashPassword(crypto.randomBytes(18).toString('hex')); // demo accounts log in by OTP

  // 1) logo / branding
  await AdminBusinessSetting.updateMany({}, {
    $set: { 'general.logo': '/palki-logo.png', 'general.favicon': '/palki-icon-32.png', 'general.app_name': 'PALKI',
      'general.default_lat': String(INDORE.lat), 'general.default_lng': String(INDORE.lng) },
  });

  // 2) service locations + zones
  const locs = {}; const zones = {};
  for (const [place, poly] of [[INDORE, INDORE_POLY], [UP, UP_POLY]]) {
    locs[place.name] = await upsert(ServiceLocation, { name: place.name }, {
      name: place.name, service_location_name: place.name, address: place.address, country: 'India',
      latitude: place.lat, longitude: place.lng, location: { type: 'Point', coordinates: [place.lng, place.lat] },
      status: 'active', active: true,
    });
    zones[place.name] = await upsert(Zone, { name: place.name }, {
      name: place.name, service_location_id: locs[place.name]._id, unit: 'km', active: true, status: 'active',
      boundary_mode: 'polygon', geometry: { type: 'Polygon', coordinates: [poly] },
      maximum_distance_for_regular_rides: 60, maximum_distance_for_outstation_rides: 600,
    });
  }
  out.zones = Object.keys(zones);

  // 3) vehicle types + prices
  const vehicles = {};
  for (const [name, category, icon, capacity, image, , desc] of FLEET) {
    vehicles[name] = await upsert(Vehicle, { name }, {
      name, short_description: desc, description: desc, transport_type: 'taxi', dispatch_type: 'both', icon_types: icon, category,
      capacity, is_taxi: 'taxi', image, icon: image, map_icon: image, status: 1, active: true,
      admin_commission_type_from_driver: 1, admin_commission_from_driver: 10, admin_commission_type_for_owner: 1, admin_commission_for_owner: 5,
    });
  }
  let prices = 0;
  for (const place of [INDORE, UP]) {
    const factor = place === UP ? 1.05 : 1;
    let order = 1;
    for (const [name, category, , , , [base, baseKm, perKm, wait]] of FLEET) {
      const car = category === 'car';
      await SetPrice.findOneAndUpdate(
        { zone_id: zones[place.name]._id, vehicle_type: vehicles[name]._id, pricing_scope: 'ride', transport_type: 'taxi' },
        { $set: {
          service_location_id: locs[place.name]._id, package_destination: '', package_availability: 'available', package_vehicle_prices: [],
          payment_type: ['cash', 'online', 'wallet'], base_price: Math.round(base * factor), base_distance: baseKm,
          price_per_distance: +(perKm * factor).toFixed(1), time_price: 1, waiting_charge: wait, free_waiting_before: 3, free_waiting_after: 3,
          outstation_base_price: car ? Math.round(base * 3) : 0, outstation_base_distance: car ? 100 : 0,
          outstation_price_per_distance: car ? +(perKm * 0.9).toFixed(1) : 0,
          outstation_round_trip_price_per_distance: car ? +(perKm * 0.8).toFixed(1) : 0, outstation_time_price: 0,
          enable_airport_ride: car, enable_outstation_ride: car, support_outstation: car ? 1 : 0, support_airport_fee: car ? 1 : 0,
          enable_ride_sharing: false, enable_shared_ride: 0, service_tax: 5,
          user_cancellation_fee_type: 'fixed', user_cancellation_fee: 20, driver_cancellation_fee_type: 'fixed', driver_cancellation_fee: 20,
          cancellation_fee_goes_to: 'admin', admin_commision_type: 1, admin_commision: 10,
          admin_commission_type_from_driver: 1, admin_commission_from_driver: 10, admin_commission_type_for_owner: 1, admin_commission_for_owner: 5,
          order_number: order++, bill_status: 1, status: 'active', active: 1,
        } },
        { upsert: true, setDefaultsOnInsert: true },
      );
      prices += 1;
    }
  }
  out.vehicles = FLEET.length; out.prices = prices;

  // 4) sub-admins (random passwords, printed once when created)
  const created = [];
  for (const [name, email, phone, place] of [['Indore Manager', 'indore@palkicabs.com', '9000040001', INDORE], ['Uttar Pradesh Manager', 'up@palkicabs.com', '9000040002', UP]]) {
    const exists = await Admin.findOne({ email }).lean();
    if (exists) continue;
    const pw = `Pk${crypto.randomBytes(6).toString('hex')}!`;
    await Admin.create({
      name, email, phone, password: await hashPassword(pw), role: 'subadmin', admin_type: 'subadmin', active: true, status: 'active',
      permissions: ['dashboard.view', 'users.view', 'drivers.view', 'owners.view', 'reports.view', 'earnings.view', 'promotions.view', 'chat.view', 'wallet.view'],
      service_location_ids: [locs[place.name]._id], zone_ids: [zones[place.name]._id],
    });
    created.push({ email, password: pw });
  }
  out.newSubAdmins = created;

  // 5) users + wallets
  for (let i = 0; i < 30; i += 1) {
    const place = i % 3 === 0 ? INDORE : UP; const city = pick(CITIES[place.name], i);
    const phone = `90000${String(10001 + i)}`;
    const name = fullName(i);
    const u = await upsert(User, { phone }, {
      phone, name, email: `${name.toLowerCase().replace(/\s+/g, '.')}.${i}@example.com`, gender: i % 3 === 2 ? 'female' : 'male',
      referralCode: `PK${String(10001 + i)}`, isVerified: true, isActive: true, active: true, role: 'user',
      addresses: [{
        label: 'Home', street: `${10 + i}, Main Road`, city: city.c, state: place === INDORE ? 'Madhya Pradesh' : 'Uttar Pradesh',
        zipCode: place === INDORE ? '452001' : '226001', phone,
        location: { type: 'Point', coordinates: [jitter(city.lng, 0.04), jitter(city.lat, 0.04)] }, isDefault: true,
      }],
    });
    await UserWallet.findOneAndUpdate({ userId: u._id }, { $setOnInsert: { userId: u._id, balance: (i % 5) * 100, refundWallet: 0, transactions: [] } }, { upsert: true });
  }
  out.users = 30;

  // 6) owners + fleet
  const owners = [];
  for (let i = 0; i < 4; i += 1) {
    const place = i < 2 ? INDORE : UP; const city = pick(CITIES[place.name], i); const mobile = `90000${String(30001 + i)}`;
    const name = fullName(40 + i);
    const o = await upsert(Owner, { mobile }, {
      company_name: `${name.split(' ')[1]} Travels`, owner_name: name, name, mobile, phone: mobile,
      email: `owner${i + 1}@example.com`, password: demoHash, service_location_id: locs[place.name]._id, transport_type: 'taxi',
      address: `${city.c}, India`, city: city.c, postal_code: place.name === 'Indore' ? '452001' : '226001', no_of_vehicles: 2,
      active: true, approve: true, status: 'approved',
    });
    owners.push({ o, place, city });
    for (let k = 0; k < 2; k += 1) {
      const [vn, , , , , , , make, model] = FLEET[3 + ((i * 2 + k) % 6)];
      await upsert(FleetVehicle, { license_plate_number: `${city.plate}FL${i}${k}${1000 + i * 7 + k}` }, {
        owner_id: o._id, service_location_id: locs[place.name]._id, transport_type: 'taxi', vehicle_type_id: vehicles[vn]._id,
        car_brand: make, car_model: model, car_color: pick(COLORS, i + k), status: 'approved', active: true,
      });
    }
  }
  out.owners = 4;

  // 7) drivers (approved, OFFLINE)
  for (let i = 0; i < 24; i += 1) {
    const place = i % 2 === 0 ? INDORE : UP; const city = pick(CITIES[place.name], i); const phone = `90000${String(20001 + i)}`;
    const [vn, category, , , , , , make, model] = FLEET[i % FLEET.length];
    const [lng, lat] = [jitter(city.lng, 0.04), jitter(city.lat, 0.04)];
    const name = fullName(60 + i); const done = new Date();
    await upsert(Driver, { phone }, {
      name, phone, email: `driver${i + 1}@example.com`, gender: 'male', password: demoHash,
      service_location_id: locs[place.name]._id, zoneId: zones[place.name]._id, city: city.c,
      vehicleType: category, vehicleTypeId: vehicles[vn]._id, vehicleTypeIds: [vehicles[vn]._id], vehicleIconType: category,
      vehicleMake: make, vehicleModel: model, vehicleColor: pick(COLORS, i), vehicleNumber: `${city.plate}${['AB', 'CD', 'EF', 'GH'][i % 4]}${2000 + i * 13}`,
      registerFor: 'taxi', serviceCategories: ['taxi'], approve: true, status: 'approved', isOnline: false, isOnRide: false,
      rating: +(4 + (i % 10) / 10).toFixed(1), ratingCount: 20 + i * 4, totalRatingScore: (20 + i * 4) * (4 + (i % 10) / 10),
      referralCode: `DRV${String(20001 + i)}`, wallet: { balance: 200 + (i % 6) * 150, cashLimit: 1000, isBlocked: false },
      location: { type: 'Point', coordinates: [lng, lat] }, documents: {},
      onboarding: { registrationId: `seed-driver-${phone}`, role: 'driver', completed: true, submittedAt: done, completedAt: done, otpVerifiedAt: done },
    });
  }
  out.drivers = 24;

  // 8) banners, promos, reasons, airports, plans
  const banners = [
    ['Quick rides, easy on the pocket', '/Quick%20Rides,%20Easy%20on%20the%20Pocket.jpg'],
    ['Log in anytime. Earn anytime.', '/Log%20In%20Anytime.%20Earn%20Anytime.jpg'],
    ["Everyone's safety matters", '/Everyones%20Safety%20Matters.jpg'],
    ['Airport transfers, on time', '/Airport%20building%20exterior%20with%20airplanes%20and%20control%20tower%20outline%20concept.jpg'],
    ['Auto rides for everyone', '/auto_with_people_banner.png'],
  ];
  for (const [title, image] of banners) await upsert(Banner, { title }, { title, image, link_type: 'external_link', active: true });

  const from = new Date(); const to = new Date(Date.now() + 365 * 864e5);
  for (const place of [INDORE, UP]) {
    for (const [code, pct, max, min] of [['WELCOME50', 50, 75, 100], ['PALKI20', 20, 60, 150], ['WEEKEND15', 15, 50, 120]]) {
      await upsert(PromoCode, { code: `${code}${place === UP ? 'UP' : 'IN'}` }, {
        code: `${code}${place === UP ? 'UP' : 'IN'}`, service_location_id: locs[place.name]._id, service_location_name: place.name,
        service_location_ids: [locs[place.name]._id], service_location_names: [place.name], transport_type: 'taxi',
        discount_percentage: pct, maximum_discount_amount: max, minimum_trip_amount: min, uses_per_user: 3, max_uses_total: 5000,
        from_date: from, to_date: to, active: true,
      });
    }
  }

  const reasons = [
    ['user', ['Driver is too far', 'Driver asked to cancel', 'Changed my plan', 'Booked by mistake', 'Waiting too long']],
    ['driver', ['Rider not at pickup', 'Rider asked to cancel', 'Vehicle problem', 'Pickup too far', 'Unsafe location']],
  ];
  for (const [audience, titles] of reasons) {
    for (const [i, title] of titles.entries()) await upsert(CancellationReason, { title, audience }, { title, audience, order_by: i + 1, active: true });
  }

  const airports = [
    ['Devi Ahilya Bai Holkar Airport', 'IDR', INDORE, 22.7218, 75.8011],
    ['Chaudhary Charan Singh Airport', 'LKO', UP, 26.7606, 80.8893],
    ['Lal Bahadur Shastri Airport', 'VNS', UP, 25.4524, 82.8593],
  ];
  for (const [name, code, place, lat, lng] of airports) {
    await upsert(Airport, { name }, {
      name, code, service_location_id: locs[place.name]._id, zone_id: zones[place.name]._id, address: `${name}, ${place.name}`,
      latitude: lat, longitude: lng, location: { type: 'Point', coordinates: [lng, lat] }, status: 'active', active: true,
      pickup_availability: true, drop_availability: true, airport_surge: 0, support_airport_fee: 1,
    });
  }

  for (const [name, amount, duration] of [['Daily Pass', 99, 1], ['Weekly Pass', 499, 7], ['Monthly Pass', 1499, 30]]) {
    await upsert(SubscriptionPlan, { audience: 'driver', name }, {
      audience: 'driver', name, description: `${name} - zero commission rides`, amount, duration, transport_type: 'taxi',
      benefit_type: 'unlimited', ride_limit: 0, free_trial_enabled: false, active: true,
    });
  }

  console.log(JSON.stringify(out, null, 1));
  await mongoose.disconnect();
};

function env_uri() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  return process.env.MONGODB_URI;
}

run().catch((e) => { console.error('seed failed:', e.message); process.exit(1); });
