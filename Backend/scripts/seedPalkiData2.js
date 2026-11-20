/**
 * Part 2 of the PALKI demo data (run seedPalkiData.js first).
 *
 * Commissions, owner<->driver<->fleet links, owner wallets and withdrawals,
 * required-document types, user + driver subscriptions, payment methods,
 * surge / peak-hour settings (left OFF), goods types, support ticket titles,
 * onboarding screens, languages and ~80 completed rides over the last 30 days.
 *
 * Idempotent and additive. Usage (from Backend/):  node scripts/seedPalkiData2.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Zone } from '../src/modules/taxi/driver/models/Zone.js';
import { Vehicle } from '../src/modules/taxi/admin/models/Vehicle.js';
import { SetPrice } from '../src/modules/taxi/admin/models/SetPrice.js';
import { User } from '../src/modules/taxi/user/models/User.js';
import { Driver } from '../src/modules/taxi/driver/models/Driver.js';
import { Owner } from '../src/modules/taxi/admin/models/Owner.js';
import { FleetVehicle } from '../src/modules/taxi/admin/models/FleetVehicle.js';
import { OwnerWalletTransaction } from '../src/modules/taxi/admin/models/OwnerWalletTransaction.js';
import { WithdrawalRequest } from '../src/modules/taxi/admin/models/WithdrawalRequest.js';
import { DriverNeededDocument } from '../src/modules/taxi/admin/models/DriverNeededDocument.js';
import { OwnerNeededDocument } from '../src/modules/taxi/admin/models/OwnerNeededDocument.js';
import { SubscriptionPlan } from '../src/modules/taxi/admin/models/SubscriptionPlan.js';
import { DriverSubscription } from '../src/modules/taxi/driver/models/DriverSubscription.js';
import { WalletTransaction } from '../src/modules/taxi/driver/models/WalletTransaction.js';
import { UserSubscription } from '../src/modules/taxi/user/models/UserSubscription.js';
import { Ride } from '../src/modules/taxi/user/models/Ride.js';
import { PaymentMethod } from '../src/modules/taxi/admin/models/PaymentMethod.js';
import { SurgeSetting } from '../src/modules/taxi/admin/models/SurgeSetting.js';
import { PriceHike } from '../src/modules/taxi/admin/models/PriceHike.js';
import { GoodsType } from '../src/modules/taxi/admin/models/GoodsType.js';
import { SupportTicketTitle } from '../src/modules/taxi/support/models/SupportTicketTitle.js';
import { OnboardingScreen } from '../src/modules/taxi/admin/models/OnboardingScreen.js';
import { AppLanguage } from '../src/modules/taxi/admin/models/AppLanguage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const opts = { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true };
const upsert = (Model, filter, doc) => Model.findOneAndUpdate(filter, { $set: doc }, opts);
let seed = 424242;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const DAY = 864e5;

const DRIVER_COMMISSION = 12; // % of fare PALKI keeps from a driver ride
const OWNER_COMMISSION = 8; // % PALKI keeps from an owner's fleet ride

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || undefined });
  const out = {};

  // 1) commissions on vehicle types and every zone price
  const comm = {
    admin_commission_type_from_driver: 1, admin_commission_from_driver: DRIVER_COMMISSION,
    admin_commission_type_for_owner: 1, admin_commission_for_owner: OWNER_COMMISSION,
  };
  await Vehicle.updateMany({}, { $set: { ...comm, service_tax: 5 } });
  await SetPrice.updateMany({ pricing_scope: 'ride' }, { $set: { ...comm, admin_commision_type: 1, admin_commision: DRIVER_COMMISSION, service_tax: 5 } });
  out.commission = { driver: `${DRIVER_COMMISSION}%`, owner: `${OWNER_COMMISSION}%`, gst: '5%' };

  const zones = Object.fromEntries((await Zone.find({ name: { $in: ['Indore', 'Uttar Pradesh'] } }).lean()).map((z) => [z.name, z]));
  const owners = await Owner.find({ mobile: /^900003000\d$/ }).sort({ mobile: 1 }).lean();
  const drivers = await Driver.find({ phone: /^900002\d{4}$/ }).sort({ phone: 1 }).lean();
  const users = await User.find({ phone: /^900001\d{4}$/ }).sort({ phone: 1 }).lean();
  if (!owners.length || !drivers.length || !users.length) throw new Error('Run seedPalkiData.js first');
  const vehicles = await Vehicle.find().lean();
  const vById = Object.fromEntries(vehicles.map((v) => [String(v._id), v]));

  // 2) owner <-> fleet vehicle <-> driver links (first 12 drivers drive owner cars)
  const fleet = await FleetVehicle.find({ owner_id: { $in: owners.map((o) => o._id) } }).sort({ license_plate_number: 1 }).lean();
  const ownerIdx = (place) => (place === 'Indore' ? [0, 1] : [2, 3]);
  const linked = [];
  for (const [i, d] of drivers.slice(0, 12).entries()) {
    const place = i % 2 === 0 ? 'Indore' : 'Uttar Pradesh';
    const owner = owners[ownerIdx(place)[Math.floor(i / 2) % 2]];
    const cars = fleet.filter((f) => String(f.owner_id) === String(owner._id));
    const car = cars[Math.floor(i / 4) % cars.length];
    await Driver.updateOne({ _id: d._id }, { $set: {
      owner_id: owner._id, assignedFleetVehicleId: car._id, vehicleType: 'car', vehicleIconType: 'car', vehicleTypeId: car.vehicle_type_id,
      vehicleTypeIds: [car.vehicle_type_id], vehicleMake: car.car_brand, vehicleModel: car.car_model, vehicleColor: car.car_color,
      vehicleNumber: car.license_plate_number, service_location_id: owner.service_location_id, zoneId: zones[place]._id,
    } });
    linked.push({ driver: d._id, owner: owner._id, vehicleTypeId: car.vehicle_type_id });
  }
  out.ownerLinkedDrivers = linked.length;

  // bank details for drivers + owners (for withdrawals)
  const bank = (name, i) => ({ accountHolderName: name, upiId: `${name.split(' ')[0].toLowerCase()}${i}@okaxis`, accountNumber: `5010${String(1000000 + i * 137).padStart(10, '0')}`,
    ifsc: 'HDFC0000123', branchName: 'Main Branch', verificationStatus: 'verified', updatedAt: new Date() });
  for (const [i, d] of drivers.entries()) await Driver.updateOne({ _id: d._id }, { $set: { bankDetails: bank(d.name, i) } });

  // 3) owner wallets, wallet ledger, withdrawals
  for (const [i, o] of owners.entries()) {
    const exists = await OwnerWalletTransaction.countDocuments({ ownerId: o._id });
    if (!exists) {
      let bal = 0;
      for (const [title, amt, kind] of [['Weekly fleet settlement', 6200 + i * 800, 'credit'], ['Weekly fleet settlement', 5400 + i * 650, 'credit'], ['Withdrawal to bank', 4000, 'debit'], ['Weekly fleet settlement', 7100 + i * 500, 'credit']]) {
        bal += kind === 'credit' ? amt : -amt;
        await OwnerWalletTransaction.create({ ownerId: o._id, amount: amt, kind, title, balance: bal });
      }
      await Owner.updateOne({ _id: o._id }, { $set: { 'wallet.balance': bal, bank_name: 'HDFC Bank', ifsc: 'HDFC0000123', account_no: `5020${String(2000000 + i * 911).padStart(10, '0')}`, tax_number: `27ABCDE${1000 + i}F1Z5` } });
    }
  }
  const wr = [
    ['WD-OWN-1001', 'owner_id', owners[0]._id, 3000, 'pending', owners[0].name], ['WD-OWN-1002', 'owner_id', owners[2]._id, 5000, 'completed', owners[2].name],
    ['WD-DRV-2001', 'driver_id', drivers[1]._id, 1500, 'pending', drivers[1].name], ['WD-DRV-2002', 'driver_id', drivers[2]._id, 2200, 'completed', drivers[2].name],
  ];
  for (const [transactionId, key, id, amount, status, nm] of wr) {
    await upsert(WithdrawalRequest, { transactionId }, { transactionId, [key]: id, amount, status, payment_method: 'bank',
      bank_details_snapshot: { accountHolderName: nm, accountNumber: '50100000012345', ifsc: 'HDFC0000123', branchName: 'Main Branch', updatedAt: new Date() } });
  }

  // 4) required documents
  const docs = [
    ['Driving Licence', 'driving-licence', 'front_back', true, true, 'driving_license'], ['Aadhaar Card', 'aadhaar-card', 'front_back', false, true, 'none'],
    ['PAN Card', 'pan-card', 'front', false, true, 'pan'], ['Vehicle RC', 'vehicle-rc', 'front_back', true, true, 'rc'],
    ['Vehicle Insurance', 'vehicle-insurance', 'front', true, true, 'none'], ['Police Verification', 'police-verification', 'front', true, false, 'none'],
    ['Profile Selfie', 'profile-selfie', 'image', false, true, 'none'],
  ];
  for (const [i, [name, slug, image_type, has_expiry_date, is_required, verification_type]] of docs.entries()) {
    await upsert(DriverNeededDocument, { slug }, { template_type: 'document', name, slug, key: slug, account_type: 'both', image_type, has_expiry_date,
      has_identify_number: slug !== 'profile-selfie', identify_number_key: `${slug}-number`, verification_type, is_editable: true, is_required, active: true, sort_order: i + 1 });
  }
  for (const [name, image_type, has_expiry_date, is_required] of [['PAN Card', 'front', false, true], ['Aadhaar Card', 'front_back', false, true], ['GST Certificate', 'front', false, false], ['Fleet Agreement', 'front', true, false]]) {
    await upsert(OwnerNeededDocument, { name }, { name, image_type, has_expiry_date, has_identify_number: true, is_editable: true, is_required, active: true });
  }

  // 5) subscriptions
  await SubscriptionPlan.updateMany({ audience: 'driver' }, { $set: { vehicle_classes: ['bike', 'auto', 'car'] } });
  const userPlans = [];
  for (const [name, amount, duration, benefit, limit] of [['Ride Saver Weekly', 99, 7, 'limited', 10], ['Unlimited Monthly', 499, 30, 'unlimited', 0], ['Commuter Pass', 299, 30, 'limited', 40]]) {
    userPlans.push(await upsert(SubscriptionPlan, { audience: 'user', name }, { audience: 'user', name, description: `${name}: discounted rides`, amount, duration,
      transport_type: 'taxi', benefit_type: benefit, ride_limit: limit, how_it_works: 'Buy from your wallet and ride at the plan benefit until it expires.', free_trial_enabled: false, active: true }));
  }
  const driverPlans = await SubscriptionPlan.find({ audience: 'driver' }).lean();
  const now = Date.now();
  for (const [i, u] of users.slice(0, 8).entries()) {
    const p = userPlans[i % userPlans.length]; const started = now - (i % 4) * 3 * DAY; const expired = i === 7;
    await UserSubscription.findOneAndUpdate({ userId: u._id, planId: p._id }, { $set: { name: p.name, description: p.description, amount: p.amount, durationDays: p.duration,
      transport_type: 'taxi', benefit_type: p.benefit_type, ride_limit: p.ride_limit, rides_used: expired ? p.ride_limit : (i * 2) % 7, status: expired ? 'expired' : 'active', active: !expired,
      purchaseSource: 'wallet', purchasedAt: new Date(started), startedAt: new Date(started), expiresAt: new Date(started + (expired ? -DAY : p.duration * DAY)) } }, opts);
  }
  for (const [i, d] of drivers.slice(0, 14).entries()) {
    const p = driverPlans[i % driverPlans.length]; const started = now - (i % 5) * DAY; const lapsed = i % 7 === 6;
    const startsAt = new Date(lapsed ? now - (p.duration + 3) * DAY : started);
    const sub = await DriverSubscription.findOneAndUpdate({ driverId: d._id, planId: p._id }, { $set: { planName: p.name, amount: p.amount, vehicleClasses: ['bike', 'auto', 'car'],
      startsAt, expiresAt: new Date(startsAt.getTime() + p.duration * DAY), status: 'active', paymentMethod: 'wallet', paymentReference: `seed-sub-${i}`, paidAt: startsAt } }, opts);
    if (!(await WalletTransaction.countDocuments({ driverId: d._id, type: 'subscription_purchase' }))) {
      const before = d.wallet?.balance ?? 0;
      await WalletTransaction.create({ driverId: d._id, type: 'subscription_purchase', amount: -p.amount, balanceBefore: before + p.amount, balanceAfter: before, cashLimit: 1000,
        isBlockedAfter: false, description: `${p.name} purchase`, metadata: { subscriptionId: sub._id } });
    }
  }

  // 6) payment methods, surge (OFF), peak-hour slots (OFF), goods, tickets, onboarding, languages
  for (const name of ['Cash', 'Online', 'Wallet']) await upsert(PaymentMethod, { name }, { name, fields: [], active: true });
  await upsert(SurgeSetting, { key: 'default' }, { key: 'default', enabled: false, resolution: 7, window_minutes: 10, min_demand: 3, trigger_ratio: 1.5, ratio_step: 0.5, step: 0.1, max_multiplier: 2, hold_minutes: 10 });
  for (const [label, days, startTime, endTime, multiplier] of [['Morning peak', [1, 2, 3, 4, 5], '08:00', '11:00', 1.2], ['Evening peak', [1, 2, 3, 4, 5], '17:00', '21:00', 1.25], ['Late night', [], '23:00', '05:00', 1.3]]) {
    await upsert(PriceHike, { label }, { label, days, startTime, endTime, timezone: 'Asia/Kolkata', multiplier, active: false });
  }
  for (const g of ['Documents', 'Clothes', 'Electronics', 'Groceries', 'Gifts', 'Medicines', 'Books & Stationery', 'Furniture (small)', 'Food Parcel']) {
    await upsert(GoodsType, { goods_type_name: g }, { goods_type_name: g, goods_types_for: 'both', active: 1, status: 'active' });
  }
  const titles = {
    user: ['Payment or refund issue', 'Driver behaviour', 'Fare is incorrect', 'Trip was cancelled', 'Lost an item', 'App problem'],
    driver: ['Payout or wallet issue', 'Document verification', 'Subscription question', 'Rider behaviour', 'App problem'],
    owner: ['Fleet vehicle approval', 'Settlement or withdrawal', 'Driver assignment', 'App problem'],
  };
  for (const [userType, list] of Object.entries(titles)) for (const title of list) await upsert(SupportTicketTitle, { title, userType }, { title, userType, supportType: 'general', active: true });
  const screens = {
    user: [['Book a ride in seconds', 'Auto, bike or cab - pick what suits you.'], ['Fair, upfront fares', 'See the price before you book.'], ['Ride with safety', 'Share your trip and use SOS any time.']],
    driver: [['Drive when you want', 'Go online and start earning.'], ['Keep more of what you earn', 'Low commission and simple subscription plans.'], ['Get paid quickly', 'Withdraw earnings to your bank or UPI.']],
    owner: [['Grow your fleet', 'Add vehicles and assign drivers.'], ['Track earnings', 'See every ride and settlement.']],
  };
  for (const [audience, list] of Object.entries(screens)) for (const [i, [title, description]] of list.entries()) {
    await upsert(OnboardingScreen, { audience, order: i + 1 }, { audience, screen: `${audience}-${i + 1}`, order: i + 1, title, description, active: true });
  }
  for (const [name, code, def] of [['English', 'en', 1], ['Hindi', 'hi', 0]]) await upsert(AppLanguage, { code }, { name, code, active: 1, default_status: def });

  // 7) completed rides (last 30 days) for dashboards / earnings
  const have = await Ride.countDocuments({ pickupAddress: /^\[demo\]/ });
  if (!have) {
    const city = { Indore: [75.8577, 22.7196], 'Uttar Pradesh': [80.9462, 26.8467] };
    const rides = [];
    for (let i = 0; i < 80; i += 1) {
      const d = drivers[i % drivers.length]; const u = users[(i * 7) % users.length];
      const place = d.zoneId && String(d.zoneId) === String(zones.Indore._id) ? 'Indore' : 'Uttar Pradesh';
      const km = 2 + Math.round(rnd() * 14); const v = vById[String(d.vehicleTypeId)] || vehicles[3];
      const sp = await SetPrice.findOne({ zone_id: zones[place]._id, vehicle_type: v._id, pricing_scope: 'ride' }).lean();
      const fare = Math.round((sp?.base_price || 60) + Math.max(0, km - (sp?.base_distance || 2)) * (sp?.price_per_distance || 12));
      const when = new Date(now - Math.floor(rnd() * 30 * DAY));
      const [clng, clat] = d.location?.coordinates || city[place];
      const jit = () => (rnd() - 0.5) * 0.05;
      rides.push({ userId: u._id, driverId: d._id, vehicleTypeId: v._id, vehicleIconType: v.icon_types, serviceType: 'ride', status: 'completed', liveStatus: 'completed',
        pickupLocation: { type: 'Point', coordinates: [clng + jit(), clat + jit()] }, pickupAddress: `[demo] Stop ${i + 1}, ${place === 'Indore' ? 'Indore' : d.city}`,
        dropLocation: { type: 'Point', coordinates: [clng + jit(), clat + jit()] }, dropAddress: `[demo] Drop ${i + 1}, ${place === 'Indore' ? 'Indore' : d.city}`,
        fare, paymentMethod: i % 3 === 0 ? 'online' : 'cash', commissionAmount: Math.round((fare * (d.owner_id ? OWNER_COMMISSION : DRIVER_COMMISSION)) / 100), completedAt: when, createdAt: when, updatedAt: when });
    }
    await Ride.create(rides, { timestamps: false });
    out.rides = rides.length;
  }

  console.log(JSON.stringify(out, null, 1));
  await mongoose.disconnect();
};

run().catch((e) => { console.error('seed2 failed:', e.message); process.exit(1); });
