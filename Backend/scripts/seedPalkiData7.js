/**
 * Part 7 of the PALKI demo data: payment records for Admin > Payments.
 *
 *  - completed online demo rides are marked paid via Razorpay (with order/payment ids)
 *  - some cash rides become wallet-paid, a few are covered by a rider subscription
 *  - rider and driver wallet top-ups (Razorpay)
 *
 * Idempotent:  node scripts/seedPalkiData7.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ride } from '../src/modules/taxi/user/models/Ride.js';
import { User } from '../src/modules/taxi/user/models/User.js';
import { UserWallet } from '../src/modules/taxi/user/models/UserWallet.js';
import { UserSubscription } from '../src/modules/taxi/user/models/UserSubscription.js';
import { Driver } from '../src/modules/taxi/driver/models/Driver.js';
import { WalletTransaction } from '../src/modules/taxi/driver/models/WalletTransaction.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DAY = 864e5;

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || undefined });
  const out = {};

  const done = await Ride.find({ status: 'completed', pickupAddress: /^\[demo\]/ }).sort({ createdAt: 1 }).lean();

  // 1) online rides: paid through Razorpay
  let online = 0; let wallet = 0; let covered = 0;
  const sub = await UserSubscription.findOne({ status: 'active' }).lean();
  for (const [i, r] of done.entries()) {
    const when = r.completedAt || r.createdAt;
    if (r.paymentMethod === 'online') {
      await Ride.updateOne({ _id: r._id }, { $set: { driverPaymentCollection: {
        provider: 'razorpay', providerId: `plink_demo${2000 + i}`, providerOrderId: `order_demo${2000 + i}`, providerPaymentId: `pay_demo${2000 + i}`, providerMode: 'test',
        source: 'rider_app', status: 'paid', amount: r.fare, currency: 'INR', paidAt: when, updatedAt: when,
      } } }, { timestamps: false });
      online += 1;
    }
    if (r.paymentMethod === 'cash' && i % 5 === 2) {
      // paid from the rider's wallet
      await Ride.updateOne({ _id: r._id }, { $set: { paymentMethod: 'wallet' } }, { timestamps: false });
      wallet += 1;
    } else if (r.paymentMethod === 'cash' && i % 13 === 4 && sub) {
      await Ride.updateOne({ _id: r._id }, { $set: { subscriptionUsage: { covered: true, subscriptionId: sub._id, planId: sub.planId, planName: sub.name, benefitType: sub.benefit_type, fareCovered: r.fare } } }, { timestamps: false });
      covered += 1;
    }
  }
  out.onlineRidesPaid = online; out.walletRides = wallet; out.subscriptionRides = covered;

  // 2) rider wallet top-ups
  const users = await User.find({ phone: /^900001\d{4}$/ }).sort({ phone: 1 }).limit(12).lean();
  let riderTop = 0;
  for (const [i, u] of users.entries()) {
    const key = `seed-topup-${u.phone}`;
    const wal = await UserWallet.findOne({ userId: u._id }).lean();
    if (!wal || (wal.transactions || []).some((t) => t.referenceKey === key)) continue;
    const amount = [200, 500, 300, 1000, 250, 400][i % 6];
    const at = new Date(Date.now() - (i + 1) * 2 * DAY);
    await UserWallet.updateOne({ userId: u._id }, {
      $inc: { balance: amount },
      $push: { transactions: { kind: 'credit', amount, title: 'Wallet top-up', provider: 'razorpay', providerOrderId: `order_demo_w${i}`, providerPaymentId: `pay_demo_w${i}`, referenceKey: key, createdAt: at, updatedAt: at } },
    }, { timestamps: false });
    riderTop += 1;
  }
  out.riderTopUps = riderTop;

  // 3) driver wallet top-ups
  const drivers = await Driver.find({ phone: /^900002\d{4}$/ }).sort({ phone: 1 }).limit(8).lean();
  let driverTop = 0;
  for (const [i, d] of drivers.entries()) {
    if (await WalletTransaction.countDocuments({ driverId: d._id, type: 'top_up' })) continue;
    const amount = [500, 1000, 300, 2000, 700, 1500, 400, 1000][i];
    const before = d.wallet?.balance ?? 0;
    const at = new Date(Date.now() - (i + 1) * 3 * DAY);
    await WalletTransaction.create([{
      driverId: d._id, type: 'top_up', amount, balanceBefore: before, balanceAfter: before + amount, cashLimit: d.wallet?.cashLimit ?? 1000, isBlockedAfter: false,
      description: 'Driver wallet top-up', metadata: { provider: 'razorpay', providerOrderId: `order_demo_d${i}`, providerPaymentId: `pay_demo_d${i}` }, createdAt: at, updatedAt: at,
    }], { timestamps: false });
    await Driver.updateOne({ _id: d._id }, { $inc: { 'wallet.balance': amount } });
    driverTop += 1;
  }
  out.driverTopUps = driverTop;

  console.log(JSON.stringify(out, null, 1));
  await mongoose.disconnect();
};

run().catch((e) => { console.error('seed7 failed:', e.message); process.exit(1); });
