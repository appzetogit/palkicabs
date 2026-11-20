/**
 * Part 4 of the PALKI demo data (after seedPalkiData.js, seedPalkiData2.js, seedPalkiBookings.js).
 *
 * Employees (with attributed users/drivers), admin roles, car-pooling routes and
 * vehicles with commissions, support tickets, SOS alerts, push notifications,
 * notification channels, payment gateways (left inactive: no keys), vehicle
 * preferences, driver-pass settings and trip permissions for the sub-admins.
 *
 * Idempotent and additive:  node scripts/seedPalkiData4.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN_PERMISSIONS } from '../src/modules/taxi/admin/services/adminAccessService.js';
import { Admin } from '../src/modules/taxi/admin/models/Admin.js';
import { AdminRole } from '../src/modules/taxi/admin/models/AdminRole.js';
import { Employee } from '../src/modules/taxi/admin/models/Employee.js';
import { User } from '../src/modules/taxi/user/models/User.js';
import { Driver } from '../src/modules/taxi/driver/models/Driver.js';
import { Owner } from '../src/modules/taxi/admin/models/Owner.js';
import { Ride } from '../src/modules/taxi/user/models/Ride.js';
import { ServiceLocation } from '../src/modules/taxi/admin/models/ServiceLocation.js';
import { Vehicle } from '../src/modules/taxi/admin/models/Vehicle.js';
import { PoolingRoute } from '../src/modules/taxi/admin/models/PoolingRoute.js';
import { PoolingVehicle } from '../src/modules/taxi/admin/models/PoolingVehicle.js';
import { SupportTicket } from '../src/modules/taxi/support/models/SupportTicket.js';
import { SupportTicketTitle } from '../src/modules/taxi/support/models/SupportTicketTitle.js';
import { SafetyAlert } from '../src/modules/taxi/common/models/SafetyAlert.js';
import { Notification } from '../src/modules/taxi/admin/promotions/models/Notification.js';
import { NotificationChannel } from '../src/modules/taxi/admin/models/NotificationChannel.js';
import { PaymentGateway } from '../src/modules/taxi/admin/models/PaymentGateway.js';
import { UserPreference } from '../src/modules/taxi/admin/models/UserPreference.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const opts = { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true };
const upsert = (Model, filter, doc) => Model.findOneAndUpdate(filter, { $set: doc }, opts);
const MIN = 60000;

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || undefined });
  const out = {};
  const [users, drivers, owners, locs] = await Promise.all([
    User.find({ phone: /^900001\d{4}$/ }).sort({ phone: 1 }).lean(),
    Driver.find({ phone: /^900002\d{4}$/ }).sort({ phone: 1 }).lean(),
    Owner.find({ mobile: /^900003000\d$/ }).sort({ mobile: 1 }).lean(),
    ServiceLocation.find().lean(),
  ]);
  if (!users.length || !drivers.length) throw new Error('Run the earlier seed scripts first');
  const indore = locs.find((l) => l.name === 'Indore'); const up = locs.find((l) => l.name === 'Uttar Pradesh');

  // 1) sub-admins can open Trips / Ongoing / Deliveries too
  await Admin.updateMany({ email: { $in: ['indore@palkicabs.com', 'up@palkicabs.com'] } },
    { $addToSet: { permissions: { $each: ['trips.view', 'ongoing.view', 'deliveries.view', 'support.view', 'pooling.view'] } } });

  // 2) roles
  const roles = [
    ['Operations Manager', ['dashboard.view', 'trips.view', 'ongoing.view', 'deliveries.view', 'drivers.view', 'users.view', 'owners.view', 'zones.view', 'geofencing.view', 'pooling.view']],
    ['Support Agent', ['dashboard.view', 'support.view', 'chat.view', 'users.view', 'drivers.view', 'trips.view']],
    ['Finance Manager', ['dashboard.view', 'earnings.view', 'wallet.view', 'reports.view', 'owners.view', 'drivers.view']],
    ['Marketing Manager', ['dashboard.view', 'promotions.view', 'referrals.view', 'landing_content.view', 'enquiries.view']],
  ];
  for (const [name, permissions] of roles) {
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    await upsert(AdminRole, { slug }, { name, slug, description: `${name} access`, permissions: permissions.filter((p) => ADMIN_PERMISSIONS.includes(p)) });
  }

  // 3) employees (+ attribution to users and drivers)
  const staff = [['Ankit Rathore', '9000050001', 'PLK101'], ['Neeraj Sharma', '9000050002', 'PLK102'], ['Shalini Verma', '9000050003', 'PLK103'], ['Vikas Yadav', '9000050004', 'PLK104'], ['Rohit Singh', '9000050005', 'PLK105'], ['Pooja Mishra', '9000050006', 'PLK106']];
  const emps = [];
  for (const [name, phone, employeeCode] of staff) emps.push(await upsert(Employee, { employeeCode }, { name, phone, employeeCode, active: true, notes: 'Field acquisition team' }));
  for (const [i, u] of users.slice(0, 18).entries()) await User.updateOne({ _id: u._id }, { $set: { acquiredByEmployeeId: emps[i % 6]._id, acquiredByEmployeeCode: emps[i % 6].employeeCode } });
  for (const [i, d] of drivers.slice(0, 16).entries()) await Driver.updateOne({ _id: d._id }, { $set: { acquiredByEmployeeId: emps[(i + 2) % 6]._id, acquiredByEmployeeCode: emps[(i + 2) % 6].employeeCode } });
  out.employees = emps.length;

  // 4) car pooling: routes + vehicles (commissions set here)
  const mk = (id, name, address, stopType, sequence, etaMinutes, latitude, longitude) => ({ id, name, address, stopType, sequence, etaMinutes, latitude, longitude });
  const routes = [
    ['Indore to Ujjain', 'IND-UJJ', 'Indore', 'Ujjain', 80, 3, [mk('i1', 'Vijay Nagar', 'Vijay Nagar, Indore', 'pickup', 1, 0, 22.7533, 75.8937), mk('i2', 'Palasia', 'Palasia, Indore', 'pickup', 2, 15, 22.7244, 75.8839), mk('u1', 'Mahakal Temple', 'Mahakaleshwar, Ujjain', 'drop', 3, 75, 23.1828, 75.7683)], indore],
    ['Indore to Bhopal', 'IND-BPL', 'Indore', 'Bhopal', 280, 4, [mk('i1', 'Vijay Nagar', 'Vijay Nagar, Indore', 'pickup', 1, 0, 22.7533, 75.8937), mk('b1', 'ISBT', 'ISBT, Bhopal', 'drop', 2, 200, 23.2599, 77.4126)], indore],
    ['Indore to Dewas', 'IND-DWS', 'Indore', 'Dewas', 60, 3, [mk('i1', 'Bhawarkuan', 'Bhawarkuan, Indore', 'pickup', 1, 0, 22.6979, 75.8681), mk('d1', 'Dewas Bus Stand', 'Bus Stand, Dewas', 'drop', 2, 50, 22.9676, 76.0534)], indore],
    ['Lucknow to Kanpur', 'LKO-KNP', 'Lucknow', 'Kanpur', 120, 4, [mk('l1', 'Charbagh', 'Charbagh, Lucknow', 'pickup', 1, 0, 26.8315, 80.9220), mk('k1', 'Kanpur Central', 'Kanpur Central', 'drop', 2, 90, 26.4540, 80.3507)], up],
    ['Lucknow to Varanasi', 'LKO-VNS', 'Lucknow', 'Varanasi', 400, 4, [mk('l1', 'Gomti Nagar', 'Gomti Nagar, Lucknow', 'pickup', 1, 0, 26.8528, 81.0066), mk('v1', 'Cantt', 'Cantt, Varanasi', 'drop', 2, 330, 25.3263, 82.9826)], up],
    ['Noida to Agra', 'NDA-AGR', 'Noida', 'Agra', 450, 4, [mk('n1', 'Sector 18', 'Sector 18, Noida', 'pickup', 1, 0, 28.5700, 77.3219), mk('a1', 'Sanjay Place', 'Sanjay Place, Agra', 'drop', 2, 200, 27.1957, 78.0081)], up],
  ];
  const carTypes = await Vehicle.find({ name: { $in: ['Maruti Suzuki Dzire', 'Maruti Suzuki Ertiga', 'Toyota Innova Crysta'] } }).lean();
  for (const [routeName, routeCode, originLabel, destinationLabel, farePerSeat, maxSeats, stops] of routes) {
    await upsert(PoolingRoute, { routeCode }, {
      routeName, routeCode, originLabel, destinationLabel, description: `Shared ${originLabel} to ${destinationLabel} cab, pay per seat.`,
      assignedVehicleTypeIds: carTypes.map((v) => v._id), pickupPoints: stops.filter((s) => s.stopType !== 'drop'), dropPoints: stops.filter((s) => s.stopType === 'drop'), stops,
      schedules: [{ id: 's1', label: 'Morning', departureTime: '07:30', arrivalTime: '09:30', activeDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], status: 'active' },
        { id: 's2', label: 'Evening', departureTime: '17:30', arrivalTime: '19:30', activeDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], status: 'active' }],
      farePerSeat, maxSeatsPerBooking: maxSeats, maxAdvanceBookingHours: 72, boardingBufferMinutes: 10,
      poolingRules: { allowInstantBooking: true, allowLuggage: true, womenOnly: false, autoAssignNearestPickup: true, maxDetourKm: 5 }, status: 'active', active: true,
    });
  }
  const pv = [
    ['Dzire Pool', 'Maruti Suzuki Dzire', 'MP09PL1001', 'sedan', 4, 0], ['Ertiga Pool', 'Maruti Suzuki Ertiga', 'MP09PL1002', 'van', 6, 1],
    ['Innova Pool', 'Toyota Innova Crysta', 'UP32PL2001', 'suv', 6, 2], ['Dzire Pool UP', 'Maruti Suzuki Dzire', 'UP78PL2002', 'sedan', 4, 3],
  ];
  for (const [name, vehicleModel, vehicleNumber, vehicleType, capacity, di] of pv) {
    const d = drivers[di]; const owner = owners[di % Math.max(1, owners.length)];
    await upsert(PoolingVehicle, { vehicleNumber }, {
      ownerId: owner?._id, name, vehicleModel, vehicleNumber, driverName: d.name, driverPhone: d.phone, approve: true, color: 'White', capacity, vehicleType,
      adminCommissionPercentage: 10, ownerCommissionPercentage: 5, serviceTaxPercentage: 5, status: 'active', poolingEnabled: true,
    });
  }
  out.poolingRoutes = routes.length; out.poolingVehicles = pv.length;

  // 5) support tickets
  const titles = await SupportTicketTitle.find().lean();
  const T = (userType) => titles.filter((t) => t.userType === userType);
  const samples = [
    ['user', users[0], 'Fare is incorrect', 'Fare shown at the end was higher than the estimate.', 'pending'], ['user', users[3], 'Payment or refund issue', 'My online payment was deducted twice.', 'assigned'],
    ['user', users[5], 'Lost an item', 'I left my bag in the cab yesterday evening.', 'closed'], ['user', users[8], 'Driver behaviour', 'Driver took a longer route.', 'pending'],
    ['driver', drivers[1], 'Payout or wallet issue', 'Withdrawal request is pending since 3 days.', 'assigned'], ['driver', drivers[4], 'Document verification', 'Please re-check my RC upload.', 'pending'],
    ['driver', drivers[7], 'Subscription question', 'Does the weekly pass cover outstation rides?', 'closed'], ['owner', owners[0], 'Settlement or withdrawal', 'Weekly settlement not received yet.', 'pending'],
    ['owner', owners[2], 'Fleet vehicle approval', 'Fleet vehicle approval is taking long.', 'assigned'], ['user', users[11], 'App problem', 'App crashes when I open the map.', 'closed'],
  ];
  const admin = await Admin.findOne({ admin_type: 'superadmin' }).lean();
  for (const [i, [type, who, title, text, status]] of samples.entries()) {
    const t = T(type).find((x) => x.title === title) || T(type)[0]; if (!t || !who) continue;
    const name = who.name || who.owner_name; const phone = who.phone || who.mobile; const at = new Date(Date.now() - (i + 1) * 5 * 3600 * 1000);
    const messages = [{ senderRole: type, senderId: who._id, senderName: name, message: text, createdAt: at }];
    if (status !== 'pending') messages.push({ senderRole: 'admin', senderId: admin._id, senderName: admin.name, message: 'Thanks for reaching out. We are looking into this and will update you shortly.', createdAt: new Date(at.getTime() + 30 * MIN) });
    await upsert(SupportTicket, { ticketCode: `TKT-D${1001 + i}` }, {
      ticketCode: `TKT-D${1001 + i}`, titleId: t._id, title: t.title, userType: type, supportType: 'general', requesterRole: type, requesterId: who._id, requesterName: name, requesterPhone: phone,
      serviceLocation: i % 2 ? 'Uttar Pradesh' : 'Indore', status, assignedAdminId: status === 'pending' ? undefined : admin._id, assignedAdminName: status === 'pending' ? '' : admin.name, messages, lastMessageAt: messages.at(-1).createdAt,
    });
  }
  out.tickets = samples.length;

  // 6) SOS alerts (one still active)
  const recent = await Ride.find({ pickupAddress: /^\[demo\]/, status: 'completed' }).sort({ createdAt: -1 }).limit(3).populate('userId', 'name phone').populate('driverId', 'name phone vehicleNumber vehicleModel').lean();
  for (const [i, r] of recent.entries()) {
    const code = `REQ_${String(r._id).slice(-12).toUpperCase()}`;
    if (await SafetyAlert.countDocuments({ tripCode: code })) continue;
    await SafetyAlert.create({
      incidentType: 'sos', status: i === 0 ? 'active' : 'resolved', sourceApp: i === 1 ? 'driver' : 'user', serviceType: 'ride', userId: r.userId?._id, driverId: r.driverId?._id, rideId: r._id,
      riderName: r.userId?.name, riderPhone: r.userId?.phone, driverName: r.driverId?.name, driverPhone: r.driverId?.phone, vehicleLabel: `${r.driverId?.vehicleModel || ''} ${r.driverId?.vehicleNumber || ''}`.trim(),
      tripCode: code, pickupAddress: r.pickupAddress, dropAddress: r.dropAddress, locationLabel: r.pickupAddress, location: { type: 'Point', coordinates: r.pickupLocation.coordinates },
      notes: i === 0 ? 'Rider pressed SOS during the trip.' : 'Resolved after calling both parties - false alarm.', resolvedAt: i === 0 ? undefined : new Date(), resolvedByAdminId: i === 0 ? undefined : String(admin._id),
    });
  }
  out.sosAlerts = recent.length;

  // 7) push notifications + channels + preferences + gateways
  const notifs = [
    ['Welcome to PALKI', 'Book your first ride with code WELCOME50 and save up to ₹75.', 'users'], ['Drive and earn more', 'Buy a Weekly Pass and keep zero commission on every ride.', 'drivers'],
    ['Weekend offer', 'Flat 15% off on weekend rides. Use WEEKEND15.', 'all'], ['New airport pickups', 'Airport pickups now live in Indore and Lucknow.', 'all'],
  ];
  for (const [push_title, message, send_to] of notifs) {
    for (const loc of [indore, up]) await upsert(Notification, { push_title, service_location_id: loc._id }, { service_location_id: loc._id, service_location_name: loc.name, send_to, push_title, message, voice_enabled: false, status: 'sent', sent_at: new Date(Date.now() - 86400000) });
  }
  for (const [name, topic_name, description, push, mail, forUser] of [['Ride updates', 'ride-updates', 'Booking, driver arrival and trip status', true, false, true], ['Offers & promotions', 'promotions', 'Promo codes and discounts', true, true, true],
    ['Payments', 'payments', 'Receipts, refunds and wallet changes', true, true, true], ['Driver alerts', 'driver-alerts', 'Ride requests, documents and payouts', true, false, false], ['Safety alerts', 'safety', 'SOS and safety notices', true, false, true]]) {
    await upsert(NotificationChannel, { topic_name }, { name, topic_name, description, push_notification: push, mail, for_user: forUser });
  }
  for (const name of ['AC', 'Pet friendly', 'Luggage carrier', 'Child seat', 'Wheelchair accessible']) await upsert(UserPreference, { name }, { name, active: 1 });
  // Gateways need merchant keys from the owner, so they stay off until those are entered.
  for (const [name, slug] of [['Razorpay', 'razorpay'], ['PhonePe', 'phonepe']]) await upsert(PaymentGateway, { slug }, { name, slug, active: false });

  // 8) driver pass + referral rewards. Written to the raw collection because the
  // app reads `driver_subscription` outside the Mongoose schema.
  const settings = mongoose.connection.db.collection('taxiadminbusinesssettings');
  await settings.updateMany({}, { $set: {
    'driver_subscription.subscription_mode': 'both', 'driver_subscription.waive_commission': '1',
    'referral.driver': { enabled: true, type: 'instant_referrer', amount: 100 },
    'referral.user': { enabled: true, type: 'instant_referrer', amount: 50 },
  } });
  out.driverPass = 'commission or pass (commission waived while a pass is active)'; out.referral = 'driver Rs 100, rider Rs 50';

  console.log(JSON.stringify(out, null, 1));
  await mongoose.disconnect();
};

run().catch((e) => { console.error('seed4 failed:', e.message); process.exit(1); });
