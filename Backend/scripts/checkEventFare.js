// Self-check for the event fare:  node scripts/checkEventFare.js
import assert from 'node:assert/strict';
import { oneWayPrice, priceBooking, priceOneVehicle, splitVehicleAmount, timeUsage } from '../src/modules/taxi/event/services/eventFareService.js';

const slabs = [{ fromKm: 0, toKm: 100, price: 5000 }, { fromKm: 100, toKm: 200, price: 9000 }, { fromKm: 200, toKm: 300, price: 12500 }];
assert.equal(oneWayPrice(slabs, 40), 5000);
assert.equal(oneWayPrice(slabs, 100), 5000); // the edge belongs to the lower slab
assert.equal(oneWayPrice(slabs, 100.5), 9000);
assert.equal(oneWayPrice(slabs, 250), 12500);
assert.equal(oneWayPrice(slabs, 310, 40), 12500 + 10 * 40); // past the last slab: extra per km
assert.equal(oneWayPrice([], 10), null);

const pricing = { slabs, extraPerKm: 40, returnPercent: 100, includedHours: 10, extraDayCharge: 3000, extraDayIncludedHours: 10, extraHourCharge: 400, commissionPercent: 15 };
const start = new Date('2026-12-10T08:00:00+05:30');
const at = (h) => new Date(start.getTime() + h * 3600000);

// 100 km one way, same day, within the included hours: there + back
let u = priceOneVehicle({ pricing, distanceKm: 100, startAt: start, endAt: at(8) });
assert.equal(u.unitTotal, 10000); assert.equal(u.days, 1); assert.equal(u.overtimeHours, 0);
// 12 hours: 2 hours over
u = priceOneVehicle({ pricing, distanceKm: 100, startAt: start, endAt: at(12) });
assert.equal(u.overtimeAmount, 800); assert.equal(u.unitTotal, 10800);
// 30 hours = 2 days: one extra day, 20 h allowed -> 10 h over
u = priceOneVehicle({ pricing, distanceKm: 100, startAt: start, endAt: at(30) });
assert.equal(u.days, 2); assert.equal(u.extraDayAmount, 3000); assert.equal(u.overtimeAmount, 4000); assert.equal(u.unitTotal, 10000 + 3000 + 4000);
assert.deepEqual(timeUsage({ startAt: start, endAt: at(8), includedHours: 10, extraDayIncludedHours: 10 }).days, 1);

// 10 vehicles, 30% advance
const b = priceBooking({ lines: [{ categoryId: 'a', categoryName: 'SUV', quantity: 10, pricing }], distanceKm: 100, startAt: start, endAt: at(8), advancePercent: 30 });
assert.equal(b.pricing.total, 100000); assert.equal(b.pricing.advanceAmount, 30000); assert.equal(b.pricing.balanceAmount, 70000);
assert.ok(priceBooking({ lines: [{ categoryId: 'a', categoryName: 'X', quantity: 1, pricing: { ...pricing, slabs: [] } }], distanceKm: 10, startAt: start, endAt: at(5), advancePercent: 30 }).error);

assert.deepEqual(splitVehicleAmount({ amount: 10000, ownerType: 'driver', commissionPercent: 15 }), { driverShare: 8500, adminShare: 1500 });
assert.deepEqual(splitVehicleAmount({ amount: 10000, ownerType: 'admin', commissionPercent: 15 }), { driverShare: 0, adminShare: 10000 });
console.log('event fare checks passed');
