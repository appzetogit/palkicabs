/**
 * Part 6 of the PALKI demo data.
 *
 *  - photos for the car-pooling vehicles
 *  - drivers of the live demo bookings are shown online / on trip (God's Eye)
 *  - demo support-chat conversations for Admin > Chats
 *
 * Idempotent:  node scripts/seedPalkiData6.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PoolingVehicle } from '../src/modules/taxi/admin/models/PoolingVehicle.js';
import { Admin } from '../src/modules/taxi/admin/models/Admin.js';
import { Driver } from '../src/modules/taxi/driver/models/Driver.js';
import { User } from '../src/modules/taxi/user/models/User.js';
import { Ride } from '../src/modules/taxi/user/models/Ride.js';
import { SupportChatMessage } from '../src/modules/taxi/chat/models/SupportChatMessage.js';
import { createSupportMessage } from '../src/modules/taxi/chat/services/supportChatService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SITE = 'https://palkicabs.com';
const MIN = 60000;

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || undefined });
  const out = {};

  // 1) pooling vehicle photos (real photos already served from /vehicles)
  const photo = { 'Maruti Suzuki Dzire': 'dzire.jpg', 'Maruti Suzuki Ertiga': 'ertiga.jpg', 'Toyota Innova Crysta': 'innova-crysta.jpg' };
  let withPhotos = 0;
  for (const v of await PoolingVehicle.find().lean()) {
    const file = photo[v.vehicleModel] || 'dzire.jpg';
    await PoolingVehicle.updateOne({ _id: v._id }, { $set: { images: [`${SITE}/vehicles/${file}`] } });
    withPhotos += 1;
  }
  out.poolingVehiclePhotos = withPhotos;

  // 2) live-booking drivers are online and on a trip, so God's Eye shows real activity
  const live = await Ride.find({ pickupAddress: /^\[demo-live\]|^\[demo\]/, status: { $in: ['accepted', 'ongoing'] }, driverId: { $ne: null } }).select('driverId').lean();
  const ids = [...new Set(live.map((r) => String(r.driverId)))];
  await Driver.updateMany({ _id: { $in: ids } }, { $set: { isOnline: true, isOnRide: true } });
  out.driversOnTrip = ids.length;

  // 3) demo support chats
  const admin = await Admin.findOne({ admin_type: 'superadmin' }).lean();
  const users = await User.find({ phone: /^900001\d{4}$/ }).sort({ phone: 1 }).limit(6).lean();
  const drivers = await Driver.find({ phone: /^900002\d{4}$/ }).sort({ phone: 1 }).limit(4).lean();
  const threads = [
    ['user', users[0], [['u', 'Hi, my driver cancelled twice today. Can you help?'], ['a', 'Sorry about that. We are checking your last two bookings now.'], ['u', 'Thanks, please let me know.']]],
    ['user', users[1], [['u', 'I was charged ₹20 cancellation fee but the driver was late.'], ['a', 'We reviewed it and have refunded the ₹20 to your wallet.'], ['u', 'Received, thank you!']]],
    ['user', users[2], [['u', 'How do I use the WELCOME50 promo code?']]],
    ['user', users[3], [['u', 'Can I book an airport pickup for tomorrow 5 AM?'], ['a', 'Yes. Choose Airport in the cab options and set the pickup time.']]],
    ['user', users[4], [['u', 'My wallet top-up of ₹500 is not showing.'], ['a', 'Please share the payment reference so we can trace it.'], ['u', 'pay_demo2041']]],
    ['user', users[5], [['u', 'Parcel was delivered but I did not get the proof photo.']]],
    ['driver', drivers[0], [['u', 'Sir, when will my weekly pass start?'], ['a', 'It starts from the next cycle at 6 AM.'], ['u', 'Ok understood.']]],
    ['driver', drivers[1], [['u', 'My withdrawal request is still pending.'], ['a', 'Withdrawals are processed in 24 hours on working days.']]],
    ['driver', drivers[2], [['u', 'RC document upload is failing, please check.']]],
    ['driver', drivers[3], [['u', 'Rider is not picking up the phone at pickup.'], ['a', 'Please wait 5 minutes and then cancel from the app. No penalty applies.']]],
  ];
  let created = 0;
  for (const [role, person, msgs] of threads) {
    if (!person) continue;
    const exists = await SupportChatMessage.countDocuments({ $or: [{ senderId: person._id }, { receiverId: person._id }] });
    if (exists) continue;
    const base = Date.now() - (created + 1) * 47 * MIN;
    for (const [i, [who, text]] of msgs.entries()) {
      const msg = who === 'u'
        ? await createSupportMessage({ senderRole: role, senderId: person._id, message: text })
        : await createSupportMessage({ senderRole: 'admin', senderId: admin._id, receiverRole: role, receiverId: person._id, message: text });
      const at = new Date(base + i * 4 * MIN);
      // admin messages count as read; the last user message of a thread stays unread
      const unread = who === 'u' && i === msgs.length - 1;
      await SupportChatMessage.updateOne({ _id: msg.id || msg._id }, { $set: { createdAt: at, updatedAt: at, readAt: unread ? null : at } }, { timestamps: false });
    }
    created += 1;
  }
  out.chatThreads = created;

  console.log(JSON.stringify(out, null, 1));
  await mongoose.disconnect();
};

run().catch((e) => { console.error('seed6 failed:', e.message); process.exit(1); });
