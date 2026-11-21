/**
 * Car-pooling fare: the whole vehicle's fare is shared by the riders on it,
 * kilometre by kilometre.
 *
 *   full vehicle fare  F = farePerSeat x seats in the vehicle      (4 x 800 = 3200)
 *   route length       L = km from the first stop to the last      (100)
 *   one km of the trip costs                F / L                  (32 per km)
 *
 * Every stretch of road between two boarding / drop points is paid for by the
 * riders who are on the vehicle for that stretch, split in proportion to the
 * seats they booked. A rider alone on a stretch pays all of it; four riders
 * with one seat each pay a quarter each.
 *
 * Nobody can ever pay more than "alone on my stretch" - that is the amount
 * charged up front. When the trip is over the real shares are worked out and
 * the difference goes back to the rider.
 *
 * Routes that have no distance set (routeDistanceKm / stop kmFromStart) keep
 * the old behaviour: farePerSeat x seats, no sharing.
 */

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Passenger seats in a vehicle: seats drawn in its layout, else its capacity. */
export const seatCountOf = (vehicle = {}) => {
  const layout = Array.isArray(vehicle?.blueprint?.layout) ? vehicle.blueprint.layout : [];
  const drawn = layout.filter((item) => item?.type === 'seat').length;
  return drawn > 0 ? drawn : Math.max(1, num(vehicle?.capacity, 1));
};

/** Total km of the route: the set distance, else the farthest stop. */
export const routeLengthKm = (route = {}) => {
  const stops = [...(route.stops || []), ...(route.pickupPoints || []), ...(route.dropPoints || [])];
  const farthest = stops.reduce((max, s) => Math.max(max, num(s?.kmFromStart)), 0);
  return Math.max(num(route.routeDistanceKm), farthest);
};

export const stopKm = (stop) => num(stop?.kmFromStart);

/** True when the route can be priced by distance. */
export const isDistancePriced = (route = {}) => routeLengthKm(route) > 0;

export const fullVehicleFare = (route = {}, vehicle = {}) =>
  round2(num(route.farePerSeat) * seatCountOf(vehicle));

/**
 * Split F over the riders. `riders` = [{ id, board, drop, seats }].
 * Returns { shares: { id -> base share }, segments: [...], unusedKm }.
 */
export const shareFare = ({ totalFare, routeKm, riders }) => {
  const shares = Object.fromEntries(riders.map((r) => [String(r.id), 0]));
  const points = [...new Set(riders.flatMap((r) => [num(r.board), num(r.drop)]))].sort((a, b) => a - b);
  const segments = [];
  let unusedKm = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    const present = riders.filter((r) => num(r.board) <= from && num(r.drop) >= to);
    const km = to - from;
    if (present.length === 0) {
      unusedKm += km;
      continue;
    }
    const cost = (totalFare * km) / routeKm;
    const seatSum = present.reduce((sum, r) => sum + Math.max(1, num(r.seats, 1)), 0);
    for (const r of present) shares[String(r.id)] += (cost * Math.max(1, num(r.seats, 1))) / seatSum;
    segments.push({ from, to, km, cost: round2(cost), riders: present.length });
  }

  return { shares: Object.fromEntries(Object.entries(shares).map(([id, v]) => [id, round2(v)])), segments, unusedKm };
};

/** What a rider pays up front: alone on their stretch. */
export const maxBaseFare = ({ route, vehicle, boardKm, dropKm, seats }) => {
  if (!isDistancePriced(route)) return round2(num(route.farePerSeat) * Math.max(1, num(seats, 1)));
  return round2((fullVehicleFare(route, vehicle) * (dropKm - boardKm)) / routeLengthKm(route));
};

const taxOn = (base, pct) => round2((base * Math.max(0, Math.min(100, num(pct)))) / 100);

/**
 * Everything the rider needs to see before paying.
 * `others` = bookings already on this trip (confirmed / boarded).
 */
export const quoteBooking = ({ route, vehicle, pickupStop, dropStop, seats, others = [] }) => {
  const priced = isDistancePriced(route);
  const routeKm = routeLengthKm(route);
  const boardKm = priced ? stopKm(pickupStop) : 0;
  const dropKm = priced ? stopKm(dropStop) : 0;
  if (priced && !(dropKm > boardKm)) {
    return { error: 'Drop point must be after the pickup point on this route' };
  }

  const seatCount = seatCountOf(vehicle);
  const taxPct = Math.max(0, Math.min(100, num(vehicle.serviceTaxPercentage)));
  const maxBase = maxBaseFare({ route, vehicle, boardKm, dropKm, seats });
  const maxTax = taxOn(maxBase, taxPct);

  let currentBase = maxBase;
  let coRiders = 0;
  if (priced) {
    const me = { id: '__me__', board: boardKm, drop: dropKm, seats };
    const riders = [
      ...others.map((b) => ({ id: String(b._id || b.id), board: num(b.boardKm), drop: num(b.dropKm), seats: num(b.seatsBooked, 1) })),
      me,
    ];
    currentBase = shareFare({ totalFare: fullVehicleFare(route, vehicle), routeKm, riders }).shares.__me__;
    coRiders = others.filter((b) => num(b.boardKm) < dropKm && num(b.dropKm) > boardKm).length;
  }
  const currentTax = taxOn(currentBase, taxPct);

  return {
    distancePriced: priced,
    routeKm,
    boardKm,
    dropKm,
    segmentKm: priced ? round2(dropKm - boardKm) : 0,
    seats,
    seatsInVehicle: seatCount,
    farePerSeat: round2(route.farePerSeat),
    fullVehicleFare: fullVehicleFare(route, vehicle),
    taxPercentage: taxPct,
    // charged now
    maxBaseFare: maxBase,
    maxTaxAmount: maxTax,
    maxTotal: round2(maxBase + maxTax),
    // what it would be if the trip ran with the riders booked right now
    currentBaseFare: currentBase,
    currentTaxAmount: currentTax,
    currentTotal: round2(currentBase + currentTax),
    coRiders,
    floorTotal: priced ? round2(maxBase / Math.max(1, seatCount) + taxOn(maxBase / Math.max(1, seatCount), taxPct)) : round2(maxBase + maxTax),
  };
};

/**
 * Trip finished: final shares for the riders who boarded.
 * `bookings` = boarded bookings. Returns one row per booking.
 */
export const settleShares = ({ route, vehicle, bookings }) => {
  const priced = isDistancePriced(route);
  const taxPct = Math.max(0, Math.min(100, num(vehicle.serviceTaxPercentage)));
  const adminPct = Math.max(0, Math.min(100, num(vehicle.adminCommissionPercentage)));
  const ownerPct = vehicle.ownerId ? Math.max(0, Math.min(100, num(vehicle.ownerCommissionPercentage))) : 0;

  const shares = priced
    ? shareFare({
      totalFare: fullVehicleFare(route, vehicle),
      routeKm: routeLengthKm(route),
      riders: bookings.map((b) => ({ id: String(b._id), board: num(b.boardKm), drop: num(b.dropKm), seats: num(b.seatsBooked, 1) })),
    }).shares
    : Object.fromEntries(bookings.map((b) => [String(b._id), round2(num(route.farePerSeat) * num(b.seatsBooked, 1))]));

  return bookings.map((b) => {
    const base = shares[String(b._id)] ?? 0;
    const tax = taxOn(base, taxPct);
    const platform = round2((base * adminPct) / 100);
    const ownerShare = round2(((base - platform) * ownerPct) / 100);
    const charged = round2(num(b.fare));
    const finalFare = round2(base + tax);
    return {
      bookingId: String(b._id),
      finalBaseFare: base,
      finalTaxAmount: tax,
      finalFare,
      platformCommission: platform,
      ownerShare,
      driverEarning: round2(base - platform - ownerShare),
      refund: Math.max(0, round2(charged - finalFare)),
    };
  });
};
