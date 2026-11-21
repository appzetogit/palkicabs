// Self-check for the pooling fare split:  node scripts/checkPoolingFare.js
import assert from 'node:assert/strict';
import { shareFare, quoteBooking, settleShares } from '../src/modules/taxi/services/poolingFareService.js';

const F = 3200; const L = 100;
const s = (riders) => shareFare({ totalFare: F, routeKm: L, riders }).shares;

assert.deepEqual(s([{ id: 'a', board: 0, drop: 100, seats: 1 }]), { a: 3200 });
assert.deepEqual(s([{ id: 'a', board: 0, drop: 100, seats: 1 }, { id: 'b', board: 60, drop: 100, seats: 1 }]), { a: 2560, b: 640 });
const three = s([{ id: 'a', board: 0, drop: 100, seats: 1 }, { id: 'b', board: 20, drop: 100, seats: 1 }, { id: 'c', board: 50, drop: 100, seats: 1 }]);
assert.ok(Math.abs(three.a + three.b + three.c - 3200) < 0.05);
assert.ok(three.a > three.b && three.b > three.c);
const four = s([0, 1, 2, 3].map((i) => ({ id: `r${i}`, board: 0, drop: 100, seats: 1 })));
assert.deepEqual(Object.values(four), [800, 800, 800, 800]);
// two seats count double
const dbl = s([{ id: 'a', board: 0, drop: 100, seats: 2 }, { id: 'b', board: 0, drop: 100, seats: 1 }]);
assert.ok(Math.abs(dbl.a - 2133.33) < 0.01 && Math.abs(dbl.b - 1066.67) < 0.01);

const route = { farePerSeat: 800, routeDistanceKm: 100, stops: [{ kmFromStart: 0 }, { kmFromStart: 60 }, { kmFromStart: 100 }] };
const vehicle = { capacity: 4, serviceTaxPercentage: 5, adminCommissionPercentage: 10, ownerCommissionPercentage: 0 };
const q = quoteBooking({ route, vehicle, pickupStop: { kmFromStart: 0 }, dropStop: { kmFromStart: 100 }, seats: 1, others: [] });
assert.equal(q.maxBaseFare, 3200); assert.equal(q.maxTotal, 3360);
const q2 = quoteBooking({ route, vehicle, pickupStop: { kmFromStart: 60 }, dropStop: { kmFromStart: 100 }, seats: 1, others: [{ id: 'x', boardKm: 0, dropKm: 100, seatsBooked: 1 }] });
assert.equal(q2.maxBaseFare, 1280); assert.equal(q2.currentBaseFare, 640);
const settled = settleShares({ route, vehicle, bookings: [{ _id: 'a', boardKm: 0, dropKm: 100, seatsBooked: 1, fare: 3360 }, { _id: 'b', boardKm: 60, dropKm: 100, seatsBooked: 1, fare: 1344 }] });
assert.equal(settled[0].finalBaseFare, 2560); assert.equal(settled[1].finalBaseFare, 640);
assert.equal(settled[1].refund, 672); // 1344 charged - (640 + 5% tax 32)
assert.equal(settled[0].platformCommission, 256); assert.equal(settled[0].driverEarning, 2304);
console.log('pooling fare checks passed');
